"""Import only Fanclub browser state; validate with the fixed official API."""
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit, unquote
from urllib.request import Request, urlopen
from common import CONTROL

API = 'https://api.takanekofc.com'
LOCK = threading.Lock()
CACHE = {'signature': None, 'token': None, 'until': 0}


def allowed_host(host):
    return host.lstrip('.').lower() in ('takanekofc.com', 'www.takanekofc.com', 'api.takanekofc.com')


def parse_import(text):
    if not isinstance(text, str) or not 0 < len(text.encode()) <= 512 * 1024:
        raise ValueError('登入檔案不可超過 512 KiB。')
    text = text.lstrip('\ufeff').strip()
    cookies, storage = [], {}
    try: value = json.loads(text)
    except ValueError:
        if '\t' not in text and not text.startswith('#'):
            # A Cookie request header copied from browser developer tools.
            raw = re.sub(r'^Cookie\s*:\s*', '', text, flags=re.I)
            if '\r' in raw or '\n' in raw: raise ValueError('Cookie 標頭必須為單一行；也可貼上 JSON 或 Netscape 格式。')
            for part in raw.split(';'):
                if not part.strip(): continue
                name, separator, val = part.strip().partition('=')
                if not separator: raise ValueError('請貼上 name=value 格式的 cookies、JSON 或 Netscape 內容。')
                cookies.append({'domain': '.takanekofc.com', 'path': '/', 'name': name.strip(), 'value': val})
        # Netscape cookies.txt, including HttpOnly records.
        for line in text.splitlines() if '\t' in text or text.startswith('#') else []:
            if line.startswith('#HttpOnly_'): line = line[len('#HttpOnly_'):]
            elif line.startswith('#') or not line.strip(): continue
            parts = line.split('\t')
            if len(parts) != 7: raise ValueError('請匯入 JSON 或 Netscape cookies.txt。')
            domain, _, path, secure, expires, name, val = parts
            cookies.append({'domain': domain, 'path': path, 'secure': secure.upper() == 'TRUE', 'expires': expires, 'name': name, 'value': val})
    else:
        if isinstance(value, list): cookies = value
        elif isinstance(value, dict):
            cookies = value.get('cookies', [])
            if value.get('refreshToken'): storage['refreshToken'] = value['refreshToken']
            # Playwright storageState and our browser export both preserve origins.
            origins = value.get('origins', [])
            if not isinstance(origins, list): raise ValueError('登入檔案 origins 格式不正確。')
            for origin in origins:
                if not isinstance(origin, dict): raise ValueError('登入來源格式不正確。')
                if allowed_host(urlsplit(origin.get('origin', '')).hostname or ''):
                    local, session = origin.get('localStorage', []), origin.get('sessionStorage', [])
                    if not isinstance(local, list) or not isinstance(session, list): raise ValueError('登入儲存資料格式不正確。')
                    for item in local + session:
                        if not isinstance(item, dict): raise ValueError('登入儲存項目格式不正確。')
                        if item.get('name') in ('refreshToken', 'accessToken'): storage[item['name']] = item.get('value')
        else: raise ValueError('登入檔案格式不正確。')
    if not isinstance(cookies, list) or len(cookies) > 1000: raise ValueError('Cookies 格式不正確。')
    filtered = []
    for cookie in cookies:
        if not isinstance(cookie, dict): raise ValueError('Cookies 格式不正確。')
        if not allowed_host(str(cookie.get('domain', ''))): continue
        name, val = str(cookie.get('name', '')), str(cookie.get('value', ''))
        if not re.fullmatch(r'[!#$%&\'*+.^_`|~0-9A-Za-z-]+', name) or any(c in val for c in '\r\n;'):
            raise ValueError('Cookie 內容不正確。')
        if len(val) > 16384: raise ValueError('Cookie 內容過長。')
        try: expired = 0 < float(cookie.get('expires', cookie.get('expirationDate', 0))) < time.time()
        except (ValueError, TypeError): expired = False
        if expired: continue
        domain = str(cookie['domain']).lower()
        filtered.append({'domain': domain, 'path': str(cookie.get('path', '/')), 'name': name, 'value': val})
        if name.lower().replace('_', '') in ('refreshtoken', 'accesstoken'):
            storage['refreshToken' if 'refresh' in name.lower() else 'accessToken'] = unquote(val)
    for key, val in storage.items():
        if not isinstance(val, str) or not val or len(val) > 16384 or any(c in val for c in '\r\n'):
            raise ValueError('登入資料格式不正確。')
    if not filtered and not storage: raise ValueError('找不到 takanekofc.com 的有效登入資料。')
    return {'cookies': filtered, **storage}


def cookie_header(state, path):
    return '; '.join(f"{c['name']}={c['value']}" for c in state.get('cookies', [])
                     if c['domain'] in ('.takanekofc.com', 'api.takanekofc.com', '.api.takanekofc.com')
                     and path.startswith(c['path']))


def api_request(path, state, body=None, token=None):
    headers = {'Origin': 'https://takanekofc.com', 'Referer': 'https://takanekofc.com/', 'Accept': 'application/json'}
    cookie = cookie_header(state, path)
    if cookie: headers['Cookie'] = cookie
    if token: headers['Authorization'] = token if token.startswith('Bearer ') else 'Bearer ' + token
    if body is not None: headers['Content-Type'] = 'application/json'
    request = Request(API + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read(1024 * 1024))
    except HTTPError as error:
        raise ValueError(f'Fanclub 登入驗證失敗（HTTP {error.code}），請重新登入官網後匯出。') from None
    except Exception:
        raise ValueError('暫時無法連接 Fanclub，請稍後重試。') from None


def authenticate(state):
    refresh = state.get('refreshToken')
    try:
        response = api_request('/auth/refresh', state, {'refreshToken': refresh} if refresh else {})
        token = response.get('accessToken')
    except ValueError:
        token = state.get('accessToken')
        if not token:
            if not refresh:
                raise ValueError('此 cookies 檔缺少 Fanclub 的 refreshToken；官網將它存於 localStorage。請按「匯出登入資料」產生含登入資料的 JSON。') from None
            raise
    if not token: raise ValueError('登入資料未包含可用的 access token。')
    api_request('/auth/notifications/count', state, token=token)
    return token if token.startswith('Bearer ') else 'Bearer ' + token


def save_import(text, refresh_token=None):
    state = parse_import(text)
    if refresh_token:
        if not isinstance(refresh_token, str) or len(refresh_token) > 16384 or any(c in refresh_token for c in '\r\n'):
            raise ValueError('refreshToken 格式不正確。')
        state['refreshToken'] = refresh_token.strip()
    authenticate(state)  # Invalid files never replace a working login.
    path = CONTROL / ('session-' + secrets.token_hex(8))
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640), 'w') as stream:
        json.dump(state, stream)
    path.replace(CONTROL / 'session.json')


def get_token():
    path = CONTROL / 'session.json'
    if not path.exists(): return (CONTROL / 'token').read_text().strip()
    with LOCK:
        signature = path.stat().st_mtime_ns
        if CACHE['signature'] != signature or time.time() >= CACHE['until']:
            token = authenticate(json.loads(path.read_text()))
            until = time.time() + 240
            try:
                import base64
                payload = token.removeprefix('Bearer ').split('.')[1]
                claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
                until = min(until, float(claims['exp']) - 30)
            except (ValueError, KeyError, IndexError): pass
            CACHE.update(signature=signature, token=token, until=until)
        return CACHE['token']
