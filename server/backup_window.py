"""Hong Kong schedule and cancellable deadline for one isolated backup child."""
from contextlib import contextmanager
from datetime import datetime, timedelta
import signal
import time
from zoneinfo import ZoneInfo

HK = ZoneInfo('Asia/Hong_Kong')


def now():
    return datetime.now(HK)


def is_open(value=None):
    return 3 <= (value or now()).astimezone(HK).hour < 9


def next_window(value=None):
    value = (value or now()).astimezone(HK)
    start = value.replace(hour=3, minute=0, second=0, microsecond=0)
    return start if value < start else start + timedelta(days=1)


def cutoff(value=None):
    value = (value or now()).astimezone(HK)
    return value.replace(hour=9, minute=0, second=0, microsecond=0).timestamp()


class WindowClosed(BaseException):
    """Bypass generic network retry handlers and stop automatic I/O immediately."""


def check(deadline):
    if deadline is not None and time.time() >= deadline:
        raise WindowClosed('Hong Kong automatic backup window closed')


@contextmanager
def deadline_guard(deadline):
    if deadline is None:
        yield
        return
    check(deadline)
    def expired(*_):
        raise WindowClosed('Hong Kong automatic backup window closed')
    previous = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, max(0.000001, deadline-time.time()))
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)
