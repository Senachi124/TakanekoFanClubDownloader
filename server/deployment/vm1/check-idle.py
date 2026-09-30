"""Read only this application's jobs. Never starts a download or transfer."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from common import query
busy=query("SELECT (SELECT count(*) FROM jobs WHERE status IN ('queued','running','paused')) + (SELECT count(*) FROM backup_jobs WHERE status IN ('queued','running')) AS count",one=True)['count']
print('Application idle' if not busy else 'Application has pending or active work; deployment deferred')
sys.exit(bool(busy))
