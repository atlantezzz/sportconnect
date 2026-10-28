import json
import logging
import urllib.error
import urllib.request
from html import escape

from app.config import MAIL_FROM, RESEND_API_KEY

logger = logging.getLogger("sportconnect.mail")

RESEND_URL = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str, text: str) -> bool:
    """Send one e-mail via Resend. Returns False (and logs) when not configured or on failure."""
    if not RESEND_API_KEY:
        logger.info("E-mail niet verstuurd (geen RESEND_API_KEY): %s", subject)
        return False

    body = json.dumps({"from": MAIL_FROM, "to": [to], "subject": subject, "html": html, "text": text})
    request = urllib.request.Request(
        RESEND_URL,
        data=body.encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            # Resend (via Cloudflare) rejects requests with Python's default User-Agent.
            "User-Agent": "SportConnect/1.0 (+https://sportconnect.fit)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, TimeoutError) as error:
        logger.warning("E-mail versturen mislukt (%s): %s", subject, error)
        return False


def send_welcome_email(to: str, naam: str) -> bool:
    safe_name = escape(naam)
    subject = "Welkom bij SportConnect"
    text = (
        f"Hoi {naam},\n\n"
        "Leuk dat je er bent! Op SportConnect vind je sportactiviteiten bij jou in de buurt, "
        "of organiseer je er zelf een.\n\n"
        "Tot snel op het veld,\nSportConnect"
    )
    html = (
        f"<p>Hoi {safe_name},</p>"
        "<p>Leuk dat je er bent! Op SportConnect vind je sportactiviteiten bij jou in de buurt, "
        "of organiseer je er zelf een.</p>"
        '<p><a href="https://sportconnect.fit">Naar SportConnect</a></p>'
        "<p>Tot snel op het veld,<br>SportConnect</p>"
    )
    return send_email(to, subject, html, text)
