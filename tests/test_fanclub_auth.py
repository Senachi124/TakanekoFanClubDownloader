import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import fanclub_auth as auth


class ImportTests(unittest.TestCase):
    def test_netscape_and_domain_filter(self):
        value = auth.parse_import('# Netscape HTTP Cookie File\n#HttpOnly_.takanekofc.com\tTRUE\t/\tTRUE\t0\trefreshToken\tfixture\n.example.com\tTRUE\t/\tTRUE\t0\tsecret\tdiscard')
        self.assertEqual(value['refreshToken'], 'fixture')
        self.assertEqual(len(value['cookies']), 1)

    def test_storage_state(self):
        value = auth.parse_import(json.dumps({'cookies': [], 'origins': [
            {'origin': 'https://evil.test', 'localStorage': [{'name': 'refreshToken', 'value': 'wrong'}]},
            {'origin': 'https://takanekofc.com', 'localStorage': [{'name': 'refreshToken', 'value': 'correct'}]}
        ]}))
        self.assertEqual(value['refreshToken'], 'correct')

    def test_cookie_injection_rejected(self):
        with self.assertRaises(ValueError):
            auth.parse_import(json.dumps([{'domain': '.takanekofc.com', 'name': 'x', 'value': 'a\r\nInjected: yes'}]))

    def test_validate_refresh_and_membership(self):
        with patch.object(auth, 'api_request', side_effect=[{'accessToken': 'fixture'}, {'count': 3}]) as request:
            self.assertEqual(auth.authenticate({'refreshToken': 'refresh', 'cookies': []}), 'Bearer fixture')
            self.assertEqual(request.call_args_list[0].args[0], '/auth/refresh')
            self.assertEqual(request.call_args_list[1].args[0], '/auth/notifications/count')

    def test_missing_storage_explains_cookie_limitation(self):
        with patch.object(auth, 'api_request', side_effect=ValueError('401')):
            with self.assertRaisesRegex(ValueError, 'localStorage'): auth.authenticate({'cookies': []})


if __name__ == '__main__': unittest.main()
