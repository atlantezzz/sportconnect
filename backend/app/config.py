import os

DATABASE_URL = os.environ["DATABASE_URL"]
SESSION_SECRET = os.environ["SESSION_SECRET"]
SESSION_COOKIE = "sportconnect_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

# Optional: outgoing e-mail via Resend. Without a key, mails are skipped (logged).
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
MAIL_FROM = os.environ.get("MAIL_FROM", "SportConnect <noreply@sportconnect.fit>")

# Start times are stored as Dutch local time (timestamp without time zone).
LOCAL_TIMEZONE = "Europe/Amsterdam"
# Activities disappear from the overview this long after their start time.
ACTIVITY_VISIBLE_AFTER_START_HOURS = 3

MINIMUM_AGE = 13
