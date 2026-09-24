from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from post_dates import publication_date


class PublicationDates(unittest.TestCase):
    def test_source_date_is_japan_time_independent_of_download_time(self):
        value = publication_date('# Old post\n\n**Date**: 2023-1-2 0:04:05\n\n---\nBody')
        self.assertEqual(value.astimezone(timezone.utc), datetime(2023, 1, 1, 15, 4, 5, tzinfo=timezone.utc))

    def test_missing_or_invalid_date_uses_catalog_fallback(self):
        for body in ('No date', '**Date**: Invalid', '**Date**: 2023-99-1 0:04:05'):
            self.assertIsNone(publication_date(body))
