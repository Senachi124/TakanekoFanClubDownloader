"""Independent, durable NAS queue. A backup failure never changes download jobs."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time
import uuid
from common import ROOT, db, query, initialize
from archive_layout import safe_path, refresh_record
sys.path.insert(0, '/opt/vm1-backup')
import vm1_backup as backup


def enqueue(trigger='manual'):
    return query('INSERT INTO backup_jobs(id,trigger) VALUES(%s,%s) ON CONFLICT DO NOTHING RETURNING id', (uuid.uuid4().hex,trigger), one=True)


def nas_folder(post):
    if not post['folder'].startswith('complete/members/'): raise ValueError('Readable VM layout required')
    return 'takaneko/media/' + Path(post['folder']).relative_to('complete').as_posix()


def media_destination(post, item):
    folder = nas_folder(post)
    if item['variant'] == 'thumbnail' and not item['relative_path'].startswith(post['folder']+'/'):
        return folder.removesuffix('/files') + '/previews/' + item['media_id'] + '.jpg'
    return folder + '/' + Path(item['relative_path']).name


def nas_record(post, media):
    parent = nas_folder(post).removesuffix('/files')
    return {'schema_version':2, **{k:post[k] for k in ('resource_key','source_id','member','kind','title','version')},
            'published_at':post['created_at'].isoformat(), 'timezone':'Asia/Tokyo', 'text':'index.md',
            'media':[{**{k:m[k] for k in ('media_id','variant','mime','sha256','size','original_id')},
                      'path':media_destination(post,m).removeprefix(parent+'/')} for m in media]}


def prepare(post, media):
    """Freeze a separate transfer source; mutable VM sidecars never enter its manifest."""
    name = hashlib.sha256((post['resource_key']+':'+post['version']+':nas-layout-v2').encode()).hexdigest()
    parent = ROOT/'nas-outbox'
    parent.mkdir(mode=0o700,exist_ok=True)
    target = parent/name
    if target.exists(): return target
    staging = parent/(name+'.part-'+uuid.uuid4().hex)
    staging.mkdir(mode=0o700)
    destination = nas_folder(post).removesuffix('/files')
    if post['local_available']:
        (staging/'files').mkdir()
        for file in safe_path(post['folder']).iterdir():
            if file.is_symlink() or not file.is_file(): raise ValueError('Invalid completed file')
            os.link(file,staging/'files'/file.name)
    for item in media:
        if not item['local_available']:
            if not item['nas_available'] or item['nas_path'] != media_destination(post,item):
                raise ValueError('NAS original has not migrated yet')
            continue
        source = safe_path(item['relative_path'])
        with source.open('rb') as stream: digest = hashlib.file_digest(stream,'sha256').hexdigest()
        if source.stat().st_size != item['size'] or digest != item['sha256']: raise ValueError('Local checksum mismatch')
        output = staging/media_destination(post,item).removeprefix(destination+'/')
        output.parent.mkdir(parents=True,exist_ok=True)
        if not output.exists(): os.link(source,output)
    (staging/'index.md').write_text(post['body'],encoding='utf-8')
    (staging/'record.json').write_text(json.dumps(nas_record(post,media),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    staging.rename(target)
    return target


def run_job(job):
    job_id = job['id']
    posts = query('SELECT * FROM posts WHERE NOT nas_layout_ready AND NOT nas_migration_pending ORDER BY created_at,resource_key')
    query("UPDATE backup_jobs SET status='running',total=%s,message='準備不可變備份副本',updated_at=now() WHERE id=%s", (len(posts),job_id))
    original_nas = backup.NAS
    seen = set()

    class ReportingNAS(original_nas):
        def put_verified(self, local, remote, info):
            query("UPDATE backup_jobs SET current_item=%s,message='傳送並回讀校驗中',updated_at=now() WHERE id=%s", (Path(local).name,job_id))
            super().put_verified(local,remote,info)
            if remote not in seen:
                seen.add(remote)
                query('UPDATE backup_jobs SET files_done=files_done+1,bytes_done=bytes_done+%s,updated_at=now() WHERE id=%s', (info['size'],job_id))

    # Only this dedicated process sees the progress adapter. Shared helper source stays untouched.
    backup.NAS = ReportingNAS
    try:
        for post in posts:
            try:
                query("UPDATE backup_jobs SET current_item=%s,message='準備檔案與校驗清單',updated_at=now() WHERE id=%s", (post['member']+' · '+post['title'],job_id))
                media = query('SELECT * FROM media WHERE resource_key=%s ORDER BY relative_path',(post['resource_key'],))
                source = prepare(post,media)
                delivery_key = post['resource_key']+':nas-layout-v2:'+post['version']
                backup.send_directory('takaneko',source,nas_folder(post).removesuffix('/files'),delivery_key,delete_source=False)
                with db() as conn:
                    for item in media:
                        conn.execute('UPDATE media SET nas_path=%s,nas_previous_path=NULL,nas_available=true,nas_verified_at=now() WHERE media_id=%s',
                                     (media_destination(post,item),item['media_id']))
                    conn.execute('UPDATE posts SET nas_folder=%s,nas_available=true,nas_layout_ready=true,transfer_error=false WHERE resource_key=%s',
                                 (nas_folder(post),post['resource_key']))
                    conn.execute("UPDATE backup_jobs SET completed=completed+1,updated_at=now() WHERE id=%s",(job_id,))
                try:
                    refresh_record(post['resource_key'])
                    # This is a verified outbox of hard links, never the completed VM originals.
                    if source.parent == ROOT/'nas-outbox' and source.name == hashlib.sha256((post['resource_key']+':'+post['version']+':nas-layout-v2').encode()).hexdigest():
                        shutil.rmtree(source)
                except Exception: print('Verified NAS copy retained; readable metadata/outbox cleanup can be retried',flush=True)
            except Exception:
                query('UPDATE posts SET transfer_error=true WHERE resource_key=%s',(post['resource_key'],))
                query("UPDATE backup_jobs SET status='failed',failed=failed+1,message='NAS 備份未完成；本機內容保留，可手動重試。下載繼續運作。',updated_at=now() WHERE id=%s",(job_id,))
                return
        query("UPDATE backup_jobs SET status='completed',current_item='',message='NAS 備份及回讀校驗完成',updated_at=now() WHERE id=%s",(job_id,))
    finally: backup.NAS = original_nas


def serve():
    # One consumer per application. Download worker and other services use independent locks.
    with db() as conn:
        if not conn.execute("SELECT pg_try_advisory_lock(hashtextextended('takaneko:backup-consumer',0)) AS locked").fetchone()['locked']:
            raise RuntimeError('Backup consumer already running')
        conn.commit()  # Session advisory lock survives; do not hold an idle database transaction.
        query("UPDATE backup_jobs SET status='failed',message='備份程序重新啟動；已完成檔案保留，可重試',updated_at=now() WHERE status='running'")
        while True:
            job = query("SELECT * FROM backup_jobs WHERE status='queued' ORDER BY created_at LIMIT 1",one=True)
            if not job: time.sleep(2); continue
            try: run_job(job)
            except Exception:
                query("UPDATE backup_jobs SET status='failed',message='備份暫時無法執行，可重試；下載繼續運作',updated_at=now() WHERE id=%s",(job['id'],))


if __name__ == '__main__':
    initialize()
    if '--enqueue' in sys.argv: enqueue('scheduled')
    else: serve()
