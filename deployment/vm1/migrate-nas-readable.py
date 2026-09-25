"""Windows SMB migration: atomically move existing NAS publications, verify every byte, add portable metadata."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import uuid


def sha(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()


def scoped(root, relative):
    parts=PurePosixPath(relative).parts
    if len(parts)<3 or parts[:2]!=('takaneko','media') or any(p in ('.','..') or '\\' in p or ':' in p for p in parts):
        raise ValueError('Path outside this archive')
    path=root.joinpath(*parts)
    if not path.resolve().is_relative_to(root.resolve()): raise ValueError('Path outside NAS root')
    return path


def save_bytes(path, content):
    digest=hashlib.sha256(content).hexdigest()
    if not path.exists():
        path.parent.mkdir(parents=True,exist_ok=True)
        temp=path.with_name('.takaneko-layout-'+uuid.uuid4().hex)
        temp.write_bytes(content)
        if sha(temp)!=digest: raise ValueError('NAS write verification failed')
        temp.rename(path)
    if path.stat().st_size!=len(content) or sha(path)!=digest: raise ValueError('NAS metadata conflict; refusing overwrite')


def run(plan, manifest, thumbnails, receipt, root, workers=4):
    lines=[json.loads(line) for line in plan.read_text(encoding='utf-8').splitlines()]
    header,posts=lines[0],lines[1:]
    if sha(manifest)!=header['manifest_sha256']: raise ValueError('Original file manifest changed')
    files=json.loads(manifest.read_text(encoding='utf-8'))
    grouped={}
    for entry in files: grouped.setdefault(str(PurePosixPath(entry['path']).parent),[]).append(entry)
    root=Path(root)
    results=[]

    def move(post):
        if not re.fullmatch(r'takaneko/media/[a-f0-9]{64}/[a-f0-9]{64}',post['old']): raise ValueError('Unexpected source layout')
        if not post['new'].startswith('takaneko/media/members/') or not post['new'].endswith('/files'): raise ValueError('Unexpected destination')
        source,target=scoped(root,post['old']),scoped(root,post['new'])
        expected=grouped.get(post['old'])
        if not expected: raise ValueError('Original manifest lacks this post')
        if source.exists():
            if target.exists(): raise ValueError('Both source and destination exist; refusing overwrite')
            names={p.name for p in source.iterdir()}
            if names!={PurePosixPath(e['path']).name for e in expected}: raise ValueError('Source inventory changed')
            target.parent.mkdir(parents=True,exist_ok=True)
            source.rename(target)  # Atomic rename inside the explicitly selected NAS share.
        if not target.is_dir(): raise ValueError('Publication missing in both layouts')
        for entry in expected:
            file=target/PurePosixPath(entry['path']).name
            if not file.is_file() or file.stat().st_size!=entry['size'] or sha(file)!=entry['sha256']:
                raise ValueError('Moved NAS file differs from original manifest')
        thumbs=0
        for media in post['media']:
            if media['variant']!='thumbnail': continue
            thumb=thumbnails/Path(media['relative_path']).name
            if thumb.stat().st_size!=media['size'] or sha(thumb)!=media['sha256']: raise ValueError('Thumbnail checksum mismatch')
            save_bytes(scoped(root,media['new']),thumb.read_bytes()); thumbs+=1
        save_bytes(target.parent/'index.md',post['body'].encode('utf-8'))
        save_bytes(target.parent/'record.json',(json.dumps(post['record'],ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
        try: source.parent.rmdir()  # Empty legacy hash container only; never recursive deletion.
        except OSError: pass
        return {'resource_key':post['resource_key'],'new':post['new'],'files':len(expected)+thumbs+2}

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures=[pool.submit(move,post) for post in posts]
        try:
            for future in as_completed(futures):
                results.append(future.result())
                if len(results)%100==0: print(f'Verified {len(results)}/{len(posts)} readable NAS posts',flush=True)
        except BaseException:
            for future in futures: future.cancel()
            raise
    value={'status':'verified','plan_sha256':sha(plan),'manifest_sha256':sha(manifest),
           'files':sum(p['files'] for p in results),'posts':results}
    receipt.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    print({'verified_posts':len(results),'verified_files':value['files']},flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan',type=Path,required=True)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--thumbnails',type=Path,required=True)
    parser.add_argument('--receipt',type=Path,required=True)
    parser.add_argument('--root',default=r'\\?\UNC\SENACHINAS\Senachi\vm1')
    parser.add_argument('--workers',type=int,default=4)
    args=parser.parse_args()
    run(args.plan,args.manifest,args.thumbnails,args.receipt,args.root,args.workers)
