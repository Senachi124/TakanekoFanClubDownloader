"""Verify live backup auth/status without writing any job or transferring files."""
import http.client
import json
import os
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))


def request(path,data=None,cookie='',csrf=''):
    conn=http.client.HTTPConnection('127.0.0.1',43130,timeout=30)
    conn.request('POST' if data is not None else 'GET',path,json.dumps(data) if data is not None else None,
                 {'Origin':os.environ['TAKANEKO_ORIGIN'],'Content-Type':'application/json','Cookie':cookie,'X-CSRF-Token':csrf})
    response=conn.getresponse();body=response.read();value=response.status,dict(response.getheaders()),body;conn.close();return value


assert request('/api/backup',{})[0]==401
code,headers,body=request('/api/login',{'password':Path('/etc/takaneko/admin-password').read_text().strip()})
assert code==200
cookie=headers['Set-Cookie'].split(';')[0]
assert request('/api/backup',{},cookie,'invalid-csrf')[0]==403
status=json.loads(request('/api/status',cookie=cookie)[2])
assert 'backup' in status and 'backupPending' in status
assert 'manualBackupBusy' in status
assert status['backup'] is None or 'verified_files' not in status['backup']
print('PASS backup authentication, CSRF and public status; no jobs written, no NAS transfers')
