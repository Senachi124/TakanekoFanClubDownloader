"""Exercise the actual sealing helper with synthetic release files and mocked ownership."""
import hashlib
import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

HELPER = Path(__file__).resolve().parents[2] / 'server/deployment/vm1/harden-release.py'


@unittest.skipUnless(os.name == "posix", "Linux deployment sealing")
class ReleaseSealTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('seal_review', HELPER)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.release = self.base / 'release'
        self.release.mkdir()

    def seal(self):
        # Test the unchanged production API without creating files under /opt or changing owner.
        def path(value):
            return self.base if str(value) == '/opt' else Path(value)
        with patch.object(self.module, 'Path', side_effect=path), patch.object(self.module.os, 'geteuid', return_value=0), patch.object(self.module.os, 'chown'):
            return self.module.seal(self.release, 'synthetic-review-revision')

    def test_special_permission_bits_are_removed_before_root_ownership_is_published(self):
        binary = self.release / 'executable'
        binary.write_bytes(b'synthetic executable')
        binary.chmod(0o6777)
        directory = self.release / 'subdir'
        directory.mkdir(mode=0o777)
        directory.chmod(0o2777)
        self.seal()
        self.assertEqual(stat.S_IMODE(binary.stat().st_mode), 0o755)
        self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o755)

    def test_hardlinks_are_split_and_original_release_is_unchanged(self):
        original = self.base / 'previous-release-file'
        original.write_bytes(b'original content')
        original.chmod(0o666)
        deployed = self.release / 'module.py'
        os.link(original, deployed)
        manifest = self.seal()
        self.assertNotEqual(original.stat().st_ino, deployed.stat().st_ino)
        self.assertEqual(stat.S_IMODE(original.stat().st_mode), 0o666)
        self.assertEqual(stat.S_IMODE(deployed.stat().st_mode), 0o644)
        self.assertEqual(manifest['files']['module.py']['sha256'], hashlib.sha256(b'original content').hexdigest())
        original.write_bytes(b'changed old release')
        self.assertEqual(deployed.read_bytes(), b'original content')

    def test_symlinks_do_not_change_external_targets_or_enter_the_manifest(self):
        external = self.base / 'outside'
        external.write_bytes(b'outside source')
        external.chmod(0o666)
        (self.release / 'link').symlink_to(external)
        manifest = self.seal()
        self.assertEqual(external.read_bytes(), b'outside source')
        self.assertEqual(stat.S_IMODE(external.stat().st_mode), 0o666)
        self.assertNotIn('link', manifest['files'])

    def test_special_files_are_rejected(self):
        os.mkfifo(self.release / 'pipe')
        with self.assertRaisesRegex(ValueError, 'Special file'):
            self.seal()


if __name__ == '__main__':
    unittest.main()
