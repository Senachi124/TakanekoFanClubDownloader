"""Install a pinned, checksum-verified yt-dlp inside this application release only."""
import hashlib
from pathlib import Path
import urllib.request

VERSION = '2026.08.19'
BASE = f'https://github.com/yt-dlp/yt-dlp/releases/download/{VERSION}/'


def fetch(name):
    request = urllib.request.Request(BASE + name, headers={'User-Agent': 'Takaneko-build'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read(32 * 1024 * 1024)


def main():
    root = Path(__file__).resolve().parents[2]
    directory = root / 'tools'
    directory.mkdir(exist_ok=True)
    target = directory / 'yt-dlp'
    checksums = fetch('SHA2-256SUMS').decode()
    expected = next(line.split()[0] for line in checksums.splitlines() if line.split()[-1] == 'yt-dlp')
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
        target.chmod(0o755)
        print('Application yt-dlp checksum verified:', VERSION)
        return
    data = fetch('yt-dlp')
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError('yt-dlp checksum mismatch')
    temporary = directory / 'yt-dlp.download'
    temporary.write_bytes(data)
    temporary.chmod(0o755)
    temporary.replace(target)
    print('Application yt-dlp installed and verified:', VERSION)


if __name__ == '__main__':
    main()
