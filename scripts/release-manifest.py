import hashlib
import json
from pathlib import Path
import sys
root=Path(sys.argv[1])
package=json.loads(Path('package.json').read_text())
prefix=f"{package['productName'].replace(' ', '-')}-{package['version']}"
expected=[f'{prefix}-Windows-x64-{kind}.exe' for kind in ('Setup','Portable')]
expected += [f'{prefix}-macOS-{arch}.{ext}' for arch in ('x64','arm64') for ext in ('dmg','zip')]
assert {p.name for p in root.iterdir() if p.suffix in ('.exe','.dmg','.zip')}==set(expected),'Missing or unexpected release artifact'
lines=[]
for name in sorted(expected):
    with (root/name).open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
    lines.append(f'{digest}  {name}\n')
(root/'SHA256SUMS.txt').write_text(''.join(lines),encoding='utf-8')
