"""Index a verified NAS desktop snapshot without downloading the originals again."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
from common import ROOT, db, initialize
from web import ReadOnlyNAS


def remote_json(relative):
    nas = ReadOnlyNAS()
    connection = nas.connect()
    try:
        connection.request('GET', nas.path(relative), headers={'Authorization': nas.auth})
        response = connection.getresponse()
        if response.status != 200: raise RuntimeError('Verified NAS backup marker is missing')
        return json.loads(response.read(32 * 1024 * 1024))
    finally: connection.close()


def run(bundle):
    summary = json.loads((bundle / 'summary.json').read_text())
    snapshot = summary['snapshot']
    if not re.fullmatch('[a-zA-Z0-9_-]+', snapshot): raise ValueError('Snapshot')
    completion = remote_json(f'takaneko/desktop-imports/{snapshot}/_backup-complete.json')
    if completion['status'] != 'verified' or completion['sha256Manifest'] != summary['source_manifest_sha256']:
        raise ValueError('NAS original verification does not match this catalog')
    catalog = bundle / 'catalog.ndjson'
    with catalog.open('rb') as file:
        if hashlib.file_digest(file, 'sha256').hexdigest() != summary['catalog_sha256']: raise ValueError('Catalog checksum')
    thumb_root = ROOT / 'complete' / 'desktop-thumbnails' / snapshot
    thumb_root.mkdir(parents=True, exist_ok=True)
    owner = ROOT.stat()
    for directory in (thumb_root.parent, thumb_root):
        if os.geteuid() == 0: os.chown(directory, owner.st_uid, owner.st_gid)
        directory.chmod(0o750)
    count = 0
    with db() as conn, catalog.open(encoding='utf-8') as stream:
        for line in stream:
            post = json.loads(line)
            if not post['nas_folder'].startswith(f'takaneko/desktop-imports/{snapshot}/'): raise ValueError('NAS scope')
            inserted = conn.execute('''INSERT INTO posts(resource_key,source_id,kind,title,member,body,folder,nas_folder,version,nas_available,local_available,created_at)
                            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,true,false,%s) ON CONFLICT DO NOTHING RETURNING resource_key''',
                         tuple(post[k] for k in ('resource_key','source_id','kind','title','member','body','folder','nas_folder','version','created_at'))).fetchone()
            if not inserted: continue
            for media in post['media']:
                if media['variant'] == 'thumbnail':
                    name = Path(media['relative_path']).name
                    if not re.fullmatch('[a-f0-9]{64}\.jpg', name): raise ValueError('Thumbnail name')
                    source = bundle / 'thumbnails' / name
                    with source.open('rb') as file:
                        if hashlib.file_digest(file, 'sha256').hexdigest() != media['sha256']: raise ValueError('Thumbnail local checksum')
                    destination = thumb_root / name
                    if not destination.exists():
                        temp = destination.with_suffix('.part')
                        shutil.copyfile(source, temp)
                        temp.chmod(0o640)
                        if os.geteuid() == 0: os.chown(temp, owner.st_uid, owner.st_gid)
                        temp.replace(destination)
                conn.execute('''INSERT INTO media(media_id,resource_key,version,variant,relative_path,nas_path,sha256,size,mime,width,height,original_id,local_available,nas_available,nas_verified_at,local_verified_at)
                                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CASE WHEN %s THEN now() ELSE NULL END,CASE WHEN %s THEN now() ELSE NULL END) ON CONFLICT DO NOTHING''',
                             (media['media_id'], post['resource_key'], post['version'], media['variant'], media['relative_path'], media['nas_path'],
                              media['sha256'], media['size'], media['mime'], media['width'], media['height'], media['original_id'], media['local_available'],
                              media['variant'] != 'thumbnail', media['variant'] != 'thumbnail', media['local_available']))
            count += 1
        conn.execute('''INSERT INTO desktop_imports(snapshot,files,bytes,posts,manifest_sha256) VALUES(%s,%s,%s,%s,%s)
                        ON CONFLICT(snapshot) DO NOTHING''', (snapshot, completion['files'], completion['bytes'], count, summary['source_manifest_sha256']))
        conn.execute('''INSERT INTO desktop_thumbnail_backups(snapshot,folder,nas_folder) VALUES(%s,%s,%s)
                        ON CONFLICT DO NOTHING''', (snapshot, str(thumb_root.relative_to(ROOT)), f'takaneko/desktop-thumbnails/{snapshot}'))
    print(json.dumps({'imported_posts': count, 'snapshot': snapshot, 'originals': 'NAS', 'local_thumbnails': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('bundle', type=Path)
    args = parser.parse_args()
    initialize()
    run(args.bundle)
