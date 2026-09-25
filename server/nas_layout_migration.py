"""Prepare/commit an explicitly requested NAS directory migration with verified SMB receipts."""
import argparse
import hashlib
import json
from pathlib import Path
from common import db, query
from backup_worker import nas_folder, media_destination, nas_record
from archive_layout import refresh_catalog


def sha(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()


def load(path):
    lines = [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()]
    return lines[0],lines[1:]


def export(path, manifest_sha):
    if path.exists(): raise ValueError('Retain the original plan for resumable migration')
    posts = query('SELECT * FROM posts WHERE nas_available AND NOT nas_layout_ready ORDER BY resource_key')
    grouped = {}
    for media in query('SELECT * FROM media ORDER BY relative_path'): grouped.setdefault(media['resource_key'],[]).append(media)
    with path.open('x',encoding='utf-8') as stream:
        stream.write(json.dumps({'schema':1,'manifest_sha256':manifest_sha})+'\n')
        for post in posts:
            if post['nas_migration_pending']: raise ValueError('Resume the existing plan instead')
            media = grouped.get(post['resource_key'],[])
            item = {'resource_key':post['resource_key'],'version':post['version'],'old':post['nas_folder'],
                    'new':nas_folder(post),'body':post['body'],'record':nas_record(post,media),
                    'media':[{**{k:m[k] for k in ('media_id','variant','relative_path','sha256','size')},
                              'new':media_destination(post,m)} for m in media]}
            stream.write(json.dumps(item,ensure_ascii=False)+'\n')
    print({'planned_posts':len(posts),'plan_sha256':sha(path)})


def activate(path):
    _,items = load(path)
    with db() as conn:
        for item in items:
            post = conn.execute('SELECT * FROM posts WHERE resource_key=%s FOR UPDATE',(item['resource_key'],)).fetchone()
            if post['version'] != item['version'] or item['new'] != nas_folder(post) or post['nas_folder'] not in (item['old'],item['new']):
                raise ValueError('Catalog changed since plan')
            if post['nas_layout_ready']: continue
            for media in item['media']:
                row = conn.execute('SELECT * FROM media WHERE media_id=%s',(media['media_id'],)).fetchone()
                if row['resource_key'] != post['resource_key'] or row['sha256'] != media['sha256'] or row['size'] != media['size'] or media['new'] != media_destination(post,row):
                    raise ValueError('Media changed since plan')
                conn.execute('''UPDATE media SET nas_previous_path=CASE WHEN nas_available THEN COALESCE(nas_previous_path,nas_path) ELSE NULL END,
                                nas_path=%s WHERE media_id=%s''',(media['new'],media['media_id']))
            conn.execute('UPDATE posts SET nas_folder=%s,nas_migration_pending=true WHERE resource_key=%s',(item['new'],post['resource_key']))
    print({'dual_path_posts':len(items)})


def finish(path, receipt_path):
    header,items = load(path)
    receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
    expected = {item['resource_key']:item['new'] for item in items}
    actual = {item['resource_key']:item['new'] for item in receipt['posts']}
    if receipt['status'] != 'verified' or receipt['plan_sha256'] != sha(path) or receipt['manifest_sha256'] != header['manifest_sha256'] or actual != expected or len(receipt['posts']) != len(items):
        raise ValueError('Verification receipt does not match plan')
    with db() as conn:
        for item in items:
            post = conn.execute('SELECT * FROM posts WHERE resource_key=%s FOR UPDATE',(item['resource_key'],)).fetchone()
            if post['version'] != item['version'] or post['nas_folder'] != item['new']: raise ValueError('Post changed during move')
            for media in item['media']:
                row = conn.execute('SELECT * FROM media WHERE media_id=%s',(media['media_id'],)).fetchone()
                if row['sha256'] != media['sha256'] or row['nas_path'] != media['new']: raise ValueError('Media changed during move')
                conn.execute('UPDATE media SET nas_previous_path=NULL,nas_available=true,nas_verified_at=now() WHERE media_id=%s',(media['media_id'],))
            conn.execute('UPDATE posts SET nas_layout_ready=true,nas_migration_pending=false,transfer_error=false WHERE resource_key=%s',(item['resource_key'],))
        conn.execute("UPDATE desktop_thumbnail_backups SET nas_available=true,transfer_error=false,nas_folder='takaneko/media/members' WHERE NOT EXISTS (SELECT 1 FROM media WHERE variant='thumbnail' AND NOT nas_available AND starts_with(relative_path,'complete/desktop-thumbnails/'))")
    refresh_catalog()
    print({'committed_posts':len(items),'receipt_files':receipt['files']})


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('export','activate','finish'))
    parser.add_argument('plan',type=Path)
    parser.add_argument('--manifest-sha')
    parser.add_argument('--receipt',type=Path)
    args=parser.parse_args()
    if args.action=='export': export(args.plan,args.manifest_sha)
    elif args.action=='activate': activate(args.plan)
    else: finish(args.plan,args.receipt)
