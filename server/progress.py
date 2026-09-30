"""Persist real stage counts independently of the legacy completed counter."""
import json
import threading
from common import query


class Progress:
    def __init__(self, job_id, query_fn=query):
        self.job_id = job_id
        self.query = query_fn
        self.lock = threading.RLock()
        self.detailed = set()
        self.value = {key: {'done': 0, 'total': None, 'failed': 0, 'skipped': 0,
                            'state': 'running' if key == 'list' else 'waiting'}
                      for key in ('list', 'details', 'files')}

    def save(self):
        self.query('UPDATE jobs SET progress=%s::jsonb WHERE id=%s', (json.dumps(self.value), self.job_id))

    def listed(self, total, skipped):
        with self.lock:
            self.value['list'].update(done=total, total=total, state='completed')
            for key in ('details', 'files'):
                self.value[key].update(done=skipped, total=total, skipped=skipped, state='running')
            self.save()

    def detail(self, identity):
        with self.lock:
            if identity in self.detailed: return
            self.detailed.add(identity)
            self.value['details']['done'] += 1
            self.save()

    def settled(self, identity, failed=False):
        with self.lock:
            if identity not in self.detailed:
                self.detailed.add(identity)
                self.value['details']['done'] += 1
                self.value['details']['failed'] += int(failed)
            self.value['files']['done'] += 1
            self.value['files']['failed'] += int(failed)
            self.save()

    def finish(self, status):
        with self.lock:
            for value in self.value.values():
                if value['state'] in ('running', 'waiting'):
                    value['state'] = 'cancelled' if status == 'cancelled' else 'failed' if value['failed'] or status == 'failed' else 'completed'
            self.save()
