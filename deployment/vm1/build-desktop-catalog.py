"""Prepare metadata and thumbnails from an immutable desktop backup manifest."""
import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
import mimetypes
import os
from pathlib import Path, PurePosixPath
import re
from PIL import Image, ImageOps


def digest(path):
    with path.open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()


def build(source, manifest_path, output, snapshot):
    if not re.fullmatch('[a-zA-Z0-9_-]+', snapshot): raise ValueError('Unsafe snapshot name')
    source = Path(source)
    if os.name == 'nt' and not str(source).startswith('\\\\?\\'):
        source = Path('\\\\?\\' + str(source.resolve()))
    output = Path(output)
    thumbs = output / 'thumbnails'
    thumbs.mkdir(parents=True, exist_ok=True)
    entries = json.loads(Path(manifest_path).read_text(encoding='utf-8-sig'))
    by_folder = {}
    for entry in entries:
        relative = PurePosixPath(entry['path'].replace('\\', '/'))
        if len(relative.parts) != 3 or relative.parts[1] == 'pictures': continue
        by_folder.setdefault(str(relative.parent), []).append({**entry, 'name': relative.name})
    stats = {'posts': 0, 'media': 0, 'thumbnails': 0, 'missing_ids': 0, 'duplicate_ids': 0}
    seen = set()
    with (output / 'catalog.ndjson').open('w', encoding='utf-8') as stream:
        for relative, files in sorted(by_folder.items()):
            names = {f['name']: f for f in files}
            if 'index.md' not in names: continue
            folder = source.joinpath(*relative.split('/'))
            member = relative.split('/')[0]
            body = (folder / 'index.md').read_text(encoding='utf-8-sig')
            if digest(folder / 'index.md') != names['index.md']['sha256']: raise ValueError('Source markdown changed')
            kind = 'blog' if member == 'マネージャーブログ' else 'post'
            if '.post-id' in names:
                source_id = (folder / '.post-id').read_text(encoding='utf-8-sig').strip()
                if digest(folder / '.post-id') != names['.post-id']['sha256']: raise ValueError('Source ID changed')
            else:
                source_id = hashlib.sha256(relative.encode()).hexdigest()
                kind = 'legacy'
                stats['missing_ids'] += 1
            key = f'takaneko:{kind}:{source_id}:v1'
            if key in seen: stats['duplicate_ids'] += 1; continue
            seen.add(key)
            title = body.splitlines()[0].removeprefix('# ').strip() if body else relative.split('/')[-1]
            version = hashlib.sha256(''.join(f['name'] + f['sha256'] for f in sorted(files, key=lambda f: f['name'])).encode()).hexdigest()
            identity = hashlib.sha256(key.encode()).hexdigest()
            nas_folder = f'takaneko/desktop-imports/{snapshot}/{relative}'
            local_folder = f'complete/desktop-imports/{snapshot}/{identity}'
            try: created_at = datetime.strptime(relative.split('/')[1][:17], '%Y-%m-%d_%H%M%S').replace(tzinfo=timezone(timedelta(hours=9))).isoformat()
            except ValueError: created_at = datetime.now(timezone.utc).isoformat()
            media = []
            for entry in files:
                name = entry['name']
                mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
                if not mime.startswith(('image/', 'video/')) or mime == 'image/svg+xml': continue
                media_id = hashlib.sha256((key + ':' + version + ':' + name).encode()).hexdigest()
                width = height = None
                if mime.startswith('image/'):
                    try:
                        with Image.open(folder / name) as image:
                            width, height = image.size
                            image = ImageOps.exif_transpose(image)
                            image.thumbnail((480, 480))
                            target = thumbs / (media_id + '.jpg')
                            image.convert('RGB').save(target, quality=82)
                        thumb_hash = digest(target)
                        media.append({'media_id': hashlib.sha256((media_id + ':thumbnail').encode()).hexdigest(),
                                      'variant': 'thumbnail', 'relative_path': f'complete/desktop-thumbnails/{snapshot}/{target.name}',
                                      'nas_path': f'takaneko/desktop-thumbnails/{snapshot}/{target.name}',
                                      'sha256': thumb_hash, 'size': target.stat().st_size, 'mime': 'image/jpeg',
                                      'width': image.width, 'height': image.height, 'original_id': media_id, 'local_available': True})
                        stats['thumbnails'] += 1
                    except (OSError, ValueError): pass
                media.append({'media_id': media_id, 'variant': 'original', 'relative_path': local_folder + '/' + name,
                              'nas_path': nas_folder + '/' + name, 'sha256': entry['sha256'], 'size': entry['size'],
                              'mime': mime, 'width': width, 'height': height, 'original_id': None, 'local_available': False})
            post = {'resource_key': key, 'source_id': source_id, 'kind': kind, 'title': title, 'member': member,
                    'body': body, 'folder': local_folder, 'nas_folder': nas_folder, 'version': version,
                    'created_at': created_at, 'media': media}
            stream.write(json.dumps(post, ensure_ascii=False) + '\n')
            stats['posts'] += 1
            stats['media'] += len(media)
            if stats['posts'] % 1000 == 0: print(f"Prepared {stats['posts']} posts", flush=True)
    summary = {**stats, 'snapshot': snapshot, 'source_manifest_sha256': digest(Path(manifest_path)),
               'catalog_sha256': digest(output / 'catalog.ndjson')}
    (output / 'summary.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--snapshot', required=True)
    args = parser.parse_args()
    build(args.source, args.manifest, args.output, args.snapshot)
