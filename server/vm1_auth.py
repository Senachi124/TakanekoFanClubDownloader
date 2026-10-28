"""Named VM1 administrators. Each service receives only a password verifier."""
import hashlib
import hmac
import json
import os
from pathlib import Path

def verify(username, password):
    if username != 'sena' or not isinstance(password, str) or len(password) > 512:
        return False
    directory = os.environ.get('CREDENTIALS_DIRECTORY')
    if not directory:
        return False
    record = json.loads((Path(directory) / 'vm1-admin').read_text())
    digest = hashlib.scrypt(password.encode(), salt=record['salt'].encode(), n=16384, r=8, p=1, dklen=64)
    return hmac.compare_digest(digest.hex(), record['hash'])
