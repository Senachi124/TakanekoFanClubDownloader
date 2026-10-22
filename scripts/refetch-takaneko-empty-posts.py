"""Refetch explicitly selected empty posts; preserve old immutable snapshots."""
import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.request import Request, urlopen

sys.path.insert(0, '/opt/takaneko/current/server')
from common import ROOT, db, query
from fanclub_auth import get_token
from archive_layout import readable_folder, safe_path, refresh_record
from post_dates import publication_date
from worker import Bridge, digest_file
from PIL import Image, ImageOps

def eligible(post):
    return post['kind'] == 'post' and re.fullmatch(r'\d{4}-\d{2}-\d{2}_\d{6}_untitled', post['title']) and not post['nas_available'] and not post['nas_layout_ready'] and not post['nas_migration_pending'] and len(post['body']) < 150

def originals(ids):
    rows = query('SELECT * FROM posts WHERE source_id=ANY(%s) AND kind=%s', (ids, 'post'))
    assert len(rows) == len(ids) and all(eligible(p) for p in rows), 'Targets no longer match empty unpublished posts'
    assert not query('SELECT 1 FROM media WHERE resource_key=ANY(%s)', ([p['resource_key'] for p in rows],))
    return rows

def worker(ids):
    assert os.geteuid() != 0
    os.umask(0o027)
    assert not Path('/run/vm1-services-backup.freeze').exists()
    posts = originals(ids)
    job_id = 'manual-refetch-' + uuid.uuid4().hex
    with db() as conn:
        assert not conn.execute("SELECT 1 FROM jobs WHERE status IN ('queued','running','paused')").fetchone()
        conn.execute("INSERT INTO jobs(id,status,total,message,trigger) VALUES(%s,'running',%s,'重新抓取指定空白投稿','manual')", (job_id, len(posts)))
    bridge = None
    try:
        bridge = Bridge()
        staged = []
        for post in posts:
            token = get_token()
            req = Request('https://api.takanekofc.com/auth/notifications/' + post['source_id'], headers={'Authorization': token})
            with urlopen(req, timeout=30) as response: detail = json.load(response)
            assert detail.get('title') and any(v for k, v in detail.items() if k.startswith(('body', 'image')) or k in ('message', 'content', 'text')), 'Source is still empty'
            stage = ROOT / 'staging' / job_id / post['source_id']
            stage.mkdir(parents=True, mode=0o750)
            result = bridge.call(action='download', token=token, item={'id': post['source_id'], 'kind': 'post', 'title': detail['title']}, directory=str(stage))
            folder = Path(result['folder'])
            assert folder.resolve().is_relative_to(stage.resolve())
            assert (folder / '.post-id').read_text().strip() == post['source_id']
            body = (folder / 'index.md').read_text()
            assert len(body) > len(post['body']) and body.startswith('# ' + detail['title'] + '\n')
            assert result['member'] == post['member']
            for file in list(folder.iterdir()):
                assert file.is_file() and not file.is_symlink()
                if file.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp', '.gif'):
                    with Image.open(file) as im:
                        im = ImageOps.exif_transpose(im); im.thumbnail((480, 480))
                        im.convert('RGB').save(folder / (file.name + '.thumb.jpg'), quality=82)
            version = hashlib.sha256(''.join(p.name + digest_file(p) for p in sorted(folder.iterdir())).encode()).hexdigest()
            updated = {**post, 'title': detail['title'], 'body': body, 'version': version}
            relative = readable_folder(updated)
            destination = safe_path(str(relative))
            assert not destination.exists(), 'Version destination already exists'
            destination.parent.mkdir(parents=True, mode=0o750)
            for file in folder.iterdir(): file.chmod(0o640)
            folder.chmod(0o750); folder.rename(destination)
            updated.update(folder=str(relative), nas_folder='takaneko/media/' + relative.relative_to('complete').as_posix())
            media = []
            for file in destination.iterdir():
                mime = mimetypes.guess_type(file.name)[0] or ''
                if not mime.startswith(('image/', 'video/')) or mime == 'image/svg+xml': continue
                thumb = file.name.endswith('.thumb.jpg')
                ident = lambda name: hashlib.sha256((post['resource_key'] + ':' + version + ':' + name).encode()).hexdigest()
                width = height = None
                if mime.startswith('image/'):
                    with Image.open(file) as im: width, height = im.size
                media.append((ident(file.name), post['resource_key'], version, 'thumbnail' if thumb else 'original', str(relative / file.name), updated['nas_folder'] + '/' + file.name, digest_file(file), file.stat().st_size, mime, width, height, ident(file.name[:-10]) if thumb else None))
            staged.append((post, updated, media))
        with db() as conn:
            conn.execute("SET LOCAL lock_timeout='5s'")
            conn.execute('LOCK TABLE backup_jobs IN SHARE ROW EXCLUSIVE MODE')
            assert not conn.execute("SELECT 1 FROM backup_jobs WHERE status='running'").fetchone(), 'Backup active; new files retained'
            for old, new, media in staged:
                live = conn.execute('SELECT * FROM posts WHERE resource_key=%s FOR UPDATE', (old['resource_key'],)).fetchone()
                assert live == old and eligible(live), 'Post changed during refetch'
                assert not conn.execute('SELECT 1 FROM media WHERE resource_key=%s', (old['resource_key'],)).fetchone()
                conn.execute('UPDATE posts SET title=%s,body=%s,folder=%s,nas_folder=%s,version=%s,local_available=true,transfer_error=false WHERE resource_key=%s', (new['title'], new['body'], new['folder'], new['nas_folder'], new['version'], old['resource_key']))
                for item in media:
                    conn.execute('INSERT INTO media(media_id,resource_key,version,variant,relative_path,nas_path,sha256,size,mime,width,height,original_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)', item)
            conn.execute("UPDATE jobs SET status='completed',completed=total,message='指定空白投稿已重新抓取；舊存檔保留',updated_at=now() WHERE id=%s", (job_id,))
        results = []
        for old, new, media in staged:
            refresh_record(old['resource_key'])
            assert safe_path(old['folder']).is_dir()
            assert query('SELECT title FROM posts WHERE resource_key=%s', (old['resource_key'],), one=True)['title'] == new['title']
            for item in media: assert digest_file(safe_path(item[4])) == item[6]
            results.append({'source_id': old['source_id'], 'member': new['member'], 'title': new['title'], 'body_characters': len(new['body']), 'original_media': sum(m[3] == 'original' for m in media), 'old_files_preserved': True})
        print(json.dumps({'job_id': job_id, 'results': results, 'nas_uploaded': False}, ensure_ascii=False))
    except Exception:
        query("UPDATE jobs SET status='failed',failed=total,message='指定重抓未完成；新舊檔案均保留，請檢查',updated_at=now() WHERE id=%s AND status='running'", (job_id,))
        raise
    finally:
        if bridge:
            bridge.process.terminate(); bridge.process.wait(timeout=15)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', action='store_true')
    parser.add_argument('--ids', nargs='+', required=True)
    args = parser.parse_args()
    assert len(set(args.ids)) == len(args.ids) and all(re.fullmatch(r'[A-Za-z0-9_-]{1,128}', i) for i in args.ids)
    if args.worker: return worker(args.ids)
    assert os.geteuid() == 0
    os.umask(0o077)
    backup = Path('/var/backups/vm1-admin') / ('takaneko-refetch-' + datetime.now(ZoneInfo('Asia/Hong_Kong')).strftime('%Y%m%dT%H%M%S%z'))
    backup.mkdir(mode=0o700)
    posts = originals(args.ids)
    (backup / 'posts-before.json').write_text(json.dumps(posts, default=str, ensure_ascii=False, indent=2))
    for n, post in enumerate(posts):
        (backup / f'original-{n}.json').write_text(json.dumps({str(p): digest_file(p) for p in safe_path(post['folder']).iterdir() if p.is_file()}, ensure_ascii=False))
    completed = subprocess.run(['runuser', '-u', 'takanekowork', '-g', 'takaneko-read', '-G', 'vm1-backup', '-G', 'takaneko-control', '--', '/usr/bin/python3', '-', '--worker', '--ids', *args.ids], input=Path(__file__).read_text(), capture_output=True, text=True, cwd='/opt/takaneko/current', env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'TZ': 'Asia/Hong_Kong'}, timeout=300)
    (backup / 'worker-output.txt').write_text(completed.stdout + completed.stderr)
    if completed.returncode: raise RuntimeError('Refetch failed; private diagnostics retained in ' + str(backup))
    result = json.loads(completed.stdout)
    result['rollback'] = str(backup)
    (backup / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__': main()
