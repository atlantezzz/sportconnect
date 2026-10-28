import psycopg
from psycopg.rows import dict_row

from app.config import ACTIVITY_VISIBLE_AFTER_START_HOURS, DATABASE_URL, LOCAL_TIMEZONE


def get_connection():
    # Writes inside `with get_connection() as conn:` commit when the block exits.
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


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
