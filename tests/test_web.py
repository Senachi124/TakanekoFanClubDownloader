import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import web


class MediaTests(unittest.TestCase):
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
