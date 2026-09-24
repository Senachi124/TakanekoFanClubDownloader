import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('desktop_backup', Path(__file__).resolve().parents[1] / 'deployment/vm1/backup_desktop.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class DesktopBackupTests(unittest.TestCase):
    def test_smb_rename_failure_verifies_fallback_and_retains_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, target, report = root / 'source', root / 'target', root / 'report'
            source.mkdir()
            (source / 'post.txt').write_bytes(b'original saved post')
            destination = r'\\SENACHINAS\Senachi\vm1\takaneko\desktop-imports\fixture'
            real_rename = Path.rename
            def rename(file, destination):
                if file.name.startswith('.vm1-desktop-'): raise FileNotFoundError('SMB trailing-dot rename')
                return real_rename(file, destination)
            with patch.object(backup, 'extended', side_effect=lambda value: target if value == destination else Path(value)), patch.object(Path, 'rename', rename):
                backup.copy_snapshot(source, destination, report)
            self.assertEqual((target / 'post.txt').read_bytes(), (source / 'post.txt').read_bytes())
            self.assertEqual(json.loads((target / '_backup-complete.json').read_text())['status'], 'verified')
            self.assertEqual(len(list(target.glob('.vm1-desktop-*'))), 0)

    def test_resume_never_overwrites_different_existing_nas_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, target, report = root / 'source', root / 'target', root / 'report'
            source.mkdir()
            (source / 'post.txt').write_bytes(b'original')
            destination = r'\\SENACHINAS\Senachi\vm1\takaneko\desktop-imports\fixture'
            with patch.object(backup, 'extended', side_effect=lambda value: target if value == destination else Path(value)):
                backup.copy_snapshot(source, destination, report)
                (target / 'post.txt').write_bytes(b'different')
                with self.assertRaisesRegex(ValueError, 'refusing overwrite'):
                    backup.copy_snapshot(source, destination, report, resume=True)
            self.assertEqual((source / 'post.txt').read_bytes(), b'original')
            self.assertEqual((target / 'post.txt').read_bytes(), b'different')


if __name__ == '__main__': unittest.main()
