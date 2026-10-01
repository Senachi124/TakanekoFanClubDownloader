"""Private YouTube cookie storage. Validation is shared with the desktop app."""
import os
from pathlib import Path
import secrets
import subprocess
from common import CONTROL


def status():
    return {'configured': (CONTROL / 'youtube-cookies.txt').is_file()}


def save(content):
    if not isinstance(content, str) or not 0 < len(content.encode()) <= 512 * 1024:
        raise ValueError('YOUTUBE_COOKIES_INVALID')
    validator = Path(__file__).resolve().parents[1] / 'src/main/utils/youtubeCookies.js'
    result = subprocess.run(['node', str(validator)], input=content, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15)
    if result.returncode != 0:
        raise ValueError('YOUTUBE_COOKIES_INVALID')
    temporary = CONTROL / ('youtube-cookies-' + secrets.token_hex(12))
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
        with os.fdopen(fd, 'w') as stream:
            stream.write(result.stdout)
        temporary.replace(CONTROL / 'youtube-cookies.txt')
    finally:
        temporary.unlink(missing_ok=True)
    return status()


def remove():
    (CONTROL / 'youtube-cookies.txt').unlink(missing_ok=True)
    return status()
