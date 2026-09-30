"""Real PostgreSQL acceptance in a disposable takaneko_test_ database. No NAS I/O."""
from datetime import datetime, timedelta
import json
from pathlib import Path
import sys
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'server'))
from common import db, DB_CONFIG, initialize, query
import library
import activity
import backup_worker as worker
import backup_window as window

config=json.loads(DB_CONFIG.read_text())['database']
assert config.get('dbname',config.get('database','')).startswith('takaneko_test_'), 'Dedicated test DB required'
with db() as conn: conn.execute('CREATE SCHEMA IF NOT EXISTS takaneko')
initialize()
stamp=datetime.fromisoformat('2030-01-31T08:30:00+08:00')
with db() as conn:
    assert conn.execute('SELECT count(*) AS n FROM posts').fetchone()['n']==0, 'Empty fixture catalog required'
    for i in range(55):
        key=f'fixture-{i:03}'
        member='B' if i%2 else 'A'
        conn.execute("INSERT INTO posts(resource_key,source_id,kind,title,member,body,folder,nas_folder,version,created_at) VALUES(%s,%s,'post',%s,%s,'','','','v',%s)",(key,key,key,member,stamp-timedelta(minutes=i//2)))
        conn.execute("INSERT INTO media(media_id,resource_key,version,variant,relative_path,nas_path,sha256,size,mime) VALUES(%s,%s,'v','original',%s,'','hash',1,%s)",(key,key,key,'video/mp4' if i%3==0 else 'image/jpeg'))
        conn.execute("INSERT INTO jobs(id,status,created_at) VALUES(%s,'completed',%s)",(key,stamp-timedelta(minutes=i)))
for multimedia in (False,True):
    first=library.collection({},multimedia)
    field='media' if multimedia else 'posts'
    assert first['member'] is None and first['total']==55 and first['hasMore']
    assert [r['resource_key'] for r in first[field]]==[f'fixture-{i:03}' for i in range(48)]
    second=library.collection({'offset':['48']},multimedia)
    assert len(second[field])==7 and not second['hasMore']
    scoped=library.collection({'member':['B']},multimedia)
    assert scoped['total']==27 and all(r['member']=='B' for r in scoped[field])
    assert library.collection({'member':['missing']},multimedia)['total']==0
assert library.collection({'type':['video']},True)['total']==19
assert len(activity.history({})['items'])==50 and activity.history({})['hasMore']
assert len(activity.history({'offset':['50']})['items'])==5
assert not activity.history({'kind':['nas']})['items']
query('UPDATE settings SET nas_interval_minutes=60,nas_next_at=NULL WHERE id=1')
with patch.object(window,'now',return_value=stamp):
    job=worker.enqueue('scheduled')
    assert job and worker.enqueue('scheduled') is None
    due=query('SELECT nas_next_at FROM settings WHERE id=1',one=True)['nas_next_at']
    assert due.astimezone(window.HK).isoformat()=='2030-02-01T03:00:00+08:00'
    query('UPDATE settings SET nas_enabled=false WHERE id=1')
    assert worker.next_job() is None
    manual=worker.enqueue('manual')
    # Fixture default next_run_at is the actual current time, earlier than the test clock.
    assert worker.next_job()['id']==manual['id']
    query('UPDATE settings SET nas_enabled=true WHERE id=1')
    def finish(_): query("UPDATE backup_jobs SET status='completed',files_done=1 WHERE id=%s",(manual['id'],))
    with patch.object(worker,'supervise_child',side_effect=finish),patch.object(worker.time,'monotonic',side_effect=[10,100]):
        worker.supervise({'id':manual['id'],'trigger':'manual'})
    row=query('SELECT * FROM backup_jobs WHERE id=%s',(manual['id'],),one=True)
    assert row['duration_known'] and row['elapsed_seconds']==90 and row['finished_at'] is not None
    query("UPDATE backup_jobs SET status='running',started_at=now(),duration_known=true WHERE id=%s",(job['id'],))
    worker.recover()
    assert not query('SELECT duration_known FROM backup_jobs WHERE id=%s',(job['id'],),one=True)['duration_known']
    assert len(activity.history({'kind':['nas']})['items'])==2
print('PASS all-member global ordering, tied-date pagination, filters, private activity history, interval cutoff, disabled schedule, manual priority, duration and interrupted recovery; no production writes or NAS I/O')
