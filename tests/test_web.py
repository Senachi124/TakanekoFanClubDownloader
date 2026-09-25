import os
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import web


class MediaTests(unittest.TestCase):
    def test_nas_rename_race_retries_new_path_after_both_initial_paths_404(self):
        row={'media_id':'a'*64,'relative_path':'complete/members/post/files/image.jpg','nas_path':'takaneko/media/members/post/files/image.jpg',
             'nas_previous_path':'takaneko/media/old/version/image.jpg','nas_available':True,'size':8,'sha256':'b'*64,'mime':'image/jpeg'}
        class Response(io.BytesIO):
            def __init__(self,status,body): super().__init__(body);self.status=status
            def getheader(self,name,default=None): return '8' if name=='Content-Length' else default
        connections=[]
        for status in (404,404,200):
            conn=MagicMock();conn.getresponse.return_value=Response(status,b'original' if status==200 else b'');connections.append(conn)
        nas=MagicMock();nas.auth='fixture';nas.path.side_effect=lambda path:path;nas.connect.side_effect=connections
        handler=object.__new__(web.Handler);handler.command='GET';handler.headers={};handler.wfile=io.BytesIO()
        handler.send_response=MagicMock();handler.send_header=MagicMock();handler.end_headers=MagicMock();handler.respond=MagicMock()
        with patch.object(web,'query',return_value=row),patch.object(web,'open_local',side_effect=FileNotFoundError),patch.object(web,'ReadOnlyNAS',return_value=nas):
            handler.media(row['media_id'])
        self.assertEqual(handler.wfile.getvalue(),b'original')
        self.assertEqual([c.request.call_args.args[1] for c in connections],[row['nas_path'],row['nas_previous_path'],row['nas_path']])
        handler.respond.assert_not_called()

    def test_range_and_conditions(self):
        self.assertEqual(web.selection(10, {'Range': 'bytes=2-5'}, '"abc"'), (206, 2, 5))
        self.assertEqual(web.selection(10, {'Range': 'bytes=-3'}, '"abc"'), (206, 7, 9))
        self.assertEqual(web.selection(10, {'Range': 'bytes=3-', 'If-Range': '"old"'}, '"abc"'), (200, 0, 9))
        self.assertEqual(web.selection(10, {'If-None-Match': 'W/"abc"'}, '"abc"'), (304, 0, -1))
        for value in ['bytes=10-', 'bytes=3-1', 'bytes=-0', 'bytes=1-2,4-5']:
            with self.assertRaises(ValueError): web.selection(10, {'Range': value}, '"abc"')

    def test_local_path_rejects_escape_and_symlinks(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(web, 'ROOT', Path(temp)):
            root = Path(temp)
            (root / 'complete').mkdir()
            (root / 'complete' / 'ok').write_bytes(b'content')
            with web.open_local('complete/ok') as file: self.assertEqual(file.read(), b'content')
            for value in ['../secret', '/etc/passwd', 'complete/../secret']:
                with self.assertRaises(ValueError): web.open_local(value)
            (root / 'complete' / 'link').symlink_to('/etc/passwd')
            with self.assertRaises(OSError): web.open_local('complete/link')
            (root / 'complete' / 'dir').symlink_to('/etc', target_is_directory=True)
            with self.assertRaises(OSError): web.open_local('complete/dir/passwd')


if __name__ == '__main__': unittest.main()
