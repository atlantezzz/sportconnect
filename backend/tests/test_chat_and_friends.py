from app.db import get_connection
from conftest import TEST_PREFIX, clear_notifications, create_activity, notifications_of, set_friendship


def chat_rows(activity_id: int) -> int:
    with get_connection() as conn:
        return conn.execute(
            'SELECT COUNT(*) AS n FROM "GROEPSCHAT" WHERE activiteit_id = %s', (activity_id,)
        ).fetchone()["n"]


def test_reading_a_chat_writes_nothing(user_a):
    created = create_activity(user_a)
    activity_id = created["activiteit_id"]
    assert user_a.get(f"/activities/{activity_id}/chat").json()["chat_id"] is None
    assert user_a.get(f"/activities/{activity_id}/chat/messages").json() == {"messages": []}
    assert chat_rows(activity_id) == 0


def test_chat_only_for_members(user_a, user_b, anon):
    created = create_activity(user_a)
    activity_id = created["activiteit_id"]
    assert anon.get(f"/activities/{activity_id}/chat/messages").status_code == 401
    assert user_b.get(f"/activities/{activity_id}/chat/messages").status_code == 403
    assert user_b.post(f"/activities/{activity_id}/chat/messages", json={"inhoud": f"{TEST_PREFIX} x"}).status_code == 403


def test_messages_and_notifications_for_current_participants_only(user_a, user_b):
    created = create_activity(user_a)
    activity_id = created["activiteit_id"]
    a_id, b_id = user_a.user["gebruiker_id"], user_b.user["gebruiker_id"]
    user_b.post(f"/activities/{activity_id}/join")
    clear_notifications(a_id, b_id)

    first = user_a.post(f"/activities/{activity_id}/chat/messages", json={"inhoud": f"{TEST_PREFIX} hallo"})
    assert first.status_code == 201
    assert first.json()["verzonden_op"].endswith("+00:00")
    assert len(notifications_of(b_id, "group_chat")) == 1  # b never opened the chat, still notified

    user_b.post(f"/activities/{activity_id}/chat/messages", json={"inhoud": f"{TEST_PREFIX} hoi"})
    assert user_b.delete(f"/activities/{activity_id}/join").status_code == 200
    clear_notifications(b_id)
    user_a.post(f"/activities/{activity_id}/chat/messages", json={"inhoud": f"{TEST_PREFIX} na vertrek"})
    assert notifications_of(b_id, "group_chat") == []
    assert user_b.get(f"/activities/{activity_id}/chat/messages").status_code == 403

    messages = user_a.get(f"/activities/{activity_id}/chat/messages").json()["messages"]
    assert [m["inhoud"] for m in messages] == [f"{TEST_PREFIX} hallo", f"{TEST_PREFIX} hoi", f"{TEST_PREFIX} na vertrek"]
    newest = user_a.get(f"/activities/{activity_id}/chat/messages?limit=1").json()["messages"]
    assert [m["inhoud"] for m in newest] == [f"{TEST_PREFIX} na vertrek"]


def test_no_new_messages_in_cancelled_activity(user_a):
    created = create_activity(user_a)
    user_a.post(f"/activities/{created['activiteit_id']}/cancel")
    response = user_a.post(f"/activities/{created['activiteit_id']}/chat/messages", json={"inhoud": f"{TEST_PREFIX} x"})
    assert response.status_code == 409


def test_chat_overview(user_a, user_b, friends):
    created = create_activity(user_a, titel=f"{TEST_PREFIX} overzicht")
    activity_id = created["activiteit_id"]
    user_a.post(f"/activities/{activity_id}/chat/messages", json={"inhoud": f"{TEST_PREFIX} groep"})
    user_b.post(f"/messages/{user_a.user['gebruiker_id']}", json={"inhoud": f"{TEST_PREFIX} privé"})

    chats = {chat["sleutel"]: chat for chat in user_a.get("/chats").json()["chats"]}
    group = chats[f"group-{activity_id}"]
    assert group["laatste_bericht"]["inhoud"] == f"{TEST_PREFIX} groep"
    assert group["href"] == f"/activities/{activity_id}/chat"
    assert group["sport"] == "Basketbal"
    private = chats[f"private-{user_b.user['gebruiker_id']}"]
    assert private["laatste_bericht"]["inhoud"] == f"{TEST_PREFIX} privé"
    assert private["laatste_bericht"]["afzender_naam"] == user_b.user["naam"]
    assert f"group-{activity_id}" not in {c["sleutel"] for c in user_b.get("/chats").json()["chats"]}
    assert chat_rows(activity_id) == 1


def test_private_messages_respect_setting(user_a, user_b, friends):
    user_b.put("/profile", json={"priveberichten_toestaan": False})
    blocked = user_a.post(f"/messages/{user_b.user['gebruiker_id']}", json={"inhoud": f"{TEST_PREFIX} x"})
    assert blocked.status_code == 403
    user_b.put("/profile", json={"priveberichten_toestaan": True})
    assert user_a.post(f"/messages/{user_b.user['gebruiker_id']}", json={"inhoud": f"{TEST_PREFIX} y"}).status_code == 200


def test_private_messages_only_between_friends(user_a, user_b):
    set_friendship(user_a.user["gebruiker_id"], user_b.user["gebruiker_id"], None)
    assert user_a.get(f"/messages/{user_b.user['gebruiker_id']}").status_code == 403


def test_search_escapes_wildcards(user_a):
    assert user_a.get("/friends/search", params={"q": "%%"}).json() == {"users": []}
    assert user_a.get("/friends/search", params={"q": "__"}).json() == {"users": []}
    found = user_a.get("/friends/search", params={"q": "Claude Testaccount"}).json()["users"]
    assert any(u["gebruiker_id"] != user_a.user["gebruiker_id"] for u in found)


def test_declined_request_cooldown(user_a, user_b):
    a_id, b_id = user_a.user["gebruiker_id"], user_b.user["gebruiker_id"]
    set_friendship(a_id, b_id, "declined", requested_by=a_id)
    response = user_a.post("/friends/request", json={"gebruiker_id": b_id})
    assert response.status_code == 409
    assert "week" in response.json()["detail"]

    set_friendship(a_id, b_id, "declined", requested_by=a_id, days_ago=8)
    assert user_a.post("/friends/request", json={"gebruiker_id": b_id}).status_code == 200


def test_person_who_declined_may_ask_later(user_a, user_b):
    a_id, b_id = user_a.user["gebruiker_id"], user_b.user["gebruiker_id"]
    set_friendship(a_id, b_id, "declined", requested_by=a_id)
    assert user_b.post("/friends/request", json={"gebruiker_id": a_id}).status_code == 200


def test_accepting_notifies_the_requester(user_a, user_b):
    a_id, b_id = user_a.user["gebruiker_id"], user_b.user["gebruiker_id"]
    set_friendship(a_id, b_id, None)
    clear_notifications(a_id, b_id)
    assert user_a.post("/friends/request", json={"gebruiker_id": b_id}).status_code == 200
    request_id = user_b.get("/friends").json()["incoming"][0]["verzoek_id"]
    assert user_b.post("/friends/respond", json={"verzoek_id": request_id, "accepteren": True}).json() == {"status": "accepted"}
    accepted = notifications_of(a_id, "friend_requests")
    assert accepted[-1]["titel"] == "Vriendschapsverzoek geaccepteerd"
