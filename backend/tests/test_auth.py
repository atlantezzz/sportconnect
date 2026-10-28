import uuid

from app.mailer import send_email
from conftest import make_client


def register_payload(**overrides):
    return {
        "naam": "[TEST] Nieuwe gebruiker",
        "email": f"claude-test-reg-{uuid.uuid4().hex[:8]}@sportconnect.fit",
        "wachtwoord": "geheim-wachtwoord-123",
        "geboortedatum": "1995-06-15",
        "woonplaats": "Utrecht",
        "land": "Nederland",
        **overrides,
    }


def test_me_requires_login(anon):
    response = anon.get("/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Je bent niet ingelogd."


def test_invalid_session_cookie_is_rejected(anon):
    anon.cookies.set("sportconnect_session", "vervalst")
    assert anon.get("/auth/me").status_code == 401


def test_login_and_me(user_a, accounts):
    me = user_a.get("/auth/me").json()["user"]
    assert me["email"] == accounts["a"][0]
    assert "wachtwoord_hash" not in me


def test_wrong_password(accounts, anon):
    response = anon.post("/auth/login", json={"email": accounts["a"][0], "wachtwoord": "fout"})
    assert response.status_code == 401
    assert response.json()["detail"] == "E-mailadres of wachtwoord is onjuist."


def test_failed_logins_are_rate_limited_per_email(accounts, anon):
    email = accounts["a"][0]
    for _ in range(5):
        assert anon.post("/auth/login", json={"email": email, "wachtwoord": "fout"}).status_code == 401
    blocked = anon.post("/auth/login", json={"email": email, "wachtwoord": accounts["a"][1]})
    assert blocked.status_code == 429
    assert "Te veel pogingen" in blocked.json()["detail"]
    assert int(blocked.headers["retry-after"]) > 0


def test_successful_login_resets_failed_attempts(accounts, anon):
    email, password = accounts["a"]
    for _ in range(4):
        anon.post("/auth/login", json={"email": email, "wachtwoord": "fout"})
    assert anon.post("/auth/login", json={"email": email, "wachtwoord": password}).status_code == 200
    for _ in range(4):
        assert anon.post("/auth/login", json={"email": email, "wachtwoord": "fout"}).status_code == 401


def test_login_attempts_are_limited_per_ip(anon):
    for i in range(30):
        anon.post("/auth/login", json={"email": f"onbekend{i}@example.com", "wachtwoord": "x"},
                  headers={"x-forwarded-for": "203.0.113.7"})
    blocked = anon.post("/auth/login", json={"email": "nog-een@example.com", "wachtwoord": "x"},
                        headers={"x-forwarded-for": "203.0.113.7"})
    assert blocked.status_code == 429
    other_ip = anon.post("/auth/login", json={"email": "nog-een@example.com", "wachtwoord": "x"},
                         headers={"x-forwarded-for": "203.0.113.8"})
    assert other_ip.status_code == 401


def test_register_with_birth_date_returns_age_only():
    client = make_client()
    response = client.post("/auth/register", json=register_payload(geboortedatum="2000-01-01"))
    assert response.status_code == 201, response.text
    user = response.json()["user"]
    assert user["leeftijd"] >= 26
    assert "geboortedatum" not in user
    profile = client.get("/profile").json()
    assert "geboortedatum" not in profile
    assert profile["heeft_geboortedatum"] is True


def test_register_refuses_under_13():
    response = make_client().post("/auth/register", json=register_payload(geboortedatum="2020-01-01"))
    assert response.status_code == 422
    assert "13 jaar" in response.json()["detail"]


def test_register_duplicate_email(accounts):
    response = make_client().post("/auth/register", json=register_payload(email=accounts["a"][0]))
    assert response.status_code == 409


def test_registrations_are_rate_limited_per_ip():
    client = make_client()
    headers = {"x-forwarded-for": "198.51.100.4"}
    for _ in range(5):
        assert client.post("/auth/register", json=register_payload(), headers=headers).status_code == 201
    assert client.post("/auth/register", json=register_payload(), headers=headers).status_code == 429


def test_logout_clears_cookie(user_a):
    response = user_a.post("/auth/logout")
    assert response.status_code == 200
    assert "sportconnect_session=" in response.headers["set-cookie"]


def test_send_email_without_key_is_skipped():
    assert send_email("iemand@example.com", "Onderwerp", "<p>x</p>", "x") is False
