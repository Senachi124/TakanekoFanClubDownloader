"""Run on VM as root: authenticated catalog ordering/pagination using isolated metadata fixtures."""
from datetime import datetime, timedelta, timezone
import hashlib
import http.client
import json
from pathlib import Path
import sys
from urllib.parse import urlencode
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'server'))
from common import db


def request(path, data=None, cookie=''):
    conn = http.client.HTTPConnection('127.0.0.1', 43130, timeout=30)
    conn.request('POST' if data else 'GET', path, json.dumps(data) if data else None,
                 {'Content-Type': 'application/json', 'Origin': 'https://vm1.learnfromidol.com:2083', 'Cookie': cookie})
    response = conn.getresponse()
    body = response.read()
    headers = dict(response.getheaders())
    conn.close()
    return response.status, headers, body


def check(condition, message):
    if not condition: raise AssertionError(message)
    print('PASS ' + message)


check(request('/api/library')[0] == 401, 'multimedia catalog requires login')
status, headers, _ = request('/api/login', {'password': Path('/etc/takaneko/admin-password').read_text().strip()})
check(status == 200, 'private login')
cookie = headers['Set-Cookie'].split(';')[0]


def get(path, **params):
    status, _, body = request(path + '?' + urlencode(params), cookie=cookie)
    check(status == 200, 'catalog response')
    return json.loads(body)


prefix = 'library-test-' + uuid.uuid4().hex
member = prefix + '-A'
other = prefix + '-B'
keys = [prefix + f'-{i:03}' for i in range(53)]
def identity(value): return hashlib.sha256(value.encode()).hexdigest()

try:
    with db() as conn:
        for i, key in enumerate(keys):
            conn.execute('''INSERT INTO posts(resource_key,source_id,kind,title,member,body,folder,nas_folder,version,created_at)
                            VALUES(%s,%s,'test','Library fixture',%s,'','unused','unused','test',%s)''',
                         (key, key, member if i < 52 else other, datetime(2020, 1, 1, tzinfo=timezone.utc) + timedelta(days=i // 2)))
            for name, variant, mime, original, available, size, owner in (
                ('image','original','image/jpeg',None,True,20,'owner'),
                ('video','original','video/mp4',None,True,20,'owner'),
                ('thumb','thumbnail','image/jpeg',identity(key+'image'),True,10,'owner'),
                ('missing','original','image/jpeg',None,False,20,'owner'),
                ('empty','original','image/jpeg',None,True,0,'owner'),
                ('private','original','image/jpeg',None,True,20,'different-owner')):
                conn.execute('''INSERT INTO media(media_id,resource_key,version,variant,relative_path,nas_path,sha256,size,mime,
                               original_id,local_available,owner_id) VALUES(%s,%s,'test',%s,%s,'unused',%s,%s,%s,%s,%s,%s)''',
                             (identity(key+name), key, variant, key+'/'+name, identity(key+name), size, mime, original, available, owner))
    first = get('/api/posts', member=member)
    second = get('/api/posts', member=member, offset=48)
    # Pair timestamps deliberately tie; resource keys provide a stable tie-breaker.
    expected = sorted(keys[:52], key=lambda key: (-(int(key[-3:]) // 2), key))
    check([p['resource_key'] for p in first['posts'] + second['posts']] == expected,
          'member posts date descending with stable ties and no lost/duplicate pagination')
    check(first['total'] == 52 and first['hasMore'] and not second['hasMore'], 'member counts and final page')
    check(all(p['member'] == member for p in first['posts']), 'other members excluded')
    check(get('/api/posts')['member'] == first['members'][0], 'default selects first member')
    all_media = []
    for offset in (0,48,96):
        page = get('/api/library', member=member, offset=offset)
        all_media += page['media']
    check(len(all_media) == 104 and len({m['media_id'] for m in all_media}) == 104,
          'only available originals, excluding zero-byte files and other owners')
    check([m['resource_key'] for m in all_media] == [key for key in expected for _ in range(2)], 'media uses post date ordering')
    for kind in ('image','video'):
        filtered = get('/api/library', member=member, type=kind)
        check(filtered['total'] == 52 and all(m['mime'].startswith(kind+'/') for m in filtered['media']), kind+' filter')
    image = get('/api/library', member=member, type='image')['media'][0]
    check(image['cover_id'] == identity(image['resource_key']+'thumb'), 'image thumbnail matches original')
    check(not any(k in image for k in ('relative_path','nas_path','folder')), 'catalog keeps storage paths private')
    check(get('/api/library', member=other)['total'] == 2, 'multimedia member isolation')
    check(get('/api/library', member=prefix+'-empty')['total'] == 0, 'empty member view')
    check(request('/api/library?type=invalid', cookie=cookie)[0] == 400, 'invalid filter rejected')
    check(request('/api/library?offset=invalid', cookie=cookie)[0] == 400, 'invalid page rejected')
    check(request('/library')[0] == 200, 'separate multimedia page')
finally:
    with db() as conn:
        conn.execute('DELETE FROM media WHERE resource_key=ANY(%s)', (keys,))
        conn.execute('DELETE FROM posts WHERE resource_key=ANY(%s)', (keys,))
print('Library verification complete; all temporary metadata removed.')
