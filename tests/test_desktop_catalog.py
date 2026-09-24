import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location('desktop_catalog', Path(__file__).resolve().parents[1] / 'deployment/vm1/build-desktop-catalog.py')
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class DesktopCatalogTests(unittest.TestCase):
    def test_import_preserves_ids_and_nas_paths_and_builds_small_thumbnails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'exported'
            folder = source / 'Fixture Member' / '2024-01-01_120000_Post'
            folder.mkdir(parents=True)
            (folder / '.post-id').write_text('source-id')
            (folder / 'index.md').write_text('# Existing post\nSaved text')
            Image.new('RGB', (1000, 600), 'green').save(folder / 'image.jpg')
            manifest = []
            for file in folder.iterdir():
                manifest.append({'path': str(file.relative_to(source)), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'size': file.stat().st_size})
            manifest_path = root / 'manifest.json'
            manifest_path.write_text(json.dumps(manifest))
            output = root / 'output'
            catalog.build(str(source), str(manifest_path), str(output), 'test-snapshot')
            post = json.loads((output / 'catalog.ndjson').read_text())
            self.assertEqual(post['resource_key'], 'takaneko:post:source-id:v1')
            original = next(m for m in post['media'] if m['variant'] == 'original')
            thumbnail = next(m for m in post['media'] if m['variant'] == 'thumbnail')
            self.assertFalse(original['local_available'])
            self.assertTrue(original['nas_path'].endswith('Fixture Member/2024-01-01_120000_Post/image.jpg'))
            self.assertTrue(thumbnail['local_available'])
            self.assertEqual(thumbnail['original_id'], original['media_id'])
            self.assertLessEqual(thumbnail['width'], 480)


if __name__ == '__main__': unittest.main()
