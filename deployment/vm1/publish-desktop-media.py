"""Publish verified desktop backup files into the application's immutable NAS layout."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import ctypes
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import threading
import uuid


def sha(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def publish(bundle, nas_root, workers=16):
    if os.name != 'nt': raise RuntimeError('Run from the Windows desktop with its existing SMB session')
    if nas_root.rstrip('\\').lower() != r'\\SENACHINAS\Senachi\vm1'.lower(): raise ValueError('NAS scope')
    root = Path('\\\\?\\UNC\\' + nas_root.lstrip('\\'))
    summary = json.loads((bundle / 'summary.json').read_text())
    snapshot = summary['snapshot']
    if not re.fullmatch('[a-zA-Z0-9_-]+', snapshot): raise ValueError('Snapshot')
    backup = root / 'takaneko' / 'desktop-imports' / snapshot
    receipt = json.loads((backup / '_backup-complete.json').read_text())
    if receipt['status'] != 'verified' or receipt['sha256Manifest'] != summary['source_manifest_sha256']:
        raise ValueError('Original backup must be verified first')
    manifest = bundle / 'media-manifest.json'
    if sha(manifest) != summary['media_manifest_sha256']: raise ValueError('Manifest checksum')
    files = json.loads(manifest.read_text(encoding='utf-8'))
    copy_file = ctypes.WinDLL('kernel32', use_last_error=True).CopyFileW
    copy_file.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_int]
    copy_file.restype = ctypes.c_int
    directories, guard = set(), threading.Lock()

    def copy(entry):
        target_parts = PurePosixPath(entry['path']).parts
        source_parts = PurePosixPath(entry['source_path']).parts
        if (len(target_parts) != 5 or target_parts[:2] != ('takaneko', 'media')
                or not all(re.fullmatch('[a-f0-9]{64}', part) for part in target_parts[2:4])
                or len(source_parts) != 3 or any(part in ('', '.', '..') or '\\' in part for part in source_parts + target_parts)):
            raise ValueError('Invalid manifest path')
        source, target = backup.joinpath(*source_parts), root.joinpath(*target_parts)
        with guard: known = target.parent in directories
        if not known:
            target.parent.mkdir(parents=True, exist_ok=True)
            with guard: directories.add(target.parent)
        if not target.exists():
            temp = target.with_name('.vm1-import-' + uuid.uuid4().hex)
            if not copy_file(str(source), str(temp), True): raise ctypes.WinError(ctypes.get_last_error())
            if temp.stat().st_size != entry['size']:
                raise ValueError('Canonical media size mismatch; temporary copy retained')
            temp.rename(target)
        if target.stat().st_size != entry['size'] or sha(target) != entry['sha256']:
            raise ValueError('Existing canonical media differs; refusing overwrite')

    print(f"Publishing {len(files)} files into canonical media storage", flush=True)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(copy, entry) for entry in files]
        try:
            for count, future in enumerate(as_completed(futures), 1):
                future.result()
                if count % 1000 == 0: print(f'Canonical media verified {count}/{len(files)}', flush=True)
        except BaseException:
            for future in futures: future.cancel()
            print('Publication stopped; completed and temporary files retained', flush=True)
            raise
    result = {'status': 'verified', 'snapshot': snapshot, 'files': len(files), 'bytes': sum(f['size'] for f in files),
              'source_manifest_sha256': summary['source_manifest_sha256'], 'media_manifest_sha256': summary['media_manifest_sha256'],
              'completed_at': datetime.now(timezone.utc).isoformat(), 'backup_retained': True}
    receipts = root / 'takaneko' / 'import-receipts'
    receipts.mkdir(parents=True, exist_ok=True)
    target = receipts / (snapshot + '.json')
    if target.exists():
        old = json.loads(target.read_text())
        if old['media_manifest_sha256'] != result['media_manifest_sha256']: raise ValueError('Receipt version conflict')
    else:
        temporary = receipts / ('.vm1-import-' + uuid.uuid4().hex)
        temporary.write_text(json.dumps(result, indent=2), encoding='utf-8')
        temporary.rename(target)
    (bundle / 'publication-result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--nas-root', default=r'\\SENACHINAS\Senachi\vm1')
    parser.add_argument('--workers', type=int, choices=range(1, 33), default=16)
    args = parser.parse_args()
    publish(args.bundle, args.nas_root, args.workers)
