import contextlib
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import backup_worker as worker
import archive_layout


class BackupTests(unittest.TestCase):
    def test_snapshot_is_readable_immutable_and_does_not_include_mutable_vm_sidecar(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(worker,'ROOT',Path(tmp)), patch.object(archive_layout,'ROOT',Path(tmp)):
            root=Path(tmp)
            folder='complete/members/member/posts/2020-01-01/title/files'
            source=root/folder; source.mkdir(parents=True)
            (source/'photo.jpg').write_bytes(b'original')
            (source/'index.md').write_text('# Source')
            (source.parent/'record.json').write_text('mutable location state')
            post={'resource_key':'test','source_id':'test','member':'member','kind':'post','title':'title','version':'a'*64,
                  'created_at':datetime(2020,1,1,tzinfo=timezone.utc),'body':'# Source','folder':folder,'local_available':True}
            media=[{'media_id':'b'*64,'variant':'original','mime':'image/jpeg','sha256':hashlib.sha256(b'original').hexdigest(),
                    'size':8,'original_id':None,'relative_path':folder+'/photo.jpg','local_available':True}]
            target=worker.prepare(post,media)
            self.assertEqual((target/'files/photo.jpg').read_bytes(),b'original')
            record=json.loads((target/'record.json').read_text())
            self.assertEqual(record['media'][0]['path'],'files/photo.jpg')
            self.assertNotIn('local_path',record['media'][0])
            (source.parent/'record.json').write_text('changed state')
            self.assertEqual(worker.prepare(post,media),target)
            self.assertEqual(json.loads((target/'record.json').read_text()),record)

    def test_backup_failure_does_not_update_download_job_or_settings(self):
        updates=[]
        def query(sql,params=(),one=False):
            if sql.startswith('SELECT * FROM posts'): return [{'resource_key':'post','member':'member','title':'title','version':'v','folder':'complete/members/m/posts/date/title/files'}]
            if sql.startswith('SELECT * FROM media'): return []
            updates.append((sql,params))
        with patch.object(worker,'query',side_effect=query), patch.object(worker,'prepare',return_value=Path('/fixture')), \
             patch.object(worker.backup,'send_directory',side_effect=RuntimeError('NAS unavailable')):
            worker.run_job({'id':'backup'})
        self.assertTrue(any("status='failed'" in sql for sql,_ in updates))
        self.assertFalse(any('UPDATE jobs ' in sql or 'UPDATE settings ' in sql for sql,_ in updates))

    def test_verified_file_progress_and_post_completion(self):
        updates=[]
        post={'resource_key':'post','member':'member','title':'title','version':'v','folder':'complete/members/m/posts/date/title/files'}
        def query(sql,params=(),one=False):
            if sql.startswith('SELECT * FROM posts'): return [post]
            if sql.startswith('SELECT * FROM media'): return []
            updates.append((sql,params))
        class NAS:
            def put_verified(self,*args): pass
        def send(*args,**kwargs):
            nas=worker.backup.NAS()
            nas.put_verified(Path('/fixture/image.jpg'),'remote/image.jpg',{'size':8})
            nas.put_verified(Path('/fixture/image.jpg'),'remote/image.jpg',{'size':8})
        conn=MagicMock()
        with patch.object(worker,'query',side_effect=query), patch.object(worker,'prepare',return_value=Path('/fixture')), \
             patch.object(worker,'db',return_value=contextlib.nullcontext(conn)), patch.object(worker,'refresh_record'), \
             patch.object(worker.backup,'NAS',NAS), patch.object(worker.backup,'send_directory',side_effect=send):
            worker.run_job({'id':'backup'})
        self.assertEqual(sum('files_done=files_done+1' in sql for sql,_ in updates),1)
        self.assertTrue(any("status='completed'" in sql for sql,_ in updates))
        self.assertTrue(any('nas_layout_ready=true' in call.args[0] for call in conn.execute.call_args_list))
