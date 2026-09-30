"""Portable, credential-free Reader catalog of verified NAS archives only."""
import hashlib
import json
from pathlib import PurePosixPath
import uuid

from common import ROOT, db
from archive_layout import atomic_text
import backup_window as window

DESTINATION = 'takaneko/media/members'


def relative(value):
    if not isinstance(value, str) or '\\' in value or ':' in value or '\x00' in value:
        raise ValueError('Invalid catalog path')
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('Invalid catalog path')
    return path.relative_to(DESTINATION).as_posix()


def build_catalog(posts, media):
    grouped = {}
    for item in media:
        grouped.setdefault(item['resource_key'], []).append(item)
    entries = []
    for post in sorted(posts, key=lambda p: p['resource_key']):
        if not post['nas_available'] or not post['nas_layout_ready'] or post['nas_migration_pending']:
            continue
        items = grouped.get(post['resource_key'], [])
        if any(not item['nas_available'] or not item['nas_verified_at'] for item in items):
            continue
        parent = str(PurePosixPath(post['nas_folder']).parent)
        entry = {key: post[key] for key in ('resource_key', 'source_id', 'member', 'kind', 'title', 'version')}
        entry.update(published_at=post['created_at'].isoformat(), text=relative(parent + '/index.md'), media=[])
        for item in sorted(items, key=lambda m: m['media_id']):
            entry['media'].append({**{key: item[key] for key in ('media_id', 'variant', 'mime', 'size', 'sha256')},
                                   'path': relative(item['nas_path'])})
        entries.append(entry)
    return {'format': 'takaneko-catalog', 'schema_version': 1, 'posts': entries, 'total': len(entries)}


def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')


def publish_snapshot(nas, payload, directory, signature, deadline=None):
    """Only the derived catalog pointer is replaceable; archive files are immutable."""
    window.check(deadline)
    raw = encode(payload)
    digest = hashlib.sha256(raw).hexdigest()
    name = '.catalog/' + digest + '.json'
    pointer = encode({'format': 'takaneko-catalog-pointer', 'schema_version': 1,
                      'catalog': name, 'sha256': digest, 'size': len(raw)})
    expected = {'sha256': hashlib.sha256(pointer).hexdigest(), 'size': len(pointer)}
    directory.mkdir(parents=True, exist_ok=True)
    source = directory / (digest + '.json')
    atomic_text(source, raw.decode('utf-8'))
    window.check(deadline)
    existing = nas.hash(DESTINATION + '/catalog.json')
    if existing == expected:
        return {'posts': payload['total'], 'sha256': digest, 'changed': False}
    if existing is not None:
        window.check(deadline)
        status, previous = nas.request('GET', DESTINATION + '/catalog.json')
        if status != 200 or json.loads(previous).get('format') != 'takaneko-catalog-pointer':
            raise RuntimeError('Existing catalog is not an application-owned pointer')
    window.check(deadline)
    nas.mkdirs(DESTINATION + '/.catalog')
    window.check(deadline)
    nas.put_verified(source, DESTINATION + '/' + name,
                     {'sha256': digest, 'size': len(raw), 'signature': signature(source.stat())})
    # A unique temporary pointer is never visible as a committed Reader index.
    temporary = DESTINATION + '/.catalog-upload-' + uuid.uuid4().hex
    window.check(deadline)
    status, _ = nas.request('PUT', temporary, pointer,
                            {'Content-Length': str(len(pointer)), 'If-None-Match': '*'})
    if status not in (200, 201, 204):
        raise RuntimeError('Catalog pointer upload failed')
    window.check(deadline)
    if nas.hash(temporary) != expected:
        raise RuntimeError('Catalog pointer checksum mismatch')
    window.check(deadline)
    destination = f'https://{nas.host}:{nas.port}' + nas.path(DESTINATION + '/catalog.json')
    status, _ = nas.request('MOVE', temporary, headers={'Destination': destination, 'Overwrite': 'T'})
    if status not in (201, 204):
        raise RuntimeError('Catalog pointer publication failed')
    window.check(deadline)
    if nas.hash(DESTINATION + '/catalog.json') != expected:
        raise RuntimeError('Published catalog checksum mismatch')
    atomic_text(directory / 'published.json', pointer.decode('utf-8'))
    return {'posts': payload['total'], 'sha256': digest, 'changed': True}


def publish_catalog(deadline=None, trigger='scheduled'):
    import vm1_backup as backup
    # Shared helper code stays unchanged. Its guard cancels sockets/locks at cutoff.
    with backup.tw.TransferWindow(trigger, deadline), db() as lock:
        lock.execute("SELECT pg_advisory_xact_lock(hashtextextended('takaneko:reader-catalog',0))")
        # Start the read snapshot after acquiring the publication lock, never before.
        with db() as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
            posts = conn.execute('SELECT resource_key,source_id,member,kind,title,version,created_at,nas_folder,nas_available,nas_layout_ready,nas_migration_pending FROM posts WHERE nas_available AND nas_layout_ready AND NOT nas_migration_pending').fetchall()
            media = conn.execute('SELECT resource_key,media_id,variant,mime,size,sha256,nas_path,nas_available,nas_verified_at FROM media').fetchall()
        payload = build_catalog(posts, media)
        with backup.NAS() as nas:
            return publish_snapshot(nas, payload, ROOT / 'reader-catalog', backup.signature, deadline)
