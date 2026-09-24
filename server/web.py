"""Authenticated browser UI and read-only local/NAS media streaming."""
import base64
from collections import defaultdict
from datetime import datetime
import hashlib
import hmac
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import sys
import threading
import time
from urllib.parse import urlsplit, parse_qs
import uuid
from common import ROOT, CONTROL, query
from fanclub_auth import save_import
from library import collection

sys.path.insert(0, '/opt/vm1-backup')
from vm1_backup import NAS

PUBLIC = Path(__file__).with_name('public')
ORIGIN = os.environ.get('TAKANEKO_ORIGIN', 'https://vm1.learnfromidol.com:2083')
SESSIONS = {}
ATTEMPTS = defaultdict(list)
LOCK = threading.Lock()
NAS_SLOTS = threading.BoundedSemaphore(2)


class ReadOnlyNAS(NAS):
    def __init__(self):
        self.c = json.loads(Path('/etc/vm1-media/nas-readonly.json').read_text())
        self.host, self.port = self.c['host'], self.c['port']
        self.base = self.c['base_path'].rstrip('/')
        self.resolved, self.resolved_at = None, 0
        self.auth = 'Basic ' + base64.b64encode((self.c['username'] + ':' + self.c['password']).encode()).decode()


def selection(size, headers, etag):
    if any(v.strip().removeprefix('W/') in ('*', etag) for v in headers.get('If-None-Match', '').split(',')):
        return 304, 0, -1
    value = headers.get('Range')
    if headers.get('If-Range') and headers['If-Range'] != etag: value = None
    if not value: return 200, 0, size - 1
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', value)
    if not match or not any(match.groups()) or size == 0: raise ValueError('Range')
    start = int(match[1]) if match[1] else max(0, size - int(match[2]))
    end = min(size - 1, int(match[2])) if match[1] and match[2] else size - 1
    if start > end or start >= size: raise ValueError('Range')
    return 206, start, end


def open_local(relative):
    parts = relative.split('/')
    if not parts or parts[0] != 'complete' or any(p in ('', '.', '..') for p in parts): raise ValueError('Path')
    descriptor = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return os.fdopen(os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=descriptor), 'rb')
    finally: os.close(descriptor)


def public_post(row):
    return {key: row[key] for key in ('resource_key', 'title', 'member', 'kind', 'created_at', 'nas_available', 'local_available')}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass  # No credentials, private URLs or upstream errors in access logs.

    def respond(self, status, value, extra=None, mime='application/json; charset=utf-8'):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False,
            default=lambda item: item.isoformat() if isinstance(item, datetime) else str(item)).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for key, val in (extra or {}).items(): self.send_header(key, val)
        self.end_headers()
        if self.command != 'HEAD': self.wfile.write(body)

    def session(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            token = cookie['takaneko_session'].value
        except (KeyError, ValueError): return None
        with LOCK:
            session = SESSIONS.get(token)
            if session and session['expires'] > time.time(): return session
            SESSIONS.pop(token, None)
        return None

    def body(self):
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= 600 * 1024: raise ValueError('Invalid request size')
        return json.loads(self.rfile.read(length))

    def do_HEAD(self): self.do_GET()

    def do_GET(self):
        try: self.get()
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception: self.respond(503, {'error': '暫時無法讀取，請稍後再試。'})

    def get(self):
        url = urlsplit(self.path)
        if url.path in ('/', '/downloads', '/browse', '/library', '/app.js', '/style.css'):
            name = {'/': 'index.html', '/downloads': 'index.html', '/browse': 'index.html', '/library': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css'}[url.path]
            mime = {'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8'}[name]
            return self.respond(200, (PUBLIC / name).read_bytes(), mime=mime)
        if url.path == '/healthz': return self.respond(200, {'ok': True})
        session = self.session()
        if not session: return self.respond(401, {'error': '請先登入。'})
        if url.path == '/api/status':
            stats = query('SELECT count(*) AS posts,count(*) FILTER(WHERE nas_available) AS backed_up,count(*) FILTER(WHERE transfer_error)+(SELECT count(*) FROM desktop_thumbnail_backups WHERE transfer_error) AS backup_errors FROM posts', one=True)
            return self.respond(200, {'csrf': session['csrf'], 'hasToken': (CONTROL / 'session.json').exists() or (CONTROL / 'token').exists(),
                                    'settings': query('SELECT * FROM settings WHERE id=1', one=True),
                                    'job': query('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1', one=True), 'stats': stats})
        if url.path in ('/api/posts', '/api/library'):
            try: result = collection(parse_qs(url.query), multimedia=url.path == '/api/library')
            except ValueError: return self.respond(400, {'error': '請檢查頁碼與媒體類型。'})
            return self.respond(200, result)
        if url.path == '/api/post':
            key = parse_qs(url.query).get('key', [''])[0]
            row = query('SELECT * FROM posts WHERE resource_key=%s', (key,), one=True)
            if not row: return self.respond(404, {'error': '找不到投稿。'})
            return self.respond(200, {**public_post(row), 'body': row['body'], 'media': query('SELECT media_id,mime,variant,original_id,width,height FROM media WHERE resource_key=%s ORDER BY relative_path', (key,))})
        if re.fullmatch('/media/[a-f0-9]{64}', url.path): return self.media(url.path.split('/')[-1])
        self.respond(404, {'error': '找不到頁面。'})

    def do_POST(self):
        try:
            if self.headers.get('Origin') != ORIGIN: return self.respond(403, {'error': '請從本站操作。'})
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json': raise ValueError('JSON required')
            data = self.body()
            if self.path == '/api/login': return self.login(data)
            session = self.session()
            if not session: return self.respond(401, {'error': '請先登入。'})
            if not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), session['csrf']):
                return self.respond(403, {'error': '登入已更新，請重新整理。'})
            if self.path == '/api/logout':
                with LOCK:
                    for token, value in list(SESSIONS.items()):
                        if value is session: SESSIONS.pop(token)
                return self.respond(200, {'ok': True}, {'Set-Cookie': 'takaneko_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'})
            if self.path == '/api/settings':
                concurrency = int(data['concurrency'])
                if not 1 <= concurrency <= 100 or not isinstance(data['blogs'], bool): raise ValueError('Settings')
                token = str(data.get('token', '')).strip()
                if token:
                    if len(token) > 8192 or '\n' in token or '\r' in token: raise ValueError('Token')
                    temp = CONTROL / ('token-' + secrets.token_hex(8))
                    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
                    with os.fdopen(fd, 'w') as stream: stream.write(token)
                    temp.replace(CONTROL / 'token')
                query('UPDATE settings SET concurrency=%s,blogs=%s WHERE id=1', (concurrency, data['blogs']))
                return self.respond(200, {'ok': True})
            if self.path == '/api/import-cookies':
                try: save_import(data.get('content'), data.get('refreshToken'))
                except ValueError as error: return self.respond(400, {'error': str(error)})
                return self.respond(200, {'ok': True})
            if self.path == '/api/automation':
                enabled = data['enabled']
                hours = int(data['intervalHours'])
                if not isinstance(enabled, bool) or not 1 <= hours <= 168: raise ValueError('Schedule')
                query("UPDATE settings SET auto_enabled=%s,auto_interval_hours=%s,auto_next_at=CASE WHEN %s THEN now() ELSE NULL END,auto_message=%s WHERE id=1",
                      (enabled, hours, enabled, '等待排程檢查' if enabled else '已停用'))
                return self.respond(200, {'ok': True})
            if self.path == '/api/start':
                if not ((CONTROL / 'session.json').exists() or (CONTROL / 'token').exists()): return self.respond(400, {'error': '請先匯入 Fanclub cookies／登入資料。'})
                if query("SELECT 1 FROM jobs WHERE status IN ('queued','running','paused') LIMIT 1", one=True):
                    return self.respond(409, {'error': '已有下載工作進行中。'})
                query("INSERT INTO jobs(id,status,message) VALUES(%s,'queued','準備下載')", (uuid.uuid4().hex,))
                return self.respond(202, {'ok': True})
            if self.path == '/api/control':
                command = data['command']
                if command not in ('pause', 'run', 'cancel'): raise ValueError('Command')
                query("UPDATE jobs SET command=%s,updated_at=now() WHERE status IN ('queued','running','paused')", (command,))
                return self.respond(200, {'ok': True})
            self.respond(404, {'error': '找不到操作。'})
        except (ValueError, KeyError, TypeError): self.respond(400, {'error': '請檢查輸入內容。'})
        except Exception: self.respond(503, {'error': '操作暫時失敗，請稍後再試。'})

    def login(self, data):
        client = self.headers.get('X-Real-IP', self.client_address[0])
        with LOCK:
            now = time.time()
            for ip in list(ATTEMPTS):
                ATTEMPTS[ip] = [t for t in ATTEMPTS[ip] if now - t < 900]
                if not ATTEMPTS[ip]: del ATTEMPTS[ip]
            if len(ATTEMPTS[client]) >= 10: return self.respond(429, {'error': '登入嘗試過多，請 15 分鐘後重試。'})
            ATTEMPTS[client].append(now)
        config = json.loads(Path(os.environ.get('TAKANEKO_AUTH', '/etc/takaneko/auth.json')).read_text())
        password = str(data.get('password', '')).encode()
        derived = hashlib.scrypt(password, salt=bytes.fromhex(config['salt']), n=16384, r=8, p=1).hex()
        if not hmac.compare_digest(derived, config['hash']): return self.respond(401, {'error': '管理密碼不正確。'})
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with LOCK:
            ATTEMPTS.pop(client, None)
            for old, value in list(SESSIONS.items()):
                if value['expires'] < time.time(): SESSIONS.pop(old)
            SESSIONS[token] = {'csrf': csrf, 'expires': time.time() + 43200}
        self.respond(200, {'ok': True, 'csrf': csrf}, {'Set-Cookie': f'takaneko_session={token}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict'})

    def media(self, media_id):
        row = query("SELECT * FROM media WHERE media_id=%s AND owner_id='owner' AND permission='private'", (media_id,), one=True)
        if not row: return self.respond(404, {'error': '找不到媒體。'})
        etag = '"' + row['sha256'] + '"'
        try: status, start, end = selection(row['size'], self.headers, etag)
        except ValueError: return self.respond(416, b'', {'Content-Range': f"bytes */{row['size']}"})
        if status == 304: return self.respond(304, b'', {'ETag': etag})
        source = con = None
        acquired = False
        started = False
        try:
            try:
                source = open_local(row['relative_path'])
                if os.fstat(source.fileno()).st_size != row['size']: source.close(); source = None
            except FileNotFoundError: pass
            if source: source.seek(start)
            else:
                # Refresh availability after an interrupted publication/cleanup.
                row = query('SELECT * FROM media WHERE media_id=%s', (media_id,), one=True)
                if not row['nas_available'] or not row['nas_path'].startswith(('takaneko/media/', 'takaneko/thumbnails/')) or '..' in row['nas_path'].split('/'):
                    return self.respond(503, {'error': '媒體暫時無法讀取，請稍後重試。'}, {'Retry-After': '30'})
                acquired = NAS_SLOTS.acquire(timeout=10)
                if not acquired: return self.respond(503, {'error': '讀取忙碌中，請稍後重試。'})
                nas = ReadOnlyNAS()
                con = nas.connect()
                con.sock.settimeout(30)
                headers = {'Authorization': nas.auth}
                if status == 206: headers['Range'] = f'bytes={start}-{end}'
                con.request(self.command, nas.path(row['nas_path']), headers=headers)
                source = con.getresponse()
                if source.status != status or int(source.getheader('Content-Length', '-1')) != end - start + 1:
                    raise OSError('NAS unavailable')
                if status == 206 and source.getheader('Content-Range') != f"bytes {start}-{end}/{row['size']}": raise OSError('Invalid range')
            self.send_response(status)
            for key, value in {'Content-Type': row['mime'], 'Content-Length': str(end - start + 1), 'ETag': etag,
                               'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff'}.items():
                self.send_header(key, value)
            if status == 206: self.send_header('Content-Range', f"bytes {start}-{end}/{row['size']}")
            self.end_headers()
            started = True
            if self.command == 'HEAD': return
            remaining = end - start + 1
            while remaining:
                chunk = source.read(min(1024 * 1024, remaining))
                if not chunk: raise OSError('Incomplete media')
                self.wfile.write(chunk)
                remaining -= len(chunk)
        except Exception:
            if not started: self.respond(503, {'error': '媒體來源暫時無法讀取。'}, {'Retry-After': '30'})
            else: self.close_connection = True
        finally:
            if source: source.close()
            if con: con.close()
            if acquired: NAS_SLOTS.release()


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('TAKANEKO_PORT', '43130'))), Handler).serve_forever()
