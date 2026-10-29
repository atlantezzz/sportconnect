import threading

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import ACTIVITY_VISIBLE_AFTER_START_HOURS, DATABASE_URL, LOCAL_TIMEZONE


# Shared connections instead of a new one per request; checked before use so a
# database restart doesn't leave broken connections behind.
_pool = ConnectionPool(
    DATABASE_URL,
    min_size=1,
    max_size=20,
    kwargs={"row_factory": dict_row},
    check=ConnectionPool.check_connection,
    open=False,
)
_pool_lock = threading.Lock()
_pool_opened = False


def get_connection():
    # Writes inside `with get_connection() as conn:` commit when the block exits
    # (rollback on an exception); the connection then goes back to the pool.
    global _pool_opened
    if not _pool_opened:
        with _pool_lock:
            if not _pool_opened:
                _pool.open()
                _pool_opened = True
    return _pool.connection()


# Current Dutch local time, comparable with "ACTIVITEIT".starttijd.
LOCAL_NOW_SQL = f"(now() AT TIME ZONE '{LOCAL_TIMEZONE}')"

# An activity is still "current" until a few hours after it started.
ACTIVITY_NOT_PAST_SQL = (
    f"a.starttijd >= {LOCAL_NOW_SQL} - INTERVAL '{ACTIVITY_VISIBLE_AFTER_START_HOURS} hours'"
)

# Age from the birth date (table alias g); accounts from before 003 only have "leeftijd".
AGE_SQL = (
    f"COALESCE(EXTRACT(YEAR FROM age(({LOCAL_NOW_SQL})::date, g.geboortedatum))::int, g.leeftijd)"
)
