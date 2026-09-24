"""Exercise real publication/job coordinator without contacting Fanclub."""
import contextlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import worker


class WorkerTests(unittest.TestCase):
    def test_imported_nas_post_does_not_download_or_claim(self):
        bridge = MagicMock()
        with patch.object(worker, 'query', return_value={'folder': 'unused', 'nas_available': True}), patch.object(worker.backup, 'claim') as claim:
            worker.process_item(bridge, 'unused', {'kind': 'post', 'id': 'imported'}, 'job')
        bridge.call.assert_not_called()
        claim.assert_not_called()

    def test_automatic_backup_waits_for_login(self):
        connection = MagicMock()
        connection.execute.return_value.fetchone.return_value = {'auto_enabled': True, 'due': True}
        with tempfile.TemporaryDirectory() as tmp, patch.object(worker, 'CONTROL', Path(tmp)), \
             patch.object(worker, 'db', return_value=contextlib.nullcontext(connection)):
            self.assertEqual(worker.schedule(), 0)
        statements = [call.args[0] for call in connection.execute.call_args_list]
        self.assertFalse(any('INSERT INTO jobs' in sql for sql in statements))
        self.assertIn('等待匯入', connection.execute.call_args.args[1][0])

    def test_due_automatic_backup_queues_once_and_advances_schedule(self):
        connection = MagicMock()
        connection.execute.return_value.fetchone.side_effect = [
            {'auto_enabled': True, 'due': True}, None, None, {'id': 'queued'}]
        with tempfile.TemporaryDirectory() as tmp, patch.object(worker, 'CONTROL', Path(tmp)), \
             patch.object(worker, 'db', return_value=contextlib.nullcontext(connection)), \
             patch.object(worker.shutil, 'disk_usage', return_value=MagicMock(free=10**12)):
            (Path(tmp) / 'session.json').write_text('{}')
            worker.schedule()
        statements = [call.args[0] for call in connection.execute.call_args_list]
        self.assertEqual(sum('INSERT INTO jobs' in sql for sql in statements), 1)
        self.assertTrue(any('auto_next_at=now()' in sql for sql in statements))

    def test_skip_verified_resource(self):
        bridge = MagicMock()
        with patch.object(worker, 'query', return_value=None), patch.object(worker.backup, 'claim', return_value={'action': 'skip'}):
            worker.process_item(bridge, 'unused', {'kind': 'post', 'id': 'test'}, 'job')
        bridge.call.assert_not_called()

    def test_recover_catalog_before_helper_transition(self):
        bridge = MagicMock()
        with patch.object(worker, 'query', return_value={'folder': 'complete/fixture'}), \
             patch.object(worker.backup, 'claim', return_value={'action': 'download', 'lease_token': 'lease'}), \
             patch.object(worker.backup, 'downloaded') as downloaded:
            worker.process_item(bridge, 'unused', {'kind': 'post', 'id': 'test'}, 'job')
        downloaded.assert_called_once()
        bridge.call.assert_not_called()

    def test_failed_download_never_publishes_and_releases_lease(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(worker, 'ROOT', Path(tmp)), \
             patch.object(worker, 'query', return_value=None), \
             patch.object(worker.backup, 'claim', return_value={'action': 'download', 'lease_token': 'lease'}), \
             patch.object(worker, 'get_token', return_value='fixture'), \
             patch.object(worker, 'publish') as publish, \
             patch.object(worker.subprocess, 'run') as command:
            bridge = MagicMock()
            bridge.call.side_effect = RuntimeError('fixture failed')
            with self.assertRaises(RuntimeError): worker.process_item(bridge, 'unused', {'kind': 'post', 'id': 'test'}, 'job')
            publish.assert_not_called()
            self.assertEqual(command.call_args.args[0][3], 'fail')
            self.assertTrue(any((Path(tmp) / 'staging').rglob('*')))


if __name__ == '__main__': unittest.main()
