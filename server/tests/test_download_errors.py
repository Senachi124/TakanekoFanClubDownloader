import concurrent.futures
import io
import json
import threading
import unittest
from unittest.mock import MagicMock
from download_errors import DownloadError, details, sanitize
import worker


class DownloadErrorTests(unittest.TestCase):
    def test_sanitization_drops_urls_tokens_paths_and_unknown_fields(self):
        raw=[{'itemId':'movie-fixture','kind':'movie','stage':'cover','code':'HTTP_503','message':'secret'},
             {'itemId':'https://private/?token=secret','stage':'/private/path','code':'Bearer secret','kind':'secret'}]
        safe=sanitize(raw)
        self.assertEqual(safe[0],{'itemId':'movie-fixture','kind':'movie','stage':'cover','code':'HTTP_503'})
        self.assertNotIn('secret',json.dumps(safe));self.assertNotIn('private',json.dumps(safe))
        self.assertEqual(details(RuntimeError('token=secret'),{'id':'fixture','kind':'movie'})[0]['code'],'DOWNLOAD_FAILED')

    def test_bridge_retains_structured_diagnostics_without_raw_stderr(self):
        future=concurrent.futures.Future();bridge=object.__new__(worker.Bridge)
        bridge.lock=threading.Lock();bridge.pending={'r':future}
        value={'id':'r','error':'untrusted raw secret','diagnostics':[{'itemId':'fixture','kind':'movie','stage':'video','code':'VIDEO_ID_INVALID'}]}
        bridge.process=MagicMock(stdout=io.StringIO(json.dumps(value)+'\n'))
        bridge.read()
        error=future.exception();self.assertIsInstance(error,DownloadError)
        self.assertNotIn('secret',str(error));self.assertEqual(error.diagnostics[0]['code'],'VIDEO_ID_INVALID')
