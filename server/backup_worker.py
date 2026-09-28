"""Independent, durable NAS queue. A backup failure never changes download jobs."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid
from common import ROOT, db, query, initialize
from archive_layout import safe_path, refresh_record
import backup_window as window
from datetime import timedelta
sys.path.insert(0, '/opt/vm1-backup')
import vm1_backup as backup


def enqueue(trigger='manual'):
    if trigger not in ('manual','scheduled'): raise ValueError('Invalid backup trigger')
    if trigger=='scheduled' and not window.is_open():
        return query("INSERT INTO backup_jobs(id,trigger,status,next_run_at,message) VALUES(%s,%s,'waiting',%s,'待香港時間 03:00 窗口續傳') ON CONFLICT DO NOTHING RETURNING id",(uuid.uuid4().hex,trigger,window.next_window()),one=True)
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


def run_job(job, deadline=None):
    job_id = job['id']
    posts = query('SELECT * FROM posts WHERE NOT nas_layout_ready AND NOT nas_migration_pending ORDER BY created_at,resource_key')
    query("UPDATE backup_jobs SET status='running',total=completed+%s,failed=0,message='準備不可變備份副本',updated_at=now() WHERE id=%s", (len(posts),job_id))
    original_nas = backup.NAS
    seen = set()

    class ReportingNAS(original_nas):
        def request(self, *args, **kwargs):
            # Also prevents the helper's finally/temporary cleanup from issuing I/O after cutoff.
            window.check(deadline)
            return super().request(*args, **kwargs)

        def connect(self):
            window.check(deadline)
            return super().connect()

        def put_verified(self, local, remote, info):
            window.check(deadline)
            query("UPDATE backup_jobs SET current_item=%s,message='傳送並回讀校驗中',updated_at=now() WHERE id=%s", (Path(local).name,job_id))
            super().put_verified(local,remote,info)
            if remote not in seen:
                seen.add(remote)
                query('''UPDATE backup_jobs SET files_done=files_done+1,bytes_done=bytes_done+%s,
                         verified_files=verified_files || jsonb_build_object(%s::text,%s::bigint),updated_at=now()
                         WHERE id=%s AND NOT (verified_files ? %s)''', (info['size'],remote,info['size'],job_id,remote))

    # Only this dedicated process sees the progress adapter. Shared helper source stays untouched.
    backup.NAS = ReportingNAS
    try:
        for post in posts:
            window.check(deadline)
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
                if job.get('trigger') == 'scheduled': defer(job_id, retry=True)
                else: query("UPDATE backup_jobs SET status='failed',failed=failed+1,message='NAS 備份未完成；本機內容保留，可手動重試。下載繼續運作。',updated_at=now() WHERE id=%s",(job_id,))
                return
        query("UPDATE backup_jobs SET status='completed',current_item='',message='NAS 備份及回讀校驗完成',updated_at=now() WHERE id=%s",(job_id,))
    finally: backup.NAS = original_nas


def defer(job_id, retry=False):
    current = window.now()
    next_run = current + timedelta(minutes=15) if retry and window.is_open(current) else window.next_window(current)
    if not window.is_open(next_run): next_run = window.next_window(current)
    message = '備份未完成，窗口內稍後重試；下載繼續運作' if retry and next_run.date() == current.date() and window.is_open(current) else '待下次香港時間 03:00 窗口續傳；本機檔案與已校驗進度保留'
    query("UPDATE backup_jobs SET status='waiting',next_run_at=%s,message=%s,updated_at=now() WHERE id=%s AND status<>'completed'",(next_run,message,job_id))


def recover():
    # Preserve the explicit source: an automatic retry never acquires manual privileges.
    query("UPDATE backup_jobs SET status='queued',message='服務恢復，保留進度繼續',updated_at=now() WHERE status='running'")
    if not window.is_open():
        query("UPDATE backup_jobs SET status='waiting',next_run_at=%s,message='待香港時間 03:00 窗口續傳',updated_at=now() WHERE trigger='scheduled' AND status IN ('queued','waiting') AND next_run_at<%s",(window.next_window(),window.next_window()))


def next_job():
    return query("""SELECT * FROM backup_jobs WHERE status IN ('queued','waiting') AND next_run_at<=%s
                    AND (trigger='manual' OR (trigger='scheduled' AND %s))
                    ORDER BY (trigger='manual') DESC,created_at LIMIT 1""",(window.now(),window.is_open()),one=True)


def supervise(job):
    deadline = window.cutoff() if job['trigger']=='scheduled' else None
    if deadline is not None and not window.is_open(): defer(job['id']); return
    args = [sys.executable,str(Path(__file__).resolve()),'--job',job['id']]
    if deadline is not None: args += ['--deadline',str(deadline)]
    child = subprocess.Popen(args)
    try:
        # Separate process is the hard fallback for a library stuck in C/DB/DNS I/O.
        while child.poll() is None:
            remaining = None if deadline is None else deadline-time.time()
            if remaining is not None and remaining<=0:
                child.kill(); child.wait(); defer(job['id']); return
            try: child.wait(timeout=min(0.2,remaining) if remaining is not None else 0.2)
            except subprocess.TimeoutExpired: pass
        if child.returncode:
            if deadline is not None: defer(job['id'],retry=window.is_open())
            else: query("UPDATE backup_jobs SET status='failed',message='備份中斷，可手動重試；原檔保留',updated_at=now() WHERE id=%s AND status<>'completed'",(job['id'],))
    finally:
        if child.poll() is None: child.kill(); child.wait()


def serve():
    # One consumer per application. Download worker and other services use independent locks.
    with db() as conn:
        if not conn.execute("SELECT pg_try_advisory_lock(hashtextextended('takaneko:backup-consumer',0)) AS locked").fetchone()['locked']:
            raise RuntimeError('Backup consumer already running')
        conn.commit()  # Session advisory lock survives; do not hold an idle database transaction.
        recover()
        while True:
            job = next_job()
            if not job: time.sleep(2); continue
            try: supervise(job)
            except Exception:
                if job['trigger']=='scheduled': defer(job['id'],retry=True)
                else: query("UPDATE backup_jobs SET status='failed',message='備份暫時無法執行，可重試；下載繼續運作',updated_at=now() WHERE id=%s",(job['id'],))


if __name__ == '__main__':
    if '--job' in sys.argv:
        job = query('SELECT * FROM backup_jobs WHERE id=%s',(sys.argv[sys.argv.index('--job')+1],),one=True)
        deadline = None
        if job['trigger']=='scheduled':
            if not window.is_open(): defer(job['id']); sys.exit(0)
            deadline = min(window.cutoff(),float(sys.argv[sys.argv.index('--deadline')+1]))
        try:
            with window.deadline_guard(deadline): run_job(job,deadline)
        except window.WindowClosed: defer(job['id'])
    else:
        initialize()
        if '--enqueue' in sys.argv: enqueue('scheduled')
        else: serve()
