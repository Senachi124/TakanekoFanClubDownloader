"""Move VM publications to readable paths, retaining media IDs and NAS/helper identities.

Stop this application's worker/auto/NAS timer during --apply. No NAS writes or original deletion.
An on-disk journal allows recovery if rename succeeds before the catalog transaction commits.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys
from common import ROOT, db, query
from archive_layout import atomic_text, readable_folder, safe_path, write_record, write_readme

sys.path.insert(0, '/opt/vm1-backup')
import vm1_backup as backup


def digest(file):
    with file.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def manifest(directory):
    result = {}
    for file in sorted(directory.rglob('*')):
        if file.is_symlink(): raise ValueError('Symlink in publication')
        if file.is_file(): result[file.relative_to(directory).as_posix()] = {'size':file.stat().st_size, 'sha256':digest(file)}
        elif not file.is_dir(): raise ValueError('Unexpected publication entry')
    if not result: raise ValueError('Empty publication')
    return result


def relocate(post, media, conn):
    old_relative = Path(post['folder'])
    relative = old_relative if post['folder'].startswith('complete/members/') else readable_folder(post)
    old, new = safe_path(old_relative), safe_path(relative)
    journal_path = None
    journal = None
    if old != new and post['local_available']:
        if not re.fullmatch(r'complete/[a-f0-9]{64}/[a-f0-9]{64}', old_relative.as_posix()):
            raise ValueError('Unrecognized legacy directory')
        journal_root = ROOT / 'layout-migrations'
        if journal_root.is_symlink(): raise ValueError('Symlink journal')
        journal_root.mkdir(exist_ok=True, mode=0o750)
        journal_path = journal_root / (hashlib.sha256(post['resource_key'].encode()).hexdigest() + '.json')
        if old.exists():
            if new.exists(): raise ValueError('Both old and new publication exist; refusing overwrite')
            files = manifest(old)
            for item in media:
                if item['relative_path'].startswith(old_relative.as_posix() + '/') and item['local_available']:
                    name = Path(item['relative_path']).relative_to(old_relative).as_posix()
                    if files.get(name) != {'size':item['size'], 'sha256':item['sha256']}: raise ValueError('Catalog checksum mismatch')
            journal = {'resource_key':post['resource_key'], 'old':old_relative.as_posix(), 'new':relative.as_posix(), 'files':files}
            atomic_text(journal_path, json.dumps(journal, ensure_ascii=False, indent=2) + '\n')
            new.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
            old.rename(new)
        else:
            if not journal_path.is_file(): raise ValueError('Missing original and migration journal')
            journal = json.loads(journal_path.read_text())
            if (journal['resource_key'],journal['old'],journal['new']) != (post['resource_key'],old_relative.as_posix(),relative.as_posix()):
                raise ValueError('Migration journal does not match catalog')
        if not new.is_dir() or manifest(new) != journal['files']: raise ValueError('Moved publication checksum mismatch')
    if old != new:
        for item in media:
            if item['relative_path'].startswith(old_relative.as_posix() + '/'):
                updated = (relative / Path(item['relative_path']).relative_to(old_relative)).as_posix()
                conn.execute('UPDATE media SET relative_path=%s WHERE media_id=%s', (updated, item['media_id']))
                item['relative_path'] = updated
        conn.execute('UPDATE posts SET folder=%s WHERE resource_key=%s', (relative.as_posix(), post['resource_key']))
        conn.commit()  # The new location becomes visible to readers as a single catalog transaction.
        post['folder'] = relative.as_posix()
    if post['local_available'] and not post['nas_available']:
        # Relink an unsent helper resource using its public lease protocol, never edit helper tables.
        decision = backup.claim('takaneko', post['resource_key'])
        if decision['action'] == 'download':
            backup.downloaded('takaneko', post['resource_key'], decision['lease_token'], new)
        elif decision['action'] == 'resume_transfer':
            if Path(decision['source_dir']) != new: raise ValueError('Helper source not reconciled')
        elif decision['action'] != 'skip': raise RuntimeError('Helper resource is busy; rerun after the lease finishes')
    write_record(post, media)
    if journal_path:
        atomic_text(journal_path, json.dumps({**journal, 'catalog_committed':True}, ensure_ascii=False, indent=2) + '\n')
    # Only the now-empty legacy hash container is removed; all original files were renamed intact.
    if old != new and re.fullmatch('[a-f0-9]{64}', old.parent.name) and old.parent.parent == ROOT / 'complete':
        try: old.parent.rmdir()
        except (FileNotFoundError, OSError): pass


def run(apply=False, verify=False):
    posts = query('SELECT * FROM posts ORDER BY resource_key')
    grouped = defaultdict(list)
    for media in query('SELECT * FROM media ORDER BY relative_path'): grouped[media['resource_key']].append(media)
    identities = {m['media_id']:(m['resource_key'],m['sha256'],m['size'],m['nas_path']) for items in grouped.values() for m in items}
    pending = sum(not p['folder'].startswith('complete/members/') for p in posts)
    print({'posts':len(posts), 'local_publications':sum(p['local_available'] for p in posts), 'legacy_paths':pending}, flush=True)
    if apply:
        if query("SELECT 1 FROM jobs WHERE status IN ('queued','running','paused') LIMIT 1", one=True):
            raise RuntimeError('Finish active downloads before moving the archive')
        write_readme()
        with db() as conn:
            for index, post in enumerate(posts, 1):
                relocate(post, grouped[post['resource_key']], conn)
                if index % 500 == 0: print({'indexed':index}, flush=True)
        after = {m['media_id']:(m['resource_key'],m['sha256'],m['size'],m['nas_path']) for m in query('SELECT * FROM media')}
        if after != identities: raise ValueError('Media identity or NAS path changed during migration')
        print('Readable archive migration complete.', flush=True)
    if verify:
        checked = 0
        for post in posts:
            if not post['folder'].startswith('complete/members/'): raise ValueError('Legacy post path remains')
            parent = safe_path(post['folder']).parent
            if (parent / 'index.md').read_text() != post['body']: raise ValueError('Readable text mismatch')
            record = json.loads((parent / 'record.json').read_text())
            if record['resource_key'] != post['resource_key'] or record['version'] != post['version']: raise ValueError('Readable identity mismatch')
            for item in grouped[post['resource_key']]:
                if item['local_available']:
                    file = safe_path(item['relative_path'])
                    if not file.is_file() or file.stat().st_size != item['size'] or digest(file) != item['sha256']:
                        raise ValueError('Local media verification failed')
                    checked += 1
        print({'verified_posts':len(posts), 'verified_local_media':checked}, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    run(args.apply, args.verify)
