"""Verify live backup auth/queue constraints without publishing a job or transferring files."""
import http.client
import json
from pathlib import Path
import sys
import uuid
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'server'))
from common import db


def request(path,data=None,cookie='',csrf=''):
    conn=http.client.HTTPConnection('127.0.0.1',43130,timeout=30)
    conn.request('POST' if data is not None else 'GET',path,json.dumps(data) if data is not None else None,
                 {'Origin':'https://vm1.learnfromidol.com:2083','Content-Type':'application/json','Cookie':cookie,'X-CSRF-Token':csrf})
    response=conn.getresponse();body=response.read();value=response.status,dict(response.getheaders()),body;conn.close();return value


assert request('/api/backup',{})[0]==401
code,headers,body=request('/api/login',{'password':Path('/etc/takaneko/admin-password').read_text().strip()})
assert code==200
cookie=headers['Set-Cookie'].split(';')[0]
assert request('/api/backup',{},cookie,'invalid-csrf')[0]==403
status=json.loads(request('/api/status',cookie=cookie)[2])
assert 'backup' in status and 'backupPending' in status
with db() as conn:
    try:
        if not conn.execute("SELECT 1 FROM backup_jobs WHERE status IN ('queued','running')").fetchone():
            first=conn.execute('INSERT INTO backup_jobs(id) VALUES(%s) ON CONFLICT DO NOTHING RETURNING id',(uuid.uuid4().hex,)).fetchone()
            second=conn.execute('INSERT INTO backup_jobs(id) VALUES(%s) ON CONFLICT DO NOTHING RETURNING id',(uuid.uuid4().hex,)).fetchone()
            assert first and second is None
    finally:
        conn.rollback()  # Consumer can never observe these uncommitted test rows.
print('PASS backup authentication, CSRF, status and duplicate queue constraint; no jobs published, no NAS transfers')
