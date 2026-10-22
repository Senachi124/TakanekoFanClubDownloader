"""Verify a root-only refetch receipt via authenticated public HTTPS."""
import argparse
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPCookieProcessor, Request

sys.path.insert(0, '/opt/takaneko/current/server')
from common import query
BASE = 'https://vm1.learnfromidol.com/takaneko'

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--receipt', required=True)
    args = parser.parse_args()
    assert os.geteuid() == 0
    receipt = Path(args.receipt).resolve()
    assert receipt.is_relative_to('/var/backups/vm1-admin')
    result = json.loads(receipt.read_text())
    opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [('User-Agent', 'Mozilla/5.0')]
    credential = json.loads(Path('/var/backups/vm1-admin/unified-auth/login.json').read_text())
    def post(path, data, csrf=None):
        req = Request(BASE + path, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json', 'Origin': 'https://vm1.learnfromidol.com', **({'X-CSRF-Token': csrf} if csrf else {})})
        with opener.open(req, timeout=30) as response: return json.load(response)
    login = post('/api/login', {'username': 'sena', 'password': credential['password']})
    checked = []
    try:
        for item in result['results']:
            key = 'takaneko:post:' + item['source_id'] + ':v1'
            with opener.open(BASE + '/api/post?' + urlencode({'key': key}), timeout=30) as response:
                assert response.status == 200; public = json.load(response)
            assert public['title'] == item['title'] and len(public['body']) == item['body_characters']
            media = query('SELECT media_id,sha256,size FROM media WHERE resource_key=%s AND variant=%s', (key, 'original'))
            assert len(media) == item['original_media']
            for file in media:
                digest = hashlib.sha256(); size = 0
                with opener.open(BASE + '/media/' + file['media_id'], timeout=30) as response:
                    assert response.status == 200
                    while block := response.read(65536): digest.update(block); size += len(block)
                assert digest.hexdigest() == file['sha256'] and size == file['size']
            checked.append({'member': item['member'], 'title': public['title'], 'original_media': len(media), 'https_full_hash_verified': True})
        for snapshot in receipt.parent.glob('original-*.json'):
            for path, expected in json.loads(snapshot.read_text()).items():
                with Path(path).open('rb') as f: assert hashlib.file_digest(f, 'sha256').hexdigest() == expected
        job = query('SELECT status,total,completed,failed FROM jobs WHERE id=%s', (result['job_id'],), one=True)
        assert job == {'status': 'completed', 'total': len(result['results']), 'completed': len(result['results']), 'failed': 0}
        report = {'job': job, 'posts': checked, 'old_files_unchanged': True}
        (receipt.parent / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False))
    finally: post('/api/logout', {}, login['csrf'])

if __name__ == '__main__': main()
