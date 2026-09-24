"""Single download coordinator; immutable publications and scheduled NAS transfers."""
import concurrent.futures
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import uuid
from PIL import Image, ImageOps
from common import ROOT, CONTROL, db, query, initialize
from fanclub_auth import get_token

sys.path.insert(0, '/opt/vm1-backup')
import vm1_backup as backup

SERVICE = 'takaneko'
MIN_FREE = 5 * 1024**3
BACKUP_SLOTS = threading.BoundedSemaphore(4)


class Bridge:
    def __init__(self):
        self.process = subprocess.Popen(['node', str(Path(__file__).with_name('bridge.js'))],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        text=True, bufsize=1)
        self.lock = threading.Lock()
        self.pending = {}
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        for line in self.process.stdout:
            try:
                value = json.loads(line)
                with self.lock:
                    future = self.pending.pop(value['id'], None)
                if future:
                    if value.get('error'): future.set_exception(RuntimeError(value['error']))
                    else: future.set_result(value['result'])
            except (ValueError, KeyError):
                continue  # Legacy video progress output is not protocol data.
        with self.lock:
            for future in self.pending.values(): future.set_exception(RuntimeError('Download engine stopped'))
            self.pending.clear()

    def call(self, **value):
        request_id = uuid.uuid4().hex
        future = concurrent.futures.Future()
        with self.lock:
            self.pending[request_id] = future
            self.process.stdin.write(json.dumps({**value, 'requestId': request_id}) + '\n')
            self.process.stdin.flush()
        return future.result()


def digest_file(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def publish(key, item, result, staging):
    folder = Path(result['folder'])
    if not folder.resolve().is_relative_to(staging.resolve()): raise ValueError('Invalid output')
    original_files = [p for p in folder.iterdir() if p.is_file() and not p.name.startswith('.')]
    for file in original_files:
        if file.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp', '.gif'):
            with Image.open(file) as image:
                image = ImageOps.exif_transpose(image)
                image.thumbnail((480, 480))
                image.convert('RGB').save(folder / (file.name + '.thumb.jpg'), quality=82)
    version = hashlib.sha256(''.join(p.name + digest_file(p) for p in sorted(folder.iterdir()) if p.is_file()).encode()).hexdigest()
    identity = hashlib.sha256(key.encode()).hexdigest()
    relative = Path('complete') / identity / version
    destination = ROOT / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        for file in folder.iterdir(): file.chmod(0o640)
        folder.chmod(0o750)
        folder.rename(destination)
    nas_folder = f'takaneko/media/{identity}/{version}'
    body = (destination / 'index.md').read_text()
    with db() as conn:
        conn.execute('''INSERT INTO posts(resource_key,source_id,kind,title,member,body,folder,nas_folder,version)
                        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(resource_key) DO NOTHING''',
                     (key, item['id'], item['kind'], result['title'], result['member'], body, str(relative), nas_folder, version))
        for file in destination.iterdir():
            mime = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
            if not mime.startswith(('image/', 'video/')) or mime == 'image/svg+xml': continue
            thumb = file.name.endswith('.thumb.jpg')
            media_id = hashlib.sha256((key + ':' + version + ':' + file.name).encode()).hexdigest()
            original_id = hashlib.sha256((key + ':' + version + ':' + file.name[:-10]).encode()).hexdigest() if thumb else None
            width = height = None
            if mime.startswith('image/'):
                with Image.open(file) as image: width, height = image.size
            conn.execute('''INSERT INTO media(media_id,resource_key,version,variant,relative_path,nas_path,sha256,size,mime,width,height,original_id)
                            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',
                         (media_id, key, version, 'thumbnail' if thumb else 'original', str(relative / file.name),
                          nas_folder + '/' + file.name, digest_file(file), file.stat().st_size, mime, width, height, original_id))
    return destination


def process_item(bridge, token, item, job_id):
    key = f"takaneko:{item['kind']}:{item['id']}:v1"
    existing = query('SELECT folder FROM posts WHERE resource_key=%s', (key,), one=True)
    with BACKUP_SLOTS:
        decision = backup.claim(SERVICE, key)
    if decision['action'] in ('skip', 'resume_transfer'): return
    if decision['action'] != 'download': raise RuntimeError('Resource is busy; retry later')
    lease = decision['lease_token']
    if existing:
        # Recover a crash between catalog commit and the helper's downloaded transition.
        with BACKUP_SLOTS:
            backup.downloaded(SERVICE, key, lease, ROOT / existing['folder'])
        return
    stop = threading.Event()
    lost = threading.Event()

    def renew():
        while not stop.wait(300):
            try:
                with BACKUP_SLOTS:
                    subprocess.run(['vm1-backup', '--service', SERVICE, 'renew', key, '--token', lease], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception: lost.set(); return

    threading.Thread(target=renew, daemon=True).start()
    staging = ROOT / 'staging' / hashlib.sha256(key.encode()).hexdigest() / uuid.uuid4().hex
    staging.mkdir(parents=True)
    try:
        if shutil.disk_usage(ROOT).free < MIN_FREE: raise RuntimeError('Low disk space; download paused')
        result = bridge.call(action='download', item=item, token=get_token(), directory=str(staging))
        if lost.is_set(): raise RuntimeError('Download lease expired')
        destination = publish(key, item, result, staging)
        with BACKUP_SLOTS:
            backup.downloaded(SERVICE, key, lease, destination)
        # Only scratch data (duplicate gallery images) is removed; completed originals are retained.
        shutil.rmtree(staging)
    except Exception:
        try:
            with BACKUP_SLOTS:
                subprocess.run(['vm1-backup', '--service', SERVICE, 'fail', key, '--token', lease, '--error', 'Download incomplete; retained staging'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception: pass
        raise
    finally:
        stop.set()


def run_job(bridge, job):
    job_id = job['id']
    settings = query('SELECT * FROM settings WHERE id=1', one=True)
    token = get_token()
    items = bridge.call(action='list', token=token, blogs=settings['blogs'])
    items = list({(i['kind'], i['id']): i for i in items}.values())
    query("UPDATE jobs SET total=%s,message='下載中',updated_at=now() WHERE id=%s", (len(items), job_id))
    pending = iter(items)
    active = set()
    cancelled = False
    with concurrent.futures.ThreadPoolExecutor(max_workers=settings['concurrency']) as pool:
        exhausted = False
        while active or not exhausted:
            command = query('SELECT command FROM jobs WHERE id=%s', (job_id,), one=True)['command']
            cancelled = command == 'cancel'
            low_disk = shutil.disk_usage(ROOT).free < MIN_FREE
            paused = command == 'pause' or low_disk
            query('UPDATE jobs SET status=%s,message=%s,updated_at=now() WHERE id=%s',
                  ('paused' if paused else 'running', '磁碟空間不足，已暫停' if low_disk else ('已暫停；等待進行中的項目完成' if paused else '下載中'), job_id))
            if cancelled: exhausted = True
            while not exhausted and not paused and len(active) < settings['concurrency']:
                item = next(pending, None)
                if item is None: exhausted = True; break
                active.add(pool.submit(process_item, bridge, token, item, job_id))
            if not active:
                if not exhausted: time.sleep(2)
                continue
            done, active = concurrent.futures.wait(active, timeout=2, return_when=concurrent.futures.FIRST_COMPLETED)
            for future in done:
                failed = future.exception() is not None
                query('UPDATE jobs SET completed=completed+1,failed=failed+%s,updated_at=now() WHERE id=%s', (int(failed), job_id))
    row = query('SELECT failed FROM jobs WHERE id=%s', (job_id,), one=True)
    status = 'cancelled' if cancelled else ('failed' if row['failed'] else 'completed')
    query('UPDATE jobs SET status=%s,message=%s,updated_at=now() WHERE id=%s',
          (status, '已停止；完成的檔案已保留' if cancelled else ('部分下載失敗，可重試' if row['failed'] else '下載完成'), job_id))


def transfer():
    # Only a timer invokes this function; reading media never triggers a transfer.
    for post in query('SELECT * FROM posts WHERE NOT nas_available ORDER BY created_at'):
        try:
            decision = backup.claim(SERVICE, post['resource_key'])
            if decision['action'] == 'busy': continue
            if decision['action'] == 'download':
                backup.downloaded(SERVICE, post['resource_key'], decision['lease_token'], ROOT / post['folder'])
            backup.send_directory(service=SERVICE, source=ROOT / post['folder'], destination=post['nas_folder'],
                                  resource_key=post['resource_key'], delete_source=False)
            with db() as conn:
                conn.execute('UPDATE posts SET nas_available=true,transfer_error=false WHERE resource_key=%s', (post['resource_key'],))
                conn.execute('UPDATE media SET nas_available=true,nas_verified_at=now() WHERE resource_key=%s', (post['resource_key'],))
        except Exception:
            query('UPDATE posts SET transfer_error=true WHERE resource_key=%s', (post['resource_key'],))
            print('NAS transfer unavailable; originals retained; scheduled retry pending', flush=True)
            return 1
    return 0


def main():
    initialize()
    if '--initialize' in sys.argv: return 0
    if '--transfer' in sys.argv: return transfer()
    query("UPDATE jobs SET status='failed',message='服務重啟，請重新開始；已完成檔案保留' WHERE status IN ('running','paused')")
    bridge = Bridge()
    while True:
        job = query("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1", one=True)
        if not job: time.sleep(2); continue
        if query('SELECT 1 FROM posts WHERE transfer_error LIMIT 1', one=True):
            query("UPDATE jobs SET status='failed',message='NAS 備份失敗，恢復備份後再開始下載' WHERE id=%s", (job['id'],))
            continue
        query("UPDATE jobs SET status='running',message='取得投稿清單',updated_at=now() WHERE id=%s", (job['id'],))
        try:
            if bridge.process.poll() is not None: bridge = Bridge()
            run_job(bridge, job)
        except Exception as error:
            message = str(error) if str(error).startswith('Fanclub HTTP ') else '下載失敗；請檢查 Fanclub token 及服務狀態'
            query("UPDATE jobs SET status='failed',message=%s,updated_at=now() WHERE id=%s", (message, job['id']))


if __name__ == '__main__':
    sys.exit(main())
