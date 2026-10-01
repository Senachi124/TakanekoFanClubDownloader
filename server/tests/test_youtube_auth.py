import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import youtube_auth
import web

COOKIE = '.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsynthetic-secret'


class YouTubeAuthTests(unittest.TestCase):
    def test_storage_validation_and_removal(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(youtube_auth, 'CONTROL', Path(directory)):
            self.assertEqual(youtube_auth.status(), {'configured': False})
            self.assertEqual(youtube_auth.save(COOKIE), {'configured': True})
            file = Path(directory) / 'youtube-cookies.txt'
            original = file.read_bytes()
            if os.name != 'nt': self.assertEqual(file.stat().st_mode & 0o777, 0o640)
            for content in ['', 'SID=synthetic-secret', COOKIE.replace('youtube.com', 'example.com'), 42, 'x'*524289]:
                with self.assertRaises(ValueError): youtube_auth.save(content)
                self.assertEqual(file.read_bytes(), original)
            self.assertEqual(len(list(Path(directory).iterdir())), 1)
            self.assertEqual(youtube_auth.remove(), {'configured': False})
            self.assertEqual(youtube_auth.remove(), {'configured': False})

    def test_routes_require_session_origin_csrf_and_never_return_cookies(self):
        handler=object.__new__(web.Handler)
        handler.path='/api/youtube-cookies'
        handler.respond=MagicMock()
        handler.session=MagicMock(return_value=None)
        handler.get()
        self.assertEqual(handler.respond.call_args.args[0],401)
        handler.headers={'Origin':web.ORIGIN,'Content-Type':'application/json','X-CSRF-Token':'wrong'}
        handler.body=MagicMock(return_value={'action':'save','content':COOKIE})
        handler.session.return_value={'csrf':'test-csrf'}
        handler.do_POST()
        self.assertEqual(handler.respond.call_args.args[0],403)
        handler.headers['X-CSRF-Token']='test-csrf'
        with tempfile.TemporaryDirectory() as directory, patch.object(youtube_auth,'CONTROL',Path(directory)):
            handler.do_POST()
            self.assertEqual(handler.respond.call_args.args,(200,{'configured':True}))
            handler.get()
            self.assertEqual(handler.respond.call_args.args,(200,{'configured':True}))
            handler.body.return_value={'action':'save','content':'secret-malformed'}
            handler.do_POST()
            self.assertEqual(handler.respond.call_args.args,(400,{'error':'YOUTUBE_COOKIES_INVALID'}))
            handler.body.return_value={'action':'remove'}
            handler.do_POST()
            self.assertEqual(handler.respond.call_args.args,(200,{'configured':False}))
            handler.headers['Origin']='https://other.example'
            handler.do_POST()
            self.assertEqual(handler.respond.call_args.args[0],403)
