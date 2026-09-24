"""Add this service to the existing static directory without restarting the portal."""
import json
from pathlib import Path
import subprocess

path = Path('/opt/vm1-portal/services.json')
services = json.loads(path.read_text())
entry = {'name': 'Takaneko Fanclub Archive', 'category': 'Fanclub 內容封存',
         'description': '下載高嶺のなでしこ的投稿、圖片及影片，瀏覽私人內容庫與 NAS 備份狀態。',
         'url': 'https://vm1.learnfromidol.com:2083/', 'label': 'T'}
services = [s for s in services if s.get('url') != entry['url']] + [entry]
path.write_text(json.dumps(services, ensure_ascii=False, indent=2) + '\n')
subprocess.run(['python3', '/opt/vm1-portal/render.py'], check=True)
