#!/usr/bin/env python3
"""Refresh a code-only VM1 snapshot, then run the pinned local MCP server."""
import argparse
import fcntl
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

EXTENSIONS = {'.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.html', '.css',
              '.scss', '.vue', '.svelte', '.sql', '.sh', '.go', '.rs', '.c', '.h', '.md'}
EXACT = {'pyproject.toml', 'package.json', 'requirements.txt', 'requirements.lock',
         'requirements-runtime.lock', 'requirements-build.txt', 'Makefile'}
SKIP = {'.git', '.codex', '.agents', '.aws', '.venv', 'venv', 'node_modules',
        '__pycache__', 'artifacts', 'work', 'tools', 'media', 'queue', 'queues',
        'staging', 'complete', 'cache', 'data', 'logs', 'cookies', 'credentials',
        'secrets', 'backups', 'releases', '.codebase-memory'}


def accepted(relative):
    p = Path(relative)
    if any(part in SKIP or part.startswith(('.', 'upgrade-backup', 'rollback'))
           for part in p.parts):
        return False
    return p.suffix in EXTENSIONS or p.name in EXACT


def refresh(config):
    root = Path(config['snapshot'])
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    records, total = {}, 0
    # Walk only explicitly registered code roots, never /etc, /var/lib or backups.
    for label, name in config['sources'].items():
        source = Path(name).resolve(strict=True)
        forbidden = ('/etc', '/var/lib', '/var/backups', '/var/cache', '/proc', '/sys')
        if any(source == Path(p) or Path(p) in source.parents for p in forbidden):
            raise ValueError('A runtime data/configuration directory cannot be indexed')
        for directory, children, files in os.walk(source, followlinks=False):
            base = Path(directory)
            children[:] = sorted(x for x in children
                                 if accepted_directory(base / x, source))
            for filename in sorted(files):
                original = base / filename
                relative = original.relative_to(source)
                if original.is_symlink() or not accepted(relative):
                    continue
                filters = config.get('include_globs', {}).get(label)
                if filters and not any(fnmatch.fnmatch(str(relative), pattern) for pattern in filters):
                    continue
                raw = original.read_bytes()
                if len(raw) > 2 * 1024 * 1024 or b'\0' in raw:
                    raise ValueError(f'Unexpected large or binary code file: {original}')
                total += len(raw)
                if total > 128 * 1024 * 1024:
                    raise ValueError('Code snapshot exceeds 128 MiB')
                key = str(Path(label) / relative)
                records[key] = {'source': str(original), 'sha256': hashlib.sha256(raw).hexdigest()}
                target = root / key
                if target.is_symlink():
                    raise ValueError('Snapshot must not contain symlinks')
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != records[key]['sha256']:
                    pending = target.with_name(target.name + '.pending')
                    pending.write_bytes(raw)
                    pending.chmod(0o600)
                    pending.replace(target)
    previous_path = root / 'SOURCE-MAP.json'
    previous = json.loads(previous_path.read_text())['files'] if previous_path.exists() else {}
    # Delete only files listed in our own previous code snapshot, never sources.
    for key in previous.keys() - records.keys():
        p = root / key
        if '..' in Path(key).parts or Path(key).is_absolute():
            raise ValueError('Invalid previous snapshot path')
        if p.is_file() and not p.is_symlink():
            p.unlink()
    for directory, _, _ in os.walk(root, topdown=False, followlinks=False):
        p = Path(directory)
        if p != root and not p.is_symlink() and not any(p.iterdir()):
            p.rmdir()
    # These are already filtered code copies, including deployment Python code.
    (root / '.cbmignore').write_text('!deploy/\n!**/deploy/\n')
    result = {'service': config['service'],
              'refreshed_at': datetime.now(ZoneInfo('Asia/Hong_Kong')).isoformat(timespec='seconds'),
              'files': records, 'bytes': total}
    previous_path.write_text(json.dumps(result, indent=2) + '\n')
    previous_path.chmod(0o600)
    return result


def accepted_directory(path, source):
    return not path.is_symlink() and not any(
        part in SKIP or part.startswith(('.', 'upgrade-backup', 'rollback'))
        for part in path.relative_to(source).parts)


def environment(config):
    env = os.environ.copy()
    env.update(CBM_CACHE_DIR=config['cache'], CBM_ALLOWED_ROOT=config['snapshot'],
               CBM_WORKERS='1', CBM_MEM_BUDGET_MB='256', CBM_LOG_LEVEL='error')
    return env


def invoke(config, tool, arguments):
    command = [config['binary'], 'cli', '--quiet', '--json', tool, json.dumps(arguments)]
    result = subprocess.run(command, cwd=config['snapshot'], env=environment(config),
                            capture_output=True, text=True, timeout=240)
    if result.returncode:
        raise RuntimeError(f'{tool} failed: {result.stderr[-2000:]} {result.stdout[-2000:]}')
    payload = json.loads(result.stdout)
    if payload.get('isError'):
        raise RuntimeError(f'{tool} returned an error: {result.stdout[-2000:]}')
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path(__file__).with_suffix('.json'))
    parser.add_argument('--refresh-only', action='store_true')
    parser.add_argument('--index-only', action='store_true')
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--configure', action='store_true')
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    if args.configure:
        root = Path(__file__).resolve().parents[1]
        target = root / '.codex/config.toml'
        if target.exists() and 'VM1 managed codebase memory' not in target.read_text():
            raise RuntimeError('Preserve the existing config; merge the MCP table manually')
        target.write_text('# VM1 managed codebase memory\n[mcp_servers.codebase_memory]\n'
                          'command = "/usr/bin/python3"\nargs = [' + json.dumps(str(Path(__file__).resolve())) + ']\n'
                          'cwd = ' + json.dumps(str(root)) + '\nstartup_timeout_sec = 300\ntool_timeout_sec = 180\nenabled = true\n')
        return
    state = Path(config['cache']).parent
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / 'index.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.status:
            print(json.dumps(invoke(config, 'index_status', {'project_name': config['project']})))
            return
        snapshot = refresh(config)
        if args.refresh_only:
            print(json.dumps({'service': config['service'], 'files': len(snapshot['files']), 'bytes': snapshot['bytes']}))
            return
        indexed = invoke(config, 'index_repository', {'repo_path': config['snapshot'],
                         'name': config['project'], 'mode': 'full', 'doc_candidates': False})
        detail = indexed.get('structuredContent') or json.loads(indexed['content'][0]['text'])
        if detail.get('project') != config['project'] or detail.get('status') != 'indexed':
            raise RuntimeError('Index did not publish the expected named project: ' + json.dumps(detail))
        if args.index_only:
            print(json.dumps({'service': config['service'], 'files': len(snapshot['files']),
                              'bytes': snapshot['bytes'], 'index': indexed}))
            return
    os.chdir(config['snapshot'])
    os.execve(config['binary'], [config['binary'], '--tool-profile=analysis', '--ui=false'], environment(config))


if __name__ == '__main__':
    main()
