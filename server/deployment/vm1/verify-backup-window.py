"""Acceptance against session-local PostgreSQL tables; no real jobs or NAS traffic."""
from datetime import datetime
import json
from pathlib import Path
import sys
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from common import db, DB_CONFIG, initialize
import backup_worker as worker
import backup_window as window


database=json.loads(DB_CONFIG.read_text())['database']
if not database.get('dbname',database.get('database','')).startswith('takaneko_test_'):
    raise ValueError('Use a dedicated takaneko_test_ database configuration; never the production catalog')
with db() as conn: conn.execute('CREATE SCHEMA IF NOT EXISTS takaneko')
initialize()
with db() as conn:
    # pg_temp shadows application tables only on this connection, never in a worker.
    conn.execute('CREATE TEMP TABLE backup_jobs (LIKE takaneko.backup_jobs INCLUDING DEFAULTS) ON COMMIT DROP')
    conn.execute("ALTER TABLE pg_temp.backup_jobs ADD COLUMN IF NOT EXISTS next_run_at timestamptz NOT NULL DEFAULT now()")
    conn.execute("ALTER TABLE pg_temp.backup_jobs ADD COLUMN IF NOT EXISTS verified_files jsonb NOT NULL DEFAULT '{}'")
    conn.execute("CREATE UNIQUE INDEX pending_fixture ON pg_temp.backup_jobs(trigger) WHERE status IN ('queued','running','waiting')")
    def query(sql,params=(),one=False):
        cursor=conn.execute(sql,params)
        if cursor.description: return cursor.fetchone() if one else cursor.fetchall()
    stamp=datetime.fromisoformat('2030-01-31T12:00:00+08:00')
    with patch.object(worker,'query',side_effect=query),patch.object(window,'now',return_value=stamp):
        conn.execute("INSERT INTO backup_jobs(id,trigger,status,next_run_at) VALUES('automatic','scheduled','waiting',%s)",(window.next_window(),))
        conn.execute("INSERT INTO backup_jobs(id,trigger,status) VALUES('manual','manual','queued')")
        assert worker.next_job()['id']=='manual'
        assert conn.execute("INSERT INTO backup_jobs(id,trigger) VALUES('duplicate','manual') ON CONFLICT DO NOTHING RETURNING id").fetchone() is None
        conn.execute("UPDATE backup_jobs SET status='completed' WHERE id='manual'")
        assert worker.next_job() is None
        conn.execute("UPDATE backup_jobs SET status='running',next_run_at=%s WHERE id='automatic'",(stamp,))
        worker.recover()
        row=query("SELECT * FROM backup_jobs WHERE id='automatic'",one=True)
        assert row['trigger']=='scheduled' and row['status']=='waiting'
        assert row['next_run_at'].astimezone(window.HK).isoformat()=='2030-02-01T03:00:00+08:00'
        with patch.object(window,'now',return_value=datetime.fromisoformat('2030-02-01T03:00:00+08:00')):
            assert worker.next_job()['id']=='automatic'
    conn.execute("UPDATE backup_jobs SET status='failed' WHERE id='manual'")
    post={'resource_key':'fixture','member':'member','title':'title','version':'v','folder':'complete/members/m/posts/date/title/files'}
    def isolated_query(sql,params=(),one=False):
        if sql.startswith('SELECT * FROM posts'): return [post]
        if sql.startswith('SELECT * FROM media'): return []
        if sql.startswith('UPDATE posts '): return None
        assert 'backup_jobs' in sql
        return query(sql,params,one)
    class NAS:
        def put_verified(self,*args): pass
    def send(*args,**kwargs):
        worker.backup.NAS().put_verified(Path('/fixture/image.jpg'),'fixture/image.jpg',{'size':8})
        raise OSError('Isolated retry fixture')
    with patch.object(worker,'query',side_effect=isolated_query),patch.object(worker,'prepare',return_value=Path('/fixture')),patch.object(worker.backup,'NAS',NAS),patch.object(worker.backup,'send_directory',side_effect=send):
        for _ in range(2): worker.run_job({'id':'manual','trigger':'manual'})
    row=query("SELECT * FROM backup_jobs WHERE id='manual'",one=True)
    assert row['files_done']==1 and row['bytes_done']==8 and row['verified_files']=={'fixture/image.jpg':8}
    conn.rollback()
print('PASS isolated manual priority, duplicate prevention, outside-window restart, cross-day resume and persistent verified progress; no production jobs or NAS traffic')
