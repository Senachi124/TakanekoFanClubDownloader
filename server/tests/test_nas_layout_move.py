import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('nas_move',Path(__file__).resolve().parents[1]/'deployment/vm1/migrate-nas-readable.py')
move=importlib.util.module_from_spec(spec);spec.loader.exec_module(move)


class NASMoveTests(unittest.TestCase):
    def test_verified_move_resumes_without_changing_original_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); nas=root/'nas'; thumbs=root/'thumbs';thumbs.mkdir()
            old='takaneko/media/'+'a'*64+'/'+'b'*64
            new='takaneko/media/members/member/posts/2020-01-01/title/files'
            source=nas/old; source.mkdir(parents=True);(source/'image.jpg').write_bytes(b'original')
            (thumbs/'thumb.jpg').write_bytes(b'thumbnail')
            manifest=root/'manifest.json';manifest.write_text(json.dumps([{'path':old+'/image.jpg','size':8,'sha256':hashlib.sha256(b'original').hexdigest()}]))
            post={'resource_key':'post','old':old,'new':new,'body':'# Text','record':{'title':'title'},'media':[
                {'variant':'thumbnail','relative_path':'complete/desktop-thumbnails/snapshot/thumb.jpg','size':9,
                 'sha256':hashlib.sha256(b'thumbnail').hexdigest(),'new':new.removesuffix('/files')+'/previews/thumb.jpg'}]}
            plan=root/'plan.ndjson';plan.write_text(json.dumps({'manifest_sha256':move.sha(manifest)})+'\n'+json.dumps(post)+'\n')
            receipt=root/'receipt.json'
            for _ in range(2): move.run(plan,manifest,thumbs,receipt,nas,workers=1)
            self.assertFalse(source.exists());self.assertEqual((nas/new/'image.jpg').read_bytes(),b'original')
            self.assertEqual((nas/new).parent.joinpath('index.md').read_text(),'# Text')
            self.assertEqual(json.loads(receipt.read_text())['files'],4)
            with self.assertRaises(ValueError): move.scoped(nas,'takaneko/media/../../../outside')

    def test_existing_different_destination_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'file';path.write_bytes(b'existing')
            with self.assertRaises(ValueError): move.save_bytes(path,b'different')
            self.assertEqual(path.read_bytes(),b'existing')
