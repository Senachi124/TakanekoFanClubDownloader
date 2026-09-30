import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from progress import Progress

class ProgressTests(unittest.TestCase):
    def test_concurrent_events_are_counted_once_and_failures_remain_visible(self):
        snapshots=[]
        progress=Progress('fixture',lambda sql,args:snapshots.append(json.loads(args[0])))
        progress.listed(100,1)
        def item(i):
            progress.detail(str(i));progress.detail(str(i));progress.settled(str(i),i==4)
        with ThreadPoolExecutor(max_workers=16) as pool: list(pool.map(item,range(99)))
        progress.finish('failed')
        self.assertEqual(progress.value['details']['done'],100)
        self.assertEqual(progress.value['files']['done'],100)
        self.assertEqual(progress.value['files']['failed'],1)
        self.assertEqual(progress.value['files']['skipped'],1)
        self.assertEqual(progress.value['files']['state'],'failed')
        self.assertTrue(all(a['files']['done']<=b['files']['done'] for a,b in zip(snapshots,snapshots[1:])))

    def test_cancellation_and_empty_jobs_have_explicit_states(self):
        progress=Progress('fixture',lambda *args:None)
        progress.listed(0,0);progress.finish('completed')
        self.assertEqual(progress.value['files']['state'],'completed')
        progress.listed(10,0);progress.settled('bad',True);progress.finish('cancelled')
        self.assertEqual(progress.value['details']['failed'],1)
        self.assertEqual(progress.value['files']['done'],1)
        self.assertEqual(progress.value['files']['state'],'cancelled')
