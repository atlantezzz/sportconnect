from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.db import get_connection
from conftest import TEST_PREFIX, clear_notifications, create_activity, future, notifications_of


def listed(client) -> dict:
    response = client.get("/activities")
    assert response.status_code == 200, response.text
    return {row["activiteit_id"]: row for row in response.json()}


def test_activities_require_login(anon):
    assert anon.get("/activities").status_code == 401


def test_create_and_list(user_a):
    created = create_activity(user_a, niveau="Gevorderd")
    row = listed(user_a)[created["activiteit_id"]]
    assert row["niveau"] == "Gevorderd"
    assert row["organisator_naam"] == user_a.user["naam"]
    assert row["deelnemer_ids"] == [user_a.user["gebruiker_id"]]
    assert row["aantal_deelnemers"] == 1
    assert row["status"] == "OPEN"


def test_level_defaults_and_is_validated(user_a):
    created = create_activity(user_a)
    assert created["niveau"] == "Alle niveaus"
    response = user_a.post("/activities", json={
        "sport_id": 1, "titel": f"{TEST_PREFIX} x", "starttijd": future(), "niveau": "Expert",
        "maximaal_aantal_deelnemers": 5,
    })
    assert response.status_code == 422


def test_create_in_the_past_is_refused(user_a):
    response = user_a.post("/activities", json={
        "sport_id": 1, "titel": f"{TEST_PREFIX} verleden", "starttijd": "2020-01-01T10:00",
        "maximaal_aantal_deelnemers": 5,
    })
    assert response.status_code == 422


def test_every_sport_is_saved_with_its_own_sport_id(user_a):
    sports = user_a.get("/sports").json()
    assert len(sports) >= 5
    created = {
        sport["sport_id"]: create_activity(user_a, sport_id=sport["sport_id"], titel=f"{TEST_PREFIX} {sport['naam']}")
        for sport in sports
    }
    rows = listed(user_a)
    for sport in sports:
        row = rows[created[sport["sport_id"]]["activiteit_id"]]
        assert row["sport"] == sport["naam"]


def test_unknown_sport_is_refused(user_a):
    response = user_a.post("/activities", json={
        "sport_id": 99999, "titel": f"{TEST_PREFIX} x", "starttijd": future(), "maximaal_aantal_deelnemers": 5,
    })
    assert response.status_code == 400


def test_update_keeps_address_when_omitted(user_a):
    created = create_activity(user_a)
    response = user_a.put(f"/activities/{created['activiteit_id']}", json={
        "titel": f"{TEST_PREFIX} gewijzigd", "starttijd": future(4), "maximaal_aantal_deelnemers": 12, "niveau": "Beginner",
    })
    assert response.status_code == 200
    updated = response.json()
    assert updated["straatnaam"] == "Teststraat"
    assert updated["breedtegraad"] == 52.09
    assert updated["niveau"] == "Beginner"


def test_update_by_other_user_is_forbidden(user_a, user_b):
    created = create_activity(user_a)
    response = user_b.put(f"/activities/{created['activiteit_id']}", json={
        "titel": f"{TEST_PREFIX} kaping", "starttijd": future(), "maximaal_aantal_deelnemers": 10,
    })
    assert response.status_code == 403


def test_join_leave_and_capacity(user_a, user_b):
    created = create_activity(user_a, maximaal_aantal_deelnemers=2)
    activity_id = created["activiteit_id"]
    clear_notifications(user_a.user["gebruiker_id"])

    assert user_b.post(f"/activities/{activity_id}/join").json() == {"joined": True}
    assert user_b.post(f"/activities/{activity_id}/join").json()["already_joined"] is True
    joined = notifications_of(user_a.user["gebruiker_id"], "participants")
    assert user_b.user["naam"] in joined[-1]["inhoud"]
    assert user_b.user["gebruiker_id"] in listed(user_a)[activity_id]["deelnemer_ids"]

    assert user_a.delete(f"/activities/{activity_id}/join").status_code == 400  # organizer
    assert user_b.delete(f"/activities/{activity_id}/join").json() == {"joined": False}
    assert user_b.delete(f"/activities/{activity_id}/join").status_code == 404


def test_full_activity_refuses_join(user_a, user_b):
    created = create_activity(user_a, maximaal_aantal_deelnemers=2)
    with get_connection() as conn:  # fill the second spot with someone else
        conn.execute(
            'INSERT INTO "ACTIVITEIT_DEELNEMER" (activiteit_id, gebruiker_id, deelname_vanaf, rol) '
            "SELECT %s, gebruiker_id, CURRENT_TIMESTAMP, 'deelnemer' FROM \"GEBRUIKER\" "
            "WHERE gebruiker_id NOT IN (%s, %s) ORDER BY gebruiker_id LIMIT 1",
            (created["activiteit_id"], user_a.user["gebruiker_id"], user_b.user["gebruiker_id"]),
        )
    assert user_b.post(f"/activities/{created['activiteit_id']}/join").status_code == 409


def test_members_only_for_organizer(user_a, user_b):
    created = create_activity(user_a)
    assert user_a.get(f"/activities/{created['activiteit_id']}/members").status_code == 200
    assert user_b.get(f"/activities/{created['activiteit_id']}/members").status_code == 403


def test_cancelled_activity_only_for_organizer_and_participants(user_a, user_b):
    joined = create_activity(user_a, titel=f"{TEST_PREFIX} geannuleerd met b")
    not_joined = create_activity(user_a, titel=f"{TEST_PREFIX} geannuleerd zonder b")
    user_b.post(f"/activities/{joined['activiteit_id']}/join")
    for activity in (joined, not_joined):
        assert user_b.post(f"/activities/{activity['activiteit_id']}/cancel").status_code == 403
        assert user_a.post(f"/activities/{activity['activiteit_id']}/cancel").json() == {"cancelled": True}

    for_a, for_b = listed(user_a), listed(user_b)
    assert for_a[joined["activiteit_id"]]["status"] == "GEANNULEERD"
    assert not_joined["activiteit_id"] in for_a
    assert joined["activiteit_id"] in for_b
    assert not_joined["activiteit_id"] not in for_b
    assert user_b.post(f"/activities/{joined['activiteit_id']}/join").status_code == 400


def test_past_activities_are_hidden(user_a):
    created = create_activity(user_a)
    now = datetime.now(ZoneInfo("Europe/Amsterdam")).replace(tzinfo=None)
    with get_connection() as conn:
        conn.execute('UPDATE "ACTIVITEIT" SET starttijd = %s WHERE activiteit_id = %s',
                     (now - timedelta(hours=1), created["activiteit_id"]))
    assert created["activiteit_id"] in listed(user_a)  # just started: still shown
    with get_connection() as conn:
        conn.execute('UPDATE "ACTIVITEIT" SET starttijd = %s WHERE activiteit_id = %s',
                     (now - timedelta(hours=5), created["activiteit_id"]))
    assert created["activiteit_id"] not in listed(user_a)
    assert user_a.get(f"/activities/{created['activiteit_id']}").status_code == 404


def test_single_activity_matches_list(user_a, user_b, anon):
    created = create_activity(user_a, niveau="Beginner")
    activity_id = created["activiteit_id"]
    response = user_b.get(f"/activities/{activity_id}")
    assert response.status_code == 200, response.text
    assert response.json() == listed(user_b)[activity_id]
    assert anon.get(f"/activities/{activity_id}").status_code == 401
    assert user_a.get("/activities/999999999").status_code == 404


def test_single_cancelled_activity_only_for_organizer_and_participants(user_a, user_b):
    created = create_activity(user_a, titel=f"{TEST_PREFIX} los geannuleerd")
    user_a.post(f"/activities/{created['activiteit_id']}/cancel")
    assert user_a.get(f"/activities/{created['activiteit_id']}").json()["status"] == "GEANNULEERD"
    assert user_b.get(f"/activities/{created['activiteit_id']}").status_code == 404


def test_transfer_organizer(user_a, user_b):
    created = create_activity(user_a)
    activity_id = created["activiteit_id"]
    assert user_a.post(f"/activities/{activity_id}/transfer-organizer",
                       json={"nieuwe_organisator_id": user_b.user["gebruiker_id"]}).status_code == 400
    user_b.post(f"/activities/{activity_id}/join")
    response = user_a.post(f"/activities/{activity_id}/transfer-organizer",
                           json={"nieuwe_organisator_id": user_b.user["gebruiker_id"]})
    assert response.status_code == 200
    assert listed(user_a)[activity_id]["maker_id"] == user_b.user["gebruiker_id"]
