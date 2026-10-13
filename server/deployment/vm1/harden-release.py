#!/usr/bin/env python3
"""Seal a Linux release before activation; never touch configuration or data."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def seal(root, source_revision):
    root=Path(root).resolve(strict=True)
    if os.geteuid()!=0:raise ValueError('Root required')
    if Path('/opt') not in root.parents or root==Path('/opt') or not root.is_dir():
        raise ValueError('Expected an explicit service release under /opt')
    paths=[]
    for directory,dirs,files in os.walk(root,followlinks=False):
        dirs[:]=[n for n in dirs if n!='.git']
        for name in dirs+files:
            p=Path(directory)/name
            st=p.lstat()
            if stat.S_ISLNK(st.st_mode):continue
            if not(stat.S_ISREG(st.st_mode) or stat.S_ISDIR(st.st_mode)):
                raise ValueError('Special file in deployment')
            mode=stat.S_IMODE(st.st_mode)&~0o022
            if stat.S_ISREG(st.st_mode) and st.st_nlink>1:
                expected=digest(p)
                fd,temp=tempfile.mkstemp(prefix='.seal-',dir=p.parent);os.close(fd)
                try:
                    shutil.copy2(p,temp)
                    if digest(Path(temp))!=expected:raise ValueError('Copy mismatch')
                    os.chown(temp,0,0);os.chmod(temp,mode);os.replace(temp,p)
                finally:Path(temp).unlink(missing_ok=True)
            else:os.chown(p,0,0);os.chmod(p,mode)
            paths.append(p)
    os.chown(root,0,0);os.chmod(root,root.stat().st_mode&0o777&~0o022)
    manifest={'version':1,'source_revision':source_revision,
              'sealed_at':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
              'files':{}}
    for p in paths:
        relative=p.relative_to(root)
        if p.is_file() and not any(n in relative.parts for n in ('.venv','venv','node_modules','__pycache__')):
            if p.name!='DEPLOYMENT-MANIFEST.json':manifest['files'][relative.as_posix()]={'sha256':digest(p),'mode':oct(p.stat().st_mode&0o777)}
    target=root/'DEPLOYMENT-MANIFEST.json'
    fd,temp=tempfile.mkstemp(prefix='.manifest-',dir=root)
    try:
        with os.fdopen(fd,'w') as stream:
            json.dump(manifest,stream,ensure_ascii=False,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
        os.chmod(temp,0o644);os.replace(temp,target)
    finally:Path(temp).unlink(missing_ok=True)
    return manifest

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('release');p.add_argument('--source-revision',required=True)
    args=p.parse_args();manifest=seal(args.release,args.source_revision)
    print(json.dumps({'sealed_files':len(manifest['files']),'source_revision':manifest['source_revision']}))

if __name__=='__main__':main()
