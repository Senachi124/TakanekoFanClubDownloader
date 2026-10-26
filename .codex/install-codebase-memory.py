#!/usr/bin/env python3
"""Install the pinned official Linux x86_64 binary after SHA-256 verification."""
import argparse
import hashlib
import io
from pathlib import Path
import tarfile
import urllib.request

VERSION = 'v0.12.1'
ARCHIVE = 'codebase-memory-mcp-linux-amd64-portable.tar.gz'
ARCHIVE_SHA256 = '8c3d0341064301e78ecc84cf7348d4e2c6562a0f57448243ea560aaa34de36c1'
BINARY_SHA256 = '77745491f0a9c346d6da23eed4d92b5feaa31a27a883c9faa4fa9f47c8183705'


def install(target):
    url = f'https://github.com/DeusData/codebase-memory-mcp/releases/download/{VERSION}/{ARCHIVE}'
    with urllib.request.urlopen(url, timeout=90) as response:
        raw = response.read(512 * 1024 * 1024 + 1)
    if hashlib.sha256(raw).hexdigest() != ARCHIVE_SHA256:
        raise RuntimeError('Release archive checksum mismatch')
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        member = next(x for x in archive.getmembers() if x.name == 'codebase-memory-mcp' and x.isfile())
        binary = archive.extractfile(member).read()
    if hashlib.sha256(binary).hexdigest() != BINARY_SHA256:
        raise RuntimeError('Binary checksum mismatch')
    target.parent.mkdir(parents=True, exist_ok=True)
    pending = target.with_name(target.name + '.pending')
    pending.write_bytes(binary)
    pending.chmod(0o755)
    pending.replace(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    install(args.target)
    print(f'Installed {VERSION}: {args.target}')
