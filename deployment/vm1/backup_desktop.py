"""Copy a desktop snapshot to NAS without replacing files; verify every SHA-256."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import threading
import uuid


def extended(value):
    value = os.path.abspath(value)
    if os.name != 'nt' or value.startswith('\\\\?\\'): return Path(value)
    return Path('\\\\?\\UNC\\' + value[2:] if value.startswith('\\\\') else '\\\\?\\' + value)


def sha(file):
    with file.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def copy_snapshot(source, destination, report, resume=False, workers=16):
    source, target, report = extended(source), extended(destination), Path(report).resolve()
    allowed = '\\\\SENACHINAS\\Senachi\\vm1\\takaneko\\'
    if not destination.lower().startswith(allowed.lower()) or '..' in destination: raise ValueError('NAS scope')
    rest = destination[len(allowed):].split('\\')
    if len(rest) != 2 or rest[0] not in ('desktop-imports', 'desktop-thumbnails') or not rest[1]: raise ValueError('Version destination')
    report.mkdir(parents=True, exist_ok=True)
    manifest_path = report / 'manifest.json'
    if resume:
        if not manifest_path.exists(): raise ValueError('Resume requires the original source manifest')
        manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    else:
        if target.exists(): raise ValueError('Refusing to overwrite an existing backup')
        manifest = []
        for file in sorted(source.rglob('*')):
            if file.is_symlink(): raise ValueError('Symlinks are not supported')
            if not file.is_file(): continue
            before = file.stat()
            digest = sha(file)
            after = file.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns): raise ValueError('Source changed')
            manifest.append({'path': str(file.relative_to(source)), 'size': after.st_size,
                             'mtimeTicks': after.st_mtime_ns // 100 + 621355968000000000, 'sha256': digest})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    expected = {item['path'] for item in manifest}
    actual = {str(file.relative_to(source)) for file in source.rglob('*') if file.is_file()}
    if expected != actual: raise ValueError('Source file list changed')
    target.mkdir(parents=True, exist_ok=True)
    directories = set()
    directory_guard = threading.Lock()

    def ensure_directory(directory):
        with directory_guard:
            if directory in directories: return
        # SMB directory creation must not serialize all file-transfer workers.
        directory.mkdir(parents=True, exist_ok=True)
        with directory_guard:
            directories.add(directory)

    def transfer(item):
        relative = Path(item['path'])
        if relative.is_absolute() or '..' in relative.parts: raise ValueError('Unsafe relative path')
        local, remote = source / relative, target / relative
        before = local.stat()
        if before.st_size != item['size'] or before.st_mtime_ns // 100 + 621355968000000000 != item['mtimeTicks']:
            raise ValueError('Source metadata changed')
        ensure_directory(remote.parent)
        if remote.exists():
            if remote.stat().st_size != item['size'] or sha(remote) != item['sha256']: raise ValueError('Existing NAS content differs; refusing overwrite')
            return
        temporary = remote.with_name('.vm1-desktop-' + uuid.uuid4().hex)
        digest = hashlib.sha256()
        with local.open('rb') as src, temporary.open('xb') as dst:
            while block := src.read(1024 * 1024):
                digest.update(block)
                dst.write(block)
        after = local.stat()
        if digest.hexdigest() != item['sha256'] or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError('Source changed during copy; staged data retained')
        os.utime(temporary, ns=(before.st_atime_ns, before.st_mtime_ns))
        temporary.rename(remote)
        if sha(remote) != item['sha256']: raise ValueError('NAS checksum mismatch')

    total = sum(item['size'] for item in manifest)
    print(f'Copying and verifying {len(manifest)} files, {total} bytes', flush=True)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(transfer, item) for item in manifest]
        for count, future in enumerate(as_completed(futures), 1):
            future.result()
            if count % 1000 == 0: print(f'NAS verified {count}/{len(manifest)} files', flush=True)
    after = {str(file.relative_to(source)) for file in source.rglob('*') if file.is_file()}
    if after != expected: raise ValueError('Source changed during backup')
    for item in manifest:
        stat = (source / item['path']).stat()
        if stat.st_size != item['size'] or stat.st_mtime_ns // 100 + 621355968000000000 != item['mtimeTicks']:
            raise ValueError('Source changed during backup')
    remote_files = {str(file.relative_to(target)) for file in target.rglob('*') if file.is_file()}
    if remote_files - {'_backup-manifest.json', '_backup-complete.json'} != expected: raise ValueError('Unexpected NAS files')
    shutil.copyfile(manifest_path, target / '_backup-manifest.json')
    result = {'status': 'verified', 'files': len(manifest), 'bytes': total, 'destination': destination,
              'sha256Manifest': sha(manifest_path), 'completedAt': datetime.now(timezone.utc).isoformat(), 'sourceRetained': True}
    text = json.dumps(result, indent=2)
    (target / '_backup-complete.json').write_text(text, encoding='utf-8')
    (report / 'result.json').write_text(text, encoding='utf-8')
    print(text, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--destination', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--workers', type=int, choices=range(1, 33), default=16)
    args = parser.parse_args()
    copy_snapshot(args.source, args.destination, args.report, args.resume, args.workers)
