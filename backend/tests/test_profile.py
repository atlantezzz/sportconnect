from app.db import get_connection
from conftest import clear_notifications, notifications_of, set_friendship


def test_profile_requires_login(anon):
    assert anon.get("/profile").status_code == 401
    assert anon.get("/users/1").status_code == 401


def test_partial_profile_update(user_a):
    response = user_a.put("/profile", json={"bio": "[TEST] bio"})
    assert response.status_code == 200
    profile = response.json()
    assert profile["bio"] == "[TEST] bio"
    assert profile["naam"] == user_a.user["naam"]


def test_birth_date_sets_age_and_is_never_returned(user_a):
    response = user_a.put("/profile", json={"geboortedatum": "1990-01-01"})
    assert response.status_code == 200
    profile = response.json()
    assert profile["leeftijd"] >= 36
    assert "geboortedatum" not in profile
    assert "1990" not in response.text


def test_birth_date_under_13_refused(user_a):
    assert user_a.put("/profile", json={"geboortedatum": "2020-05-05"}).status_code == 422


def test_empty_name_refused(user_a):
    assert user_a.put("/profile", json={"naam": "   "}).status_code == 422


def test_sport_preferences(user_a):
    saved = user_a.put("/profile/sport-preferences", json={"favoriet": ["Padel"], "verborgen": ["Golf"]})
    assert saved.json() == {"favoriet": ["Padel"], "verborgen": ["Golf"]}
    assert user_a.put("/profile/sport-preferences", json={"favoriet": ["Padel"], "verborgen": ["Padel"]}).status_code == 422
    assert user_a.put("/profile/sport-preferences", json={"favoriet": ["Quidditch"]}).status_code == 422


def test_public_profile_of_unknown_user(user_a):
    assert user_a.get("/users/999999").status_code == 404


def test_private_profile_hidden_from_non_friend(user_a, user_b):
    a_id, b_id = user_a.user["gebruiker_id"], user_b.user["gebruiker_id"]
    set_friendship(a_id, b_id, None)
    user_b.put("/profile", json={"profiel_openbaar": False, "bio": "[TEST] geheim"})
    profile = user_a.get(f"/users/{b_id}").json()
    assert profile["afgeschermd"] is True
    assert profile["naam"]
    for hidden in ("bio", "woonplaats", "leeftijd", "profielfoto", "favoriete_sporten"):
        assert hidden not in profile
    assert "[TEST] geheim" not in str(profile)


def test_private_profile_visible_to_friend(user_a, user_b, friends):
    b_id = user_b.user["gebruiker_id"]
    user_b.put("/profile", json={"profiel_openbaar": False, "bio": "[TEST] voor vrienden"})
    profile = user_a.get(f"/users/{b_id}").json()
    assert profile["afgeschermd"] is False
    assert profile["bio"] == "[TEST] voor vrienden"
    assert profile["vriendschapsstatus"] == "accepted"


def test_favorite_sports_respect_setting(user_a, user_b, friends):
    user_b.put("/profile/sport-preferences", json={"favoriet": ["Tennis"]})
    user_b.put("/profile", json={"profiel_openbaar": True, "favoriete_sporten_tonen": False})
    assert user_a.get(f"/users/{user_b.user['gebruiker_id']}").json()["favoriete_sporten"] == []
    user_b.put("/profile", json={"favoriete_sporten_tonen": True})
    assert user_a.get(f"/users/{user_b.user['gebruiker_id']}").json()["favoriete_sporten"] == ["Tennis"]


def test_viewing_a_profile_notifies_once_per_day(user_a, user_b):
    a_id, b_id = user_a.user["gebruiker_id"], user_b.user["gebruiker_id"]
    clear_notifications(a_id, b_id)
    user_a.get(f"/users/{b_id}")
    user_a.get(f"/users/{b_id}")
    views = notifications_of(b_id, "profile_views")
    assert len(views) == 1
    assert views[0]["inhoud"] == f"{user_a.user['naam']} heeft je profiel bekeken."
    assert views[0]["doel_url"] == f"/users/{a_id}"


def test_viewing_own_profile_does_not_notify(user_a):
    a_id = user_a.user["gebruiker_id"]
    clear_notifications(a_id)
    profile = user_a.get(f"/users/{a_id}").json()
    assert profile["eigen_profiel"] is True
    assert notifications_of(a_id, "profile_views") == []


def test_profile_view_notifications_can_be_disabled(user_a, user_b):
    b_id = user_b.user["gebruiker_id"]
    clear_notifications(b_id)
    user_b.put("/notification-preferences", json={"profile_views": False})
    try:
        user_a.get(f"/users/{b_id}")
        assert notifications_of(b_id, "profile_views") == []
    finally:
        user_b.put("/notification-preferences", json={"profile_views": True})


def test_blocked_user_cannot_see_profile(user_a, user_b):
    a_id, b_id = user_a.user["gebruiker_id"], user_b.user["gebruiker_id"]
    with get_connection() as conn:
        conn.execute(
            'INSERT INTO "GEBRUIKER_BLOKKADE" (blokkeerder_id, geblokkeerde_id, aangemaakt_op) '
            'VALUES (%s, %s, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING',
            (b_id, a_id),
        )
    try:
        clear_notifications(b_id)
        assert user_a.get(f"/users/{b_id}").status_code == 404
        assert notifications_of(b_id, "profile_views") == []
    finally:
        with get_connection() as conn:
            conn.execute('DELETE FROM "GEBRUIKER_BLOKKADE" WHERE blokkeerder_id = %s', (b_id,))
