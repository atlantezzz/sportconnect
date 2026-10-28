from urllib.parse import parse_qs, urlparse

import pytest

from app.db import get_connection
from app.mailer import password_changed_email, password_reset_email, welcome_email
from conftest import make_client
from test_auth import register_payload


@pytest.fixture
def sent_mails(monkeypatch):
    """Capture reset/changed mails instead of sending them."""
    mails = []
    monkeypatch.setattr("app.routers.auth.send_password_reset_email",
                        lambda to, naam, url, minutes: mails.append(("reset", to, url)))
    monkeypatch.setattr("app.routers.auth.send_password_changed_email",
                        lambda to, naam: mails.append(("changed", to, None)))
    return mails


@pytest.fixture
def new_account():
    payload = register_payload()
    client = make_client()
    assert client.post("/auth/register", json=payload).status_code == 201
    client.payload = payload
    return client


def token_from(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


def request_reset(email: str):
    return make_client().post("/auth/password-reset/request", json={"email": email})


def test_reset_flow_logs_out_old_sessions(new_account, sent_mails):
    email, old_password = new_account.payload["email"], new_account.payload["wachtwoord"]
    response = request_reset(email)
    assert response.status_code == 200
    assert sent_mails[0][0] == "reset" and sent_mails[0][1] == email
    assert sent_mails[0][2].startswith("https://sportconnect.fit/wachtwoord-herstellen?token=")

    other_device = make_client()
    assert other_device.post("/auth/login", json={"email": email, "wachtwoord": old_password}).status_code == 200

    confirm_client = make_client()
    confirmed = confirm_client.post("/auth/password-reset/confirm",
                                    json={"token": token_from(sent_mails[0][2]), "wachtwoord": "nieuw-wachtwoord-456"})
    assert confirmed.status_code == 200, confirmed.text
    assert confirm_client.get("/auth/me").status_code == 200  # logged in by the reset
    assert ("changed", email, None) in sent_mails

    assert new_account.get("/auth/me").status_code == 401  # old sessions end
    assert other_device.get("/auth/me").status_code == 401
    login = make_client().post
    assert login("/auth/login", json={"email": email, "wachtwoord": old_password}).status_code == 401
    assert login("/auth/login", json={"email": email, "wachtwoord": "nieuw-wachtwoord-456"}).status_code == 200


def test_reset_link_works_once(new_account, sent_mails):
    request_reset(new_account.payload["email"])
    token = token_from(sent_mails[0][2])
    first = make_client().post("/auth/password-reset/confirm", json={"token": token, "wachtwoord": "nieuw-wachtwoord-1"})
    again = make_client().post("/auth/password-reset/confirm", json={"token": token, "wachtwoord": "nieuw-wachtwoord-2"})
    assert first.status_code == 200
    assert again.status_code == 400
    assert "ongeldig of verlopen" in again.json()["detail"]


def test_only_newest_link_works(new_account, sent_mails):
    request_reset(new_account.payload["email"])
    request_reset(new_account.payload["email"])
    old, new = token_from(sent_mails[0][2]), token_from(sent_mails[1][2])
    assert make_client().post("/auth/password-reset/confirm", json={"token": old, "wachtwoord": "nieuw-wachtwoord-1"}).status_code == 400
    assert make_client().post("/auth/password-reset/confirm", json={"token": new, "wachtwoord": "nieuw-wachtwoord-1"}).status_code == 200


def test_expired_link_is_refused(new_account, sent_mails):
    request_reset(new_account.payload["email"])
    with get_connection() as conn:
        conn.execute(
            'UPDATE "WACHTWOORD_HERSTEL" SET verloopt_op = NOW() - INTERVAL \'1 minute\' '
            'WHERE gebruiker_id = (SELECT gebruiker_id FROM "GEBRUIKER" WHERE email = %s)',
            (new_account.payload["email"],),
        )
    response = make_client().post("/auth/password-reset/confirm",
                                  json={"token": token_from(sent_mails[0][2]), "wachtwoord": "nieuw-wachtwoord-1"})
    assert response.status_code == 400


def test_unknown_address_gets_the_same_answer(new_account, sent_mails):
    known = request_reset(new_account.payload["email"]).json()
    unknown = request_reset("bestaat-niet-claude-test@sportconnect.fit").json()
    assert known == unknown
    assert len(sent_mails) == 1


def test_requests_per_address_are_limited(new_account, sent_mails):
    for _ in range(5):
        assert request_reset(new_account.payload["email"]).status_code == 200
    assert len(sent_mails) == 3


def test_short_password_refused(new_account, sent_mails):
    request_reset(new_account.payload["email"])
    response = make_client().post("/auth/password-reset/confirm",
                                  json={"token": token_from(sent_mails[0][2]), "wachtwoord": "kort"})
    assert response.status_code == 422


def test_garbage_token_refused():
    response = make_client().post("/auth/password-reset/confirm", json={"token": "x" * 43, "wachtwoord": "nieuw-wachtwoord-1"})
    assert response.status_code == 400


def test_mail_templates_escape_names_and_contain_links():
    subject, html, text = welcome_email("<b>Eva</b> de Vries")
    assert subject == "Welkom bij SportConnect"
    assert "<b>Eva</b>" not in html and "&lt;b&gt;Eva&lt;/b&gt;" in html
    assert "https://sportconnect.fit/email-logo.png" in html
    _, html, text = password_reset_email("Eva", "https://sportconnect.fit/wachtwoord-herstellen?token=abc", 60)
    # button href + fallback link href + fallback link text
    assert html.count("wachtwoord-herstellen?token=abc") == 3 and "60 minuten" in text
    _, html, _ = password_changed_email("Eva")
    assert "/wachtwoord-vergeten" in html
