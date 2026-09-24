"""Correct existing catalog dates from stored export metadata; no media files change."""
import sys
from common import db
from post_dates import publication_date


def repair(apply=False):
    changed = missing = 0
    with db() as conn:
        rows = conn.execute('SELECT resource_key,body,created_at FROM posts').fetchall()
        for row in rows:
            date = publication_date(row['body'])
            if date is None:
                missing += 1
            elif date != row['created_at']:
                changed += 1
                if apply:
                    conn.execute('UPDATE posts SET created_at=%s WHERE resource_key=%s', (date, row['resource_key']))
    print({'posts': len(rows), 'corrected' if apply else 'would_correct': changed, 'without_source_date': missing})


if __name__ == '__main__': repair('--apply' in sys.argv)
