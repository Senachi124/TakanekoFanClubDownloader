import contextlib
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import archive_layout as layout
import migrate_archive_layout as migration


class ArchiveLayoutTests(unittest.TestCase):
    def fixture(self, root, local=True):
        folder = 'complete/' + 'a'*64 + '/' + 'b'*64
        post = {'resource_key':'takaneko:post:fixture:v1','source_id':'fixture','kind':'post','member':'城月菜央',
                'title':'テスト / お知らせ','body':'# Post\n**Date**: 2020-1-2 0:04:05\n',
                'version':'b'*64,'folder':folder,'nas_folder':'takaneko/media/a/b',
                'local_available':local,'nas_available':not local}
        media = {'media_id':'c'*64,'variant':'original','original_id':None,'relative_path':folder+'/photo.jpg',
                 'nas_path':'takaneko/media/a/b/photo.jpg','sha256':hashlib.sha256(b'original').hexdigest(),
                 'size':8,'mime':'image/jpeg','local_available':local,'nas_available':not local}
        if local:
            directory = root / folder
            directory.mkdir(parents=True)
            (directory/'photo.jpg').write_bytes(b'original')
            (directory/'index.md').write_text(post['body'])
            (directory/'.post-id').write_text('fixture')
        return post, [media]

    @contextlib.contextmanager
    def roots(self, root):
        with patch.object(layout,'ROOT',root), patch.object(migration,'ROOT',root): yield

    def test_readable_path_keeps_member_date_and_resists_unsafe_names(self):
        post, _ = self.fixture(Path('unused'),local=False)
        path = layout.readable_folder(post)
        self.assertEqual(path.parts[:5], ('complete','members','城月菜央','posts','2020-01-02'))
        self.assertTrue(path.parts[5].startswith('000405_テスト _ お知らせ__'))
        post['resource_key'] += '-another'
        self.assertNotEqual(layout.readable_folder(post),path)
        for value in ('../../escape','CON','a\\b:c*?<>|','あ'*200,'\x00...'):
            component = layout.component(value)
            self.assertNotIn(component, ('.','..','CON',''))
            self.assertFalse(any(c in component for c in '/\\:*?<>|\x00'))
            self.assertLessEqual(len(component.encode()),97)
        post['body'] = 'No source date'
        self.assertIn('unknown-date', layout.readable_folder(post).parts)

    def test_move_preserves_bytes_media_identity_nas_and_backup_manifest(self):
        with tempfile.TemporaryDirectory() as tmp, self.roots(Path(tmp)), \
             patch.object(migration.backup,'claim',return_value={'action':'download','lease_token':'fixture'}) as claim, \
             patch.object(migration.backup,'downloaded') as downloaded:
            root=Path(tmp); post,media=self.fixture(root); old=root/post['folder']
            before=migration.manifest(old); identity=media[0]['media_id']; nas=media[0]['nas_path']
            migration.relocate(post,media,MagicMock())
            new=root/post['folder']
            self.assertFalse(old.exists()); self.assertEqual(migration.manifest(new),before)
            self.assertEqual(media[0]['media_id'],identity); self.assertEqual(media[0]['nas_path'],nas)
            self.assertEqual(downloaded.call_args.args[3],new)
            self.assertEqual(json.loads((new.parent/'record.json').read_text())['media'][0]['local_path'],'files/photo.jpg')
            self.assertNotIn('record.json',migration.manifest(new))
            self.assertEqual((new.parent/'index.md').read_text(),post['body'])

    def test_crash_after_rename_recovers_from_journal(self):
        with tempfile.TemporaryDirectory() as tmp, self.roots(Path(tmp)), \
             patch.object(migration.backup,'claim',return_value={'action':'download','lease_token':'fixture'}), \
             patch.object(migration.backup,'downloaded'):
            root=Path(tmp); post,media=self.fixture(root); old=root/post['folder']
            connection=MagicMock(); connection.execute.side_effect=RuntimeError('simulated DB outage')
            with self.assertRaises(RuntimeError): migration.relocate(post,media,connection)
            self.assertFalse(old.exists())
            migration.relocate(post,media,MagicMock())
            self.assertEqual((root/media[0]['relative_path']).read_bytes(),b'original')

    def test_checksum_mismatch_stops_before_move(self):
        with tempfile.TemporaryDirectory() as tmp, self.roots(Path(tmp)):
            root=Path(tmp); post,media=self.fixture(root); old=root/post['folder']
            (old/'photo.jpg').write_bytes(b'changed!')
            with self.assertRaises(ValueError): migration.relocate(post,media,MagicMock())
            self.assertTrue(old.exists())

    def test_nas_only_export_does_not_claim_or_pretend_originals_are_local(self):
        with tempfile.TemporaryDirectory() as tmp, self.roots(Path(tmp)), patch.object(migration.backup,'claim') as claim:
            root=Path(tmp); post,media=self.fixture(root,local=False)
            migration.relocate(post,media,MagicMock())
            record=json.loads((root/post['folder']).parent.joinpath('record.json').read_text())
            self.assertFalse(record['originals_local']); self.assertFalse((root/post['folder']).exists())
            self.assertTrue(record['media'][0]['nas_available']); claim.assert_not_called()
