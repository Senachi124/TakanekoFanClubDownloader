"""Isolated unit suite. The shared host helper is replaced only inside this test process."""
import sys
import types
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
helper=types.ModuleType('vm1_backup')
def forbidden(*args,**kwargs): raise AssertionError('Real NAS operations are forbidden in unit tests')
class NAS:
    def __init__(self,*args,**kwargs): forbidden()
helper.NAS=NAS
for name in ('claim','downloaded','send_directory'): setattr(helper,name,forbidden)
sys.modules['vm1_backup']=helper
suite=unittest.defaultTestLoader.discover(str(Path(__file__).parent),pattern='test_*.py')
result=unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(not result.wasSuccessful())
