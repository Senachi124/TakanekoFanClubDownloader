"""Readable member/date archives; HTTP identities and immutable file bytes stay independent."""
import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata
import uuid
from collections import defaultdict
from common import ROOT, query
from post_dates import publication_date


def component(value, limit=96):
    text = unicodedata.normalize('NFC', str(value))
    text = re.sub(r'[\x00-\x1f\x7f/\\:*?"<>|]', '_', text).strip(' .')
    text = re.sub(r'\s+', ' ', text)
    text = text.encode('utf-8')[:limit].decode('utf-8', errors='ignore').rstrip(' .') or 'untitled'
    if re.fullmatch(r'(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?', text): text = '_' + text
    return text


def readable_folder(post):
    date = publication_date(post['body'])
    day = date.strftime('%Y-%m-%d') if date else 'unknown-date'
    time = date.strftime('%H%M%S') if date else 'unknown-time'
    key = hashlib.sha256(post['resource_key'].encode()).hexdigest()[:12]
    title = component(post['title'])
    category = 'blogs' if post['kind'] == 'blog' else 'posts'
    return Path('complete') / 'members' / component(post['member'], 72) / category / day / f'{time}_{title}__{key}-v{post["version"][:12]}' / 'files'


def safe_path(relative):
    relative = Path(relative)
    if relative.is_absolute() or not relative.parts or relative.parts[0] != 'complete' or any(p in ('.','..') for p in relative.parts):
        raise ValueError('Invalid archive path')
    result = ROOT
    for part in relative.parts:
        result = result / part
        if result.is_symlink(): raise ValueError('Symlink archive path')
    if not result.resolve().is_relative_to(ROOT.resolve()): raise ValueError('Archive path outside root')
    return result


def atomic_text(path, value):
    if path.is_symlink(): raise ValueError('Symlink metadata')
    temporary = path.with_name('.' + path.name + '-' + uuid.uuid4().hex)
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream: stream.write(value)
        temporary.replace(path)
    finally: temporary.unlink(missing_ok=True)


def write_record(post, media):
    relative = Path(post['folder']) if post['folder'].startswith('complete/members/') else readable_folder(post)
    directory = safe_path(relative).parent
    directory.mkdir(parents=True, exist_ok=True, mode=0o750)
    entries = []
    for item in media:
        entries.append({**{k:item[k] for k in ('media_id','variant','original_id','mime','sha256','size')},
                        'filename': Path(item['relative_path']).name,
                        'local_path': os.path.relpath(safe_path(item['relative_path']), directory),
                        'nas_path': item['nas_path'], 'local_available': item['local_available'], 'nas_available': item['nas_available']})
    date = publication_date(post['body'])
    record = {'schema_version': 1, **{k:post[k] for k in ('resource_key','source_id','member','kind','title','version')},
              'published_at': date.isoformat() if date else None, 'timezone':'Asia/Tokyo', 'text':'index.md',
              'originals_local': post['local_available'], 'nas_directory':post['nas_folder'], 'media':entries}
    # Sidecars live outside files/, so refreshing location metadata cannot alter a helper manifest.
    atomic_text(directory / 'index.md', post['body'])
    atomic_text(directory / 'record.json', json.dumps(record, ensure_ascii=False, indent=2) + '\n')


def refresh_record(key):
    post = query('SELECT * FROM posts WHERE resource_key=%s', (key,), one=True)
    if post: write_record(post, query('SELECT * FROM media WHERE resource_key=%s ORDER BY relative_path', (key,)))


def refresh_catalog():
    media = defaultdict(list)
    for item in query('SELECT * FROM media ORDER BY relative_path'): media[item['resource_key']].append(item)
    for post in query('SELECT * FROM posts'): write_record(post, media[post['resource_key']])


def write_readme():
    directory = safe_path('complete/members')
    directory.mkdir(parents=True, exist_ok=True, mode=0o750)
    atomic_text(directory / 'README.md', r'''# Takaneko 可讀存檔

目錄：成員 / posts（投稿）或 blogs（部落格）/ 日本發佈日期 / 時間_標題__識別碼-版本 /。

- `index.md`：可直接閱讀的投稿內文。
- `record.json`：完整來源 ID、發佈時間、媒體檔名、SHA-256、VM / NAS 位置及可用狀態。
- `files/`：已保存在 VM 的不可變原檔、原始 index.md 與縮圖，保留原媒體檔名。
- NAS-only 投稿只有文字與索引；沒有 files/ 不代表遺失，請查 record.json 的 nas_directory / nas_path。
- NAS 路徑相對於 `\\SENACHINAS\Senachi\vm1`；VM local_path 相對於該份 record.json 所在目錄。
- 舊桌面縮圖在 VM 保留於共用批次，local_path 可指向 complete/desktop-thumbnails；NAS 可讀目錄整理完成後，縮圖位於各投稿的 previews/。

網頁使用資料庫中的穩定 media ID。請勿手動改名、修改或刪除 files/，以免破壞 checksum 與備份。
index.md 與 record.json 可由 server/migrate_archive_layout.py 重建，不包含登入 cookies 或連線憑證。
''')
