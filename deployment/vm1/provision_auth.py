"""Create a local admin secret without printing or putting it in source control."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import secrets

target = Path('/etc/takaneko/auth.json')
if not target.exists():
    password = secrets.token_urlsafe(24)
    salt = secrets.token_bytes(16)
    value = {'salt': salt.hex(), 'hash': hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1).hex()}
    with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640), 'w') as f:
        json.dump(value, f)
    os.chown(target, 0, pwd.getpwnam('takanekoweb').pw_gid)
    with os.fdopen(os.open('/etc/takaneko/admin-password', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
        f.write(password + '\n')
