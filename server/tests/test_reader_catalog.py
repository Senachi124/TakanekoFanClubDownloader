from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit, unquote

import reader_catalog as catalog
import backup_window as window


class FakeNAS:
    host='localhost'
    port=443
    def __init__(self): self.files={}; self.operations=[]; self.corrupt=False
    def path(self, path): return '/fixture/'+path
    def hash(self, path):
        data=self.files.get(path)
        return None if data is None else {'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    def mkdirs(self, path): self.operations.append(('mkdir',path))
    def put_verified(self, source, path, info):
        self.operations.append(('verified',path)); self.files[path]=source.read_bytes()
        assert self.hash(path)=={k:info[k] for k in ('size','sha256')}
    def request(self, method, path, body=None, headers=None):
        self.operations.append((method,path))
        if method=='GET': return 200,self.files[path]
        elif method=='PUT': self.files[path]=b'corrupt' if self.corrupt else body
        elif method=='MOVE':
            target=unquote(urlsplit(headers['Destination']).path).removeprefix('/fixture/')
            self.files[target]=self.files.pop(path)
        else: raise AssertionError(method)
        return 201,b''


class CatalogTests(unittest.TestCase):
    def test_only_verified_complete_posts_with_portable_paths_and_no_bodies(self):
        post=dict(resource_key='one',source_id='1',member='成員',kind='post',title='日本語',version='v1',created_at=datetime.now(timezone.utc),
                  nas_folder=catalog.DESTINATION+'/成員/posts/一/files',nas_available=True,nas_layout_ready=True,nas_migration_pending=False,body='private text')
        item=dict(resource_key='one',media_id='media',variant='original',mime='image/jpeg',size=2,sha256='a'*64,
                  nas_path=catalog.DESTINATION+'/成員/posts/一/files/image.jpg',nas_available=True,nas_verified_at=post['created_at'])
        result=catalog.build_catalog([post,{**post,'resource_key':'pending','nas_layout_ready':False}],[item])
        self.assertEqual(result['total'],1)
        self.assertEqual(result['posts'][0]['text'],'成員/posts/一/index.md')
        self.assertEqual(result['posts'][0]['media'][0]['path'],'成員/posts/一/files/image.jpg')
        self.assertNotIn('body',result['posts'][0]);self.assertNotIn('nas_folder',result['posts'][0])
        self.assertEqual(catalog.build_catalog([post],[{**item,'nas_available':False}])['total'],0)
        with self.assertRaises(ValueError): catalog.build_catalog([post],[{**item,'nas_path':'../secret'}])

    def test_atomic_publication_idempotence_and_failed_pointer_keeps_previous_catalog(self):
        nas=FakeNAS();first={'format':'takaneko-catalog','schema_version':1,'posts':[],'total':0}
        with tempfile.TemporaryDirectory() as tmp:
            result=catalog.publish_snapshot(nas,first,Path(tmp),lambda _:[])
            self.assertTrue(result['changed']);pointer=nas.files[catalog.DESTINATION+'/catalog.json']
            record=json.loads(pointer);self.assertIn(catalog.DESTINATION+'/'+record['catalog'],nas.files)
            self.assertFalse(catalog.publish_snapshot(nas,first,Path(tmp),lambda _:[])['changed'])
            self.assertEqual(sum(op[0]=='MOVE' for op in nas.operations),1)
            nas.corrupt=True
            with self.assertRaisesRegex(RuntimeError,'checksum'): catalog.publish_snapshot(nas,{**first,'posts':[{'fixture':True}],'total':1},Path(tmp),lambda _:[])
            self.assertEqual(nas.files[catalog.DESTINATION+'/catalog.json'],pointer)
            nas.corrupt=False
            catalog.publish_snapshot(nas,{**first,'posts':[{'fixture':True}],'total':1},Path(tmp),lambda _:[])
            self.assertIn(catalog.DESTINATION+'/'+record['catalog'],nas.files)

    def test_deadline_blocks_publication_and_preserves_pointer(self):
        nas=FakeNAS()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(window.WindowClosed): catalog.publish_snapshot(nas,{'total':0},Path(tmp),lambda _:[],time.time()-1)
            self.assertEqual(nas.operations,[])
            def expired_put(*args): raise window.WindowClosed()
            with patch.object(nas,'put_verified',side_effect=expired_put):
                with self.assertRaises(window.WindowClosed): catalog.publish_snapshot(nas,{'total':0},Path(tmp),lambda _:[])
            self.assertFalse(any(op[0]=='MOVE' for op in nas.operations))
