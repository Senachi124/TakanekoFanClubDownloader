"""Both desktop exporters write source publication dates in Japan time."""
from datetime import datetime, timedelta, timezone
import re


def publication_date(body):
    match = re.search(r'^\*\*Date\*\*: (\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{2}:\d{2})\s*$', body, re.MULTILINE)
    if match:
        try:
            return datetime.strptime(match[1], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone(timedelta(hours=9)))
        except ValueError: pass
    return None
