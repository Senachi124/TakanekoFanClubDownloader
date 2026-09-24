"""Run on VM1 as root. Exercises real app/auth/catalog/media with a disposable fixture."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import shutil
import sys
import uuid
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'server'))
from common import ROOT, query
from worker import publish, backup

ORIGIN = 'https://vm1.learnfromidol.com:2083'
cookie = csrf = ''


def request(method, path, data=None, headers=None, authenticated=True):
    conn = http.client.HTTPConnection('127.0.0.1', 43130, timeout=30)
    h = {'Origin': ORIGIN, **(headers or {})}
    if authenticated:
        h['Cookie'] = cookie
        h.setdefault('X-CSRF-Token', csrf)
    body = None
    if data is not None: body = json.dumps(data); h['Content-Type'] = 'application/json'
    conn.request(method, path, body, h)
    response = conn.getresponse()
    value = response.read()
    result = response.status, dict(response.getheaders()), value
    conn.close()
    return result


def check(condition, message):
    if not condition: raise AssertionError(message)
    print('PASS ' + message)


check(request('GET', '/api/status', authenticated=False)[0] == 401, 'unauthenticated catalog denied')
password = Path('/etc/takaneko/admin-password').read_text().strip()
status, headers, body = request('POST', '/api/login', {'password': password}, authenticated=False)
check(status == 200, 'admin login')
cookie = headers['Set-Cookie'].split(';')[0]
check(all(flag in headers['Set-Cookie'] for flag in ['Secure', 'HttpOnly', 'SameSite=Strict']), 'secure session cookie')
csrf = json.loads(body)['csrf']
check(request('POST', '/api/settings', {'concurrency': 100, 'blogs': True}, {'X-CSRF-Token': 'wrong'})[0] == 403, 'CSRF denied')
settings = json.loads(request('GET', '/api/status')[2])['settings']
check(request('POST', '/api/settings', {'concurrency': 100, 'blogs': settings['blogs']})[0] == 200, 'concurrency 100 saved')
check(json.loads(request('GET', '/api/status')[2])['settings']['concurrency'] == 100, 'concurrency 100 round trip')
check(request('POST', '/api/settings', {'concurrency': 101, 'blogs': True})[0] == 400, 'concurrency above 100 rejected')
request('POST', '/api/settings', settings)

identity = 'selftest-' + uuid.uuid4().hex
key = 'takaneko:test:' + identity + ':v1'
staging = ROOT / 'staging' / identity
staging.mkdir()
folder = staging / 'fixture'
folder.mkdir()
Image.new('RGB', (32, 24), '#698254').save(folder / 'sample.png')
(folder / 'index.md').write_text('# Integration fixture\nNo private content.\n')
(folder / '.post-id').write_text(identity)
published = None
try:
    decision = backup.claim('takaneko', key)
    published = publish(key, {'id': identity, 'kind': 'test'}, {'folder': str(folder), 'title': 'Integration fixture', 'member': 'Self-test'}, staging)
    # The test runs as root, but completed files must match production reader permissions.
    gid = ROOT.stat().st_gid
    for path in [published.parent, published, *published.iterdir()]: os.chown(path, -1, gid)
    published.parent.chmod(0o750)
    backup.downloaded('takaneko', key, decision['lease_token'], published)
    media = query("SELECT * FROM media WHERE resource_key=%s AND variant='original'", (key,), one=True)
    url = '/media/' + media['media_id']
    check(request('GET', url, authenticated=False)[0] == 401, 'private media denied without login')
    status, headers, body = request('GET', url)
    check(status == 200 and hashlib.sha256(body).hexdigest() == media['sha256'], 'published local media bytes')
    check(request('GET', url, headers={'If-None-Match': headers['ETag']})[0] == 304, 'authenticated ETag revalidation')
    partial = request('GET', url, headers={'Range': 'bytes=3-8'})
    check(partial[0] == 206 and partial[2] == body[3:9], 'local partial media')
    head = request('HEAD', url)
    check(head[0] == 200 and int(head[1]['Content-Length']) == len(body) and not head[2], 'HEAD content length')
    check(request('GET', url, headers={'Range': 'bytes=999999-'})[0] == 416, 'invalid range denied')
    check(request('GET', '/media/../../etc/passwd')[0] == 404, 'path traversal denied')
    if '--nas' in sys.argv:
        post = query('SELECT * FROM posts WHERE resource_key=%s', (key,), one=True)
        backup.send_directory('takaneko', published, post['nas_folder'], key, delete_source=False)
        query('UPDATE media SET nas_available=true,nas_verified_at=now() WHERE resource_key=%s', (key,))
        local = ROOT / media['relative_path']
        held = local.with_suffix('.held')
        local.rename(held)
        try:
            full = request('GET', url)
            check(full[0] == 200 and full[2] == body, 'NAS fallback bytes through read-only account')
            partial = request('GET', url, headers={'Range': 'bytes=3-8'})
            check(partial[0] == 206 and partial[2] == body[3:9], 'NAS partial media')
            check(request('HEAD', url)[0] == 200, 'NAS HEAD')
        finally: held.rename(local)
finally:
    query('DELETE FROM media WHERE resource_key=%s', (key,))
    query('DELETE FROM posts WHERE resource_key=%s', (key,))
    if published and published.is_relative_to(ROOT / 'complete'): shutil.rmtree(published.parent)
    shutil.rmtree(staging)
print('Integration verification complete; temporary catalog/local fixture removed. NAS/helper audit record retained when used.')
