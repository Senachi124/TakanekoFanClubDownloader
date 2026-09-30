from datetime import datetime, timezone
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch, MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import backup_window as window
import backup_worker as worker


class WindowTests(unittest.TestCase):
    def test_boundaries_and_calendar_rollover(self):
        for value,opened in [('02:59:59',False),('03:00:00',True),('08:59:59',True),('09:00:00',False)]:
            stamp=datetime.fromisoformat('2026-09-28T'+value+'+08:00')
            self.assertEqual(window.is_open(stamp),opened)
            self.assertEqual(window.is_open(stamp.astimezone(timezone.utc)),opened)
        self.assertEqual(window.next_window(datetime.fromisoformat('2026-09-28T02:59:00+08:00')).isoformat(),'2026-09-28T03:00:00+08:00')
        self.assertEqual(window.next_window(datetime.fromisoformat('2026-09-30T09:00:00+08:00')).isoformat(),'2026-10-01T03:00:00+08:00')

    def test_restart_and_selection_outside_window_keep_manual_eligible(self):
        stamp=datetime.fromisoformat('2026-09-28T12:00:00+08:00')
        with patch.object(window,'now',return_value=stamp),patch.object(worker,'query') as query:
            worker.recover();worker.next_job()
        sql,args=query.call_args.args
        self.assertFalse(args[1])
        self.assertIn("trigger='manual' OR",sql)
        self.assertIn("(trigger='manual') DESC",sql)
        self.assertEqual(query.call_args_list[1].args[1][0].isoformat(),'2026-09-29T03:00:00+08:00')

    def test_retry_never_spills_past_cutoff(self):
        with patch.object(window,'now',return_value=datetime.fromisoformat('2026-09-28T08:59:00+08:00')),patch.object(worker,'query') as query:
            worker.defer('scheduled',retry=True)
        self.assertEqual(query.call_args.args[1][0].isoformat(),'2026-09-29T03:00:00+08:00')

    def test_enqueue_outside_window_persists_waiting_source_and_next_run(self):
        conn=MagicMock()
        conn.execute.return_value.fetchone.side_effect=[{'nas_enabled':True,'nas_next_at':None,'nas_interval_minutes':30},{'id':'fixture'}]
        with patch.object(window,'now',return_value=datetime.fromisoformat('2026-09-28T09:00:00+08:00')),patch.object(worker,'db') as db:
            db.return_value.__enter__.return_value=conn
            worker.enqueue('scheduled')
        insert=conn.execute.call_args_list[1].args
        self.assertIn("'scheduled'",insert[0])
        self.assertEqual(insert[1][1],'waiting')
        self.assertEqual(insert[1][2].isoformat(),'2026-09-29T03:00:00+08:00')
        self.assertEqual(conn.execute.call_args.args[1][0].isoformat(),'2026-09-29T03:30:00+08:00')

    def test_elapsed_time_excludes_waiting_and_is_recorded_on_failure(self):
        with patch.object(worker,'query') as query,patch.object(worker,'supervise_child',side_effect=RuntimeError('fixture')),patch.object(worker.time,'monotonic',side_effect=[10,75]):
            with self.assertRaises(RuntimeError): worker.supervise({'id':'fixture','trigger':'manual'})
        self.assertIn("status='running'",query.call_args_list[0].args[0])
        self.assertEqual(query.call_args.args[1],(65,'fixture'))

    def test_disabled_or_not_due_schedule_does_not_enqueue(self):
        current=datetime.fromisoformat('2026-09-28T04:00:00+08:00')
        for enabled,next_at in [(False,None),(True,datetime.fromisoformat('2026-09-28T05:00:00+08:00'))]:
            conn=MagicMock()
            conn.execute.return_value.fetchone.return_value={'nas_enabled':enabled,'nas_next_at':next_at}
            with patch.object(window,'now',return_value=current),patch.object(worker,'db') as db:
                db.return_value.__enter__.return_value=conn
                self.assertIsNone(worker.enqueue('scheduled'))
            self.assertEqual(conn.execute.call_count,1)

    @unittest.skipUnless(hasattr(signal,'setitimer'),'Linux deployment deadline')
    def test_deadline_interrupts_upload_readback_lock_and_backoff(self):
        for operation in ('upload','readback','lock','backoff'):
            with self.subTest(operation=operation):
                a,b=socket.socketpair()
                lock=threading.Lock();lock.acquire()
                started=time.monotonic()
                try:
                    with self.assertRaises(window.WindowClosed),window.deadline_guard(time.time()+0.08):
                        if operation=='upload': a.sendall(b'x'*(8*1024*1024))
                        elif operation=='readback': a.recv(1)
                        elif operation=='lock': lock.acquire()
                        else: time.sleep(5)
                    self.assertLess(time.monotonic()-started,1)
                finally: a.close();b.close();lock.release()

    @unittest.skipUnless(hasattr(signal,'setitimer'),'Linux deployment deadline')
    def test_manual_has_no_deadline_and_guard_restores_handler(self):
        before=signal.getsignal(signal.SIGALRM)
        with window.deadline_guard(None): time.sleep(0.01)
        self.assertEqual(signal.getsignal(signal.SIGALRM),before)

    def test_process_watchdog_stops_only_its_automatic_child(self):
        actual_popen=subprocess.Popen
        children=[]
        def spawn(*args,**kwargs):
            child=actual_popen([sys.executable,'-c','import time; time.sleep(20)'])
            children.append(child);return child
        with patch.object(window,'is_open',return_value=True),patch.object(window,'cutoff',return_value=time.time()+0.15),patch.object(worker.subprocess,'Popen',side_effect=spawn),patch.object(worker,'defer') as defer:
            worker.supervise_child({'id':'scheduled','trigger':'scheduled'})
        self.assertIsNotNone(children[0].poll())
        defer.assert_called_once_with('scheduled')

    def test_cleanup_cannot_start_network_after_cutoff(self):
        calls=[]
        class NAS:
            def request(self,*args,**kwargs): calls.append(args)
            def put_verified(self,*args):
                with patch.object(window.time,'time',return_value=11):
                    try: raise window.WindowClosed()
                    finally: self.request('DELETE','temporary')
        def send(*args,**kwargs):
            worker.backup.NAS().put_verified(Path('fixture'),'remote',{'size':1})
        post={'resource_key':'post','member':'m','title':'t','folder':'complete/members/m/posts/date/title/files','version':'v'}
        def query(sql,*args,**kwargs): return [post] if sql.startswith('SELECT * FROM posts') else []
        with patch.object(worker,'query',side_effect=query),patch.object(worker,'prepare',return_value=Path('/fixture')),patch.object(worker.backup,'NAS',NAS),patch.object(worker.backup,'send_directory',side_effect=send),patch.object(window.time,'time',return_value=9):
            with self.assertRaises(window.WindowClosed): worker.run_job({'id':'fixture'},10)
        self.assertEqual(calls,[])
