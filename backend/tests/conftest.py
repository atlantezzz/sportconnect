"""API tests against the real database, as the two Claude test accounts.

Run with backend/run-tests.sh. Everything a test creates is marked [TEST] (or uses
a claude-test-* e-mail address) and is removed again at the end of the session.
"""
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.db import get_connection
from app.main import app
from app.security import ALL_LIMITERS

TEST_PREFIX = "[TEST]"
REGISTER_EMAIL_PATTERN = "claude-test-reg-%@sportconnect.fit"


def cleanup_test_data():
    with get_connection() as conn:
        activity_ids = [
            row["activiteit_id"]
            for row in conn.execute(
                'SELECT activiteit_id FROM "ACTIVITEIT" WHERE titel LIKE %s', (f"{TEST_PREFIX}%",)
            ).fetchall()
        ]
        if activity_ids:
            conn.execute('DELETE FROM "NOTIFICATIE" WHERE activiteit_id = ANY(%s)', (activity_ids,))
            conn.execute(
                'DELETE FROM "NOTIFICATIE" WHERE bericht_id IN (SELECT b.bericht_id FROM "BERICHT" b '
                'JOIN "GROEPSCHAT" gc ON gc.chat_id = b.chat_id WHERE gc.activiteit_id = ANY(%s))',
                (activity_ids,),
            )
            conn.execute(
                'DELETE FROM "BERICHT" WHERE chat_id IN (SELECT chat_id FROM "GROEPSCHAT" WHERE activiteit_id = ANY(%s))',
                (activity_ids,),
            )
            conn.execute(
                'DELETE FROM "CHATLID" WHERE chat_id IN (SELECT chat_id FROM "GROEPSCHAT" WHERE activiteit_id = ANY(%s))',
                (activity_ids,),
            )
            conn.execute('DELETE FROM "GROEPSCHAT" WHERE activiteit_id = ANY(%s)', (activity_ids,))
            conn.execute('DELETE FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id = ANY(%s)', (activity_ids,))
            conn.execute('DELETE FROM "ACTIVITEIT" WHERE activiteit_id = ANY(%s)', (activity_ids,))
        conn.execute(
            'DELETE FROM "SPORTCONNECT_PRIVATBERICHT" WHERE inhoud LIKE %s', (f"{TEST_PREFIX}%",)
        )
        registered = conn.execute(
            'SELECT gebruiker_id FROM "GEBRUIKER" WHERE email LIKE %s', (REGISTER_EMAIL_PATTERN,)
        ).fetchall()
        test_user_ids = [row["gebruiker_id"] for row in registered]
        if test_user_ids:
            conn.execute('DELETE FROM "NOTIFICATIE" WHERE gebruiker_id = ANY(%s)', (test_user_ids,))
            conn.execute('DELETE FROM "GEBRUIKER" WHERE gebruiker_id = ANY(%s)', (test_user_ids,))


@pytest.fixture(scope="session")
def accounts():
    for name in ("SC_TEST_EMAIL", "SC_TEST_PASSWORD", "SC_TEST2_EMAIL", "SC_TEST2_PASSWORD"):
        if not os.environ.get(name):
            pytest.exit(f"{name} ontbreekt; start de tests via backend/run-tests.sh", returncode=2)
    return {
        "a": (os.environ["SC_TEST_EMAIL"], os.environ["SC_TEST_PASSWORD"]),
        "b": (os.environ["SC_TEST2_EMAIL"], os.environ["SC_TEST2_PASSWORD"]),
    }


@pytest.fixture(scope="session", autouse=True)
def test_data_session(accounts):
    cleanup_test_data()
    with get_connection() as conn:
        saved = conn.execute(
            'SELECT gebruiker_id, naam, leeftijd, geboortedatum, woonplaats, bio, profielfoto, '
            'profiel_openbaar, priveberichten_toestaan, favoriete_sporten_tonen '
            'FROM "GEBRUIKER" WHERE email = ANY(%s)',
            ([accounts["a"][0], accounts["b"][0]],),
        ).fetchall()
    yield
    cleanup_test_data()
    with get_connection() as conn:
        for row in saved:
            conn.execute(
                'UPDATE "GEBRUIKER" SET naam = %s, leeftijd = %s, geboortedatum = %s, woonplaats = %s, bio = %s, '
                'profielfoto = %s, profiel_openbaar = %s, priveberichten_toestaan = %s, '
                'favoriete_sporten_tonen = %s WHERE gebruiker_id = %s',
                (row["naam"], row["leeftijd"], row["geboortedatum"], row["woonplaats"], row["bio"],
                 row["profielfoto"], row["profiel_openbaar"], row["priveberichten_toestaan"],
                 row["favoriete_sporten_tonen"], row["gebruiker_id"]),
            )
        ids = [row["gebruiker_id"] for row in saved]
        conn.execute('DELETE FROM "NOTIFICATIE" WHERE gebruiker_id = ANY(%s)', (ids,))
        conn.execute('DELETE FROM "GEBRUIKER_SPORTVOORKEUR" WHERE gebruiker_id = ANY(%s)', (ids,))
        conn.execute('DELETE FROM "GEBRUIKER_BLOKKADE" WHERE blokkeerder_id = ANY(%s)', (ids,))
    set_friendship(ids[0], ids[1], "accepted")


@pytest.fixture(autouse=True)
def reset_rate_limits():
    for limiter in ALL_LIMITERS:
        limiter.reset()
    yield


def make_client() -> TestClient:
    # https so the Secure session cookie is sent back.
    return TestClient(app, base_url="https://testserver")


def login(email: str, password: str) -> tuple[TestClient, dict]:
    client = make_client()
    response = client.post("/auth/login", json={"email": email, "wachtwoord": password})
    assert response.status_code == 200, response.text
    return client, response.json()["user"]


@pytest.fixture
def anon():
    return make_client()


@pytest.fixture
def user_a(accounts):
    client, user = login(*accounts["a"])
    client.user = user
    return client


@pytest.fixture
def user_b(accounts):
    client, user = login(*accounts["b"])
    client.user = user
    return client


def set_friendship(user_id: int, other_id: int, status: str | None, requested_by: int | None = None, days_ago: int = 0):
    low, high = sorted((user_id, other_id))
    with get_connection() as conn:
        conn.execute(
            'DELETE FROM "SPORTCONNECT_VRIENDSCHAP" WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s',
            (low, high),
        )
        if status:
            conn.execute(
                'INSERT INTO "SPORTCONNECT_VRIENDSCHAP" (gebruiker_laag_id, gebruiker_hoog_id, aangevraagd_door, status, '
                "aangemaakt_op, bijgewerkt_op) VALUES (%s, %s, %s, %s, NOW() - %s * INTERVAL '1 day', NOW() - %s * INTERVAL '1 day')",
                (low, high, requested_by or user_id, status, days_ago, days_ago),
            )


@pytest.fixture
def friends(user_a, user_b):
    set_friendship(user_a.user["gebruiker_id"], user_b.user["gebruiker_id"], "accepted")
    yield
    set_friendship(user_a.user["gebruiker_id"], user_b.user["gebruiker_id"], "accepted")


def future(days: int = 3) -> str:
    start = datetime.now(ZoneInfo("Europe/Amsterdam")).replace(tzinfo=None) + timedelta(days=days)
    return start.replace(second=0, microsecond=0).isoformat()


def create_activity(client: TestClient, **overrides) -> dict:
    payload = {
        "sport_id": 1,
        "titel": f"{TEST_PREFIX} activiteit",
        "starttijd": future(),
        "locatie_naam": "Teststraat 1, Utrecht",
        "woonplaats": "Utrecht",
        "straatnaam": "Teststraat",
        "huisnummer": "1",
        "postcode": "3511 AA",
        "land": "Nederland",
        "breedtegraad": 52.09,
        "lengtegraad": 5.12,
        "maximaal_aantal_deelnemers": 10,
        **overrides,
    }
    response = client.post("/activities", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def notifications_of(user_id: int, kind: str | None = None) -> list[dict]:
    with get_connection() as conn:
        query = 'SELECT type, titel, inhoud, doel_url FROM "NOTIFICATIE" WHERE gebruiker_id = %s'
        params: tuple = (user_id,)
        if kind:
            query += " AND type = %s"
            params += (kind,)
        return conn.execute(query + " ORDER BY notificatie_id", params).fetchall()


def clear_notifications(*user_ids: int):
    with get_connection() as conn:
        conn.execute('DELETE FROM "NOTIFICATIE" WHERE gebruiker_id = ANY(%s)', (list(user_ids),))
