import json
import logging
import urllib.error
import urllib.request
from html import escape

from app.config import APP_URL, MAIL_FROM, RESEND_API_KEY

logger = logging.getLogger("sportconnect.mail")

RESEND_URL = "https://api.resend.com/emails"

# Brand colours, matching the site.
GREEN = "#047857"
GREEN_DARK = "#065f46"
INK = "#0f1f16"
MUTED = "#5b6b61"
LINE = "#e1e8e1"
PAGE = "#f1f5f2"
SOFT = "#ecfdf5"
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


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


# ── Layout ───────────────────────────────────────────────────────────────
# Table-based with inline styles: the only layout that renders the same in
# Gmail, Outlook and Apple Mail. Callers pass already-escaped HTML fragments.

def _button(label: str, url: str) -> str:
    return f"""
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
  <tr>
    <td align="center" bgcolor="{GREEN}" style="border-radius:999px;">
      <a href="{escape(url)}" target="_blank"
         style="display:inline-block;padding:14px 28px;font-family:{FONT};font-size:15px;font-weight:700;
                color:#ffffff;text-decoration:none;border-radius:999px;">{label}&nbsp;&rarr;</a>
    </td>
  </tr>
</table>"""


def _layout(preheader: str, title: str, body_html: str, footer_note: str) -> str:
    return f"""<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:{PAGE};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{PAGE};">{escape(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{PAGE};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:560px;background:#ffffff;border:1px solid {LINE};border-radius:20px;overflow:hidden;">
          <tr><td style="height:5px;line-height:5px;font-size:0;background:{GREEN};background-image:linear-gradient(90deg,{GREEN},#10b981,#84cc16);">&nbsp;</td></tr>
          <tr>
            <td style="padding:28px 36px 8px;">
              <a href="{APP_URL}" target="_blank" style="text-decoration:none;">
                <img src="{APP_URL}/email-logo.png" width="200" height="44" alt="SportConnect"
                     style="display:block;border:0;width:200px;height:auto;font-family:{FONT};font-size:22px;font-weight:800;color:{GREEN};">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 36px 32px;font-family:{FONT};color:{INK};">
              <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.01em;color:{INK};">{escape(title)}</h1>
              {body_html}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 28px;border-top:1px solid {LINE};background:#fafcf9;font-family:{FONT};">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:{MUTED};">{footer_note}</p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:{MUTED};">
                <a href="{APP_URL}" target="_blank" style="color:{GREEN};font-weight:700;text-decoration:none;">SportConnect</a>
                &middot; Samen sporten in Nederland
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _paragraph(html: str) -> str:
    return f'<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:{MUTED};">{html}</p>'


def _note(html: str) -> str:
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">'
        f'<tr><td style="padding:14px 16px;background:{SOFT};border-radius:12px;font-size:13px;line-height:1.6;color:{GREEN_DARK};">{html}</td></tr></table>'
    )


# ── Messages ─────────────────────────────────────────────────────────────

WELCOME_STEPS = [
    ("Ontdek wat er gebeurt", "Op de kaart zie je welke activiteiten er bij jou in de buurt zijn."),
    ("Doe mee of organiseer", "Meld je aan voor een activiteit of zet zelf iets neer."),
    ("Stem samen af", "In de groepschat regel je de details met de andere deelnemers."),
]


def welcome_email(naam: str) -> tuple[str, str, str]:
    """(subject, html, text) for a new account."""
    first_name = naam.strip().split(" ")[0] or naam
    subject = "Welkom bij SportConnect"
    steps_html = "".join(
        f"""
<tr>
  <td width="40" valign="top" style="padding:0 0 16px;">
    <div style="width:30px;height:30px;line-height:30px;border-radius:10px;background:{SOFT};color:{GREEN};
                font-family:{FONT};font-size:13px;font-weight:800;text-align:center;">{index}</div>
  </td>
  <td valign="top" style="padding:3px 0 16px;font-family:{FONT};">
    <p style="margin:0;font-size:15px;font-weight:700;color:{INK};">{escape(title)}</p>
    <p style="margin:2px 0 0;font-size:14px;line-height:1.55;color:{MUTED};">{escape(text)}</p>
  </td>
</tr>"""
        for index, (title, text) in enumerate(WELCOME_STEPS, start=1)
    )
    body = (
        _paragraph(f"Hoi {escape(first_name)}, leuk dat je er bent! Je account is klaar. Zo kom je snel in beweging:")
        + f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">{steps_html}</table>'
        + _button("Ontdek activiteiten", APP_URL)
        + _note(
            f'<strong>Tip:</strong> kies je favoriete sporten op je '
            f'<a href="{APP_URL}/profile" style="color:{GREEN_DARK};font-weight:700;">profiel</a>, '
            "dan zie je die activiteiten als eerste."
        )
    )
    html = _layout(
        preheader="Je account is klaar. Ontdek sportactiviteiten bij jou in de buurt.",
        title=f"Welkom bij SportConnect, {first_name}!",
        body_html=body,
        footer_note="Je ontvangt deze e-mail omdat je net een account hebt aangemaakt op SportConnect.",
    )
    text = (
        f"Hoi {first_name},\n\n"
        "Leuk dat je er bent! Je account is klaar. Zo kom je snel in beweging:\n\n"
        + "".join(f"{i}. {title} – {desc}\n" for i, (title, desc) in enumerate(WELCOME_STEPS, start=1))
        + f"\nOntdek activiteiten: {APP_URL}\n\n"
        f"Tip: kies je favoriete sporten op je profiel ({APP_URL}/profile).\n\n"
        "Tot snel op het veld,\nSportConnect"
    )
    return subject, html, text


def password_reset_email(naam: str, reset_url: str, valid_minutes: int) -> tuple[str, str, str]:
    """(subject, html, text) with a one-time reset link."""
    first_name = naam.strip().split(" ")[0] or naam
    subject = "Stel een nieuw wachtwoord in voor SportConnect"
    body = (
        _paragraph(f"Hoi {escape(first_name)}, je hebt gevraagd om je wachtwoord opnieuw in te stellen. "
                   "Klik op de knop om een nieuw wachtwoord te kiezen.")
        + _button("Nieuw wachtwoord instellen", reset_url)
        + f'<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:{MUTED};">'
        f"De link is {valid_minutes} minuten geldig en werkt maar één keer. Werkt de knop niet? Kopieer dan deze link:</p>"
        f'<p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">'
        f'<a href="{escape(reset_url)}" style="color:{GREEN};">{escape(reset_url)}</a></p>'
        + _note("<strong>Heb jij dit niet aangevraagd?</strong> Dan hoef je niets te doen; je wachtwoord blijft hetzelfde.")
    )
    html = _layout(
        preheader=f"Je herstellink is {valid_minutes} minuten geldig.",
        title="Nieuw wachtwoord instellen",
        body_html=body,
        footer_note="Je ontvangt deze e-mail omdat iemand een nieuw wachtwoord heeft aangevraagd voor je SportConnect-account.",
    )
    text = (
        f"Hoi {first_name},\n\n"
        "Je hebt gevraagd om je wachtwoord opnieuw in te stellen. Open deze link om een nieuw wachtwoord te kiezen:\n\n"
        f"{reset_url}\n\n"
        f"De link is {valid_minutes} minuten geldig en werkt maar één keer.\n\n"
        "Heb jij dit niet aangevraagd? Dan hoef je niets te doen; je wachtwoord blijft hetzelfde.\n\n"
        "SportConnect"
    )
    return subject, html, text


def password_changed_email(naam: str) -> tuple[str, str, str]:
    """(subject, html, text) confirming a new password."""
    first_name = naam.strip().split(" ")[0] or naam
    subject = "Je wachtwoord is gewijzigd"
    body = (
        _paragraph(f"Hoi {escape(first_name)}, het wachtwoord van je SportConnect-account is zojuist gewijzigd. "
                   "Voor je veiligheid ben je op al je andere apparaten uitgelogd.")
        + _button("Naar SportConnect", APP_URL)
        + _note(
            "<strong>Was jij dit niet?</strong> Stel dan meteen een nieuw wachtwoord in via "
            f'<a href="{APP_URL}/wachtwoord-vergeten" style="color:{GREEN_DARK};font-weight:700;">wachtwoord vergeten</a>.'
        )
    )
    html = _layout(
        preheader="Je bent op je andere apparaten uitgelogd.",
        title="Je wachtwoord is gewijzigd",
        body_html=body,
        footer_note="Je ontvangt deze e-mail ter bevestiging van een wijziging in je SportConnect-account.",
    )
    text = (
        f"Hoi {first_name},\n\n"
        "Het wachtwoord van je SportConnect-account is zojuist gewijzigd. "
        "Voor je veiligheid ben je op al je andere apparaten uitgelogd.\n\n"
        f"Was jij dit niet? Stel dan meteen een nieuw wachtwoord in: {APP_URL}/wachtwoord-vergeten\n\n"
        "SportConnect"
    )
    return subject, html, text


def send_welcome_email(to: str, naam: str) -> bool:
    return send_email(to, *welcome_email(naam))


def send_password_reset_email(to: str, naam: str, reset_url: str, valid_minutes: int) -> bool:
    return send_email(to, *password_reset_email(naam, reset_url, valid_minutes))


def send_password_changed_email(to: str, naam: str) -> bool:
    return send_email(to, *password_changed_email(naam))
