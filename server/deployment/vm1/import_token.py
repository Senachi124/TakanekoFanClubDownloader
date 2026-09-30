"""Run as takanekoweb; receive an existing desktop token over SSH stdin."""
import os
from pathlib import Path
import sys
token = sys.stdin.read().strip().lstrip('\ufeff')
if not token or len(token) > 8192 or '\n' in token or '\r' in token:
    raise SystemExit('Invalid token input')
path = Path('/var/lib/takaneko-control/token')
with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o640), 'w') as f:
    f.write(token)
print('Desktop token installed without displaying its value.')
