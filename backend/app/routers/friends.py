from fastapi import APIRouter, HTTPException, Request

from app.db import get_connection
from app.notifications import create_notification
from app.schemas import FriendRequestInput, FriendResponseInput
from app.security import get_session_user_id

router = APIRouter()

# After a declined request, the requester has to wait before asking again.
DECLINED_REQUEST_COOLDOWN_DAYS = 7


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/friends")
def get_friends(request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        friends = conn.execute("""
            SELECT g.gebruiker_id, g.naam, g.woonplaats
            FROM "SPORTCONNECT_VRIENDSCHAP" v
            JOIN "GEBRUIKER" g ON g.gebruiker_id =
                CASE WHEN v.gebruiker_laag_id = %s THEN v.gebruiker_hoog_id ELSE v.gebruiker_laag_id END
            WHERE (v.gebruiker_laag_id = %s OR v.gebruiker_hoog_id = %s)
              AND v.status = 'accepted'
            ORDER BY g.naam
        """, (user_id, user_id, user_id)).fetchall()
        requests_in = conn.execute("""
            SELECT v.vriendschap_id AS verzoek_id, g.gebruiker_id, g.naam, g.woonplaats, v.aangemaakt_op
            FROM "SPORTCONNECT_VRIENDSCHAP" v
            JOIN "GEBRUIKER" g ON g.gebruiker_id = v.aangevraagd_door
            WHERE (v.gebruiker_laag_id = %s OR v.gebruiker_hoog_id = %s)
              AND v.status = 'pending' AND v.aangevraagd_door <> %s
            ORDER BY v.aangemaakt_op DESC
        """, (user_id, user_id, user_id)).fetchall()
        requests_out = conn.execute("""
            SELECT v.vriendschap_id AS verzoek_id, g.gebruiker_id, g.naam, g.woonplaats, v.aangemaakt_op
            FROM "SPORTCONNECT_VRIENDSCHAP" v
            JOIN "GEBRUIKER" g ON g.gebruiker_id =
                CASE WHEN v.gebruiker_laag_id = %s THEN v.gebruiker_hoog_id ELSE v.gebruiker_laag_id END
            WHERE (v.gebruiker_laag_id = %s OR v.gebruiker_hoog_id = %s)
              AND v.status = 'pending' AND v.aangevraagd_door = %s
            ORDER BY v.aangemaakt_op DESC
        """, (user_id, user_id, user_id, user_id)).fetchall()
    return {"friends": friends, "incoming": requests_in, "outgoing": requests_out}


@router.get("/friends/search")
def search_users(request: Request, q: str = ""):
    user_id = get_session_user_id(request)
    query = q.strip()[:100]
    if len(query) < 2:
        return {"users": []}
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT g.gebruiker_id, g.naam,
                   -- private profiles only show their town to friends
                   CASE WHEN g.profiel_openbaar OR v.status = 'accepted' THEN g.woonplaats END AS woonplaats,
                   v.status AS vriendschapsstatus,
                   CASE WHEN v.aangevraagd_door = %s THEN 'sent' ELSE 'received' END AS richting
            FROM "GEBRUIKER" g
            LEFT JOIN "SPORTCONNECT_VRIENDSCHAP" v
              ON (v.gebruiker_laag_id = LEAST(g.gebruiker_id, %s)
              AND v.gebruiker_hoog_id = GREATEST(g.gebruiker_id, %s))
            WHERE g.gebruiker_id <> %s
              AND g.naam ILIKE %s ESCAPE '\\'
              AND NOT EXISTS (
                  SELECT 1 FROM "GEBRUIKER_BLOKKADE" b
                  WHERE (b.blokkeerder_id = g.gebruiker_id AND b.geblokkeerde_id = %s)
                     OR (b.blokkeerder_id = %s AND b.geblokkeerde_id = g.gebruiker_id)
              )
            ORDER BY g.naam
            LIMIT 20
        """, (user_id, user_id, user_id, user_id, f"%{escape_like(query)}%", user_id, user_id)).fetchall()
    return {"users": rows}


@router.post("/friends/request")
def request_friendship(payload: FriendRequestInput, request: Request):
    user_id = get_session_user_id(request)
    if payload.gebruiker_id == user_id:
        raise HTTPException(status_code=400, detail="Je kunt jezelf niet toevoegen.")
    low, high = sorted((user_id, payload.gebruiker_id))
    with get_connection() as conn:
        exists = conn.execute('SELECT gebruiker_id FROM "GEBRUIKER" WHERE gebruiker_id = %s', (payload.gebruiker_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Gebruiker niet gevonden.")
        existing = conn.execute(
            f'''
            SELECT status, aangevraagd_door,
                   bijgewerkt_op > NOW() - INTERVAL '{DECLINED_REQUEST_COOLDOWN_DAYS} days' AS recent
            FROM "SPORTCONNECT_VRIENDSCHAP"
            WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s
            FOR UPDATE
            ''',
            (low, high),
        ).fetchone()
        if existing:
            if existing["status"] == "accepted":
                raise HTTPException(status_code=409, detail="Jullie zijn al vrienden.")
            if existing["status"] == "pending":
                raise HTTPException(status_code=409, detail="Er staat al een vriendschapsverzoek open.")
            # Declined: the person who declined may ask; the requester has to wait.
            if existing["aangevraagd_door"] == user_id and existing["recent"]:
                raise HTTPException(
                    status_code=409,
                    detail="Je verzoek is onlangs geweigerd. Je kunt over een week opnieuw een verzoek sturen.",
                )
            conn.execute('DELETE FROM "SPORTCONNECT_VRIENDSCHAP" WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s', (low, high))
        conn.execute(
            'INSERT INTO "SPORTCONNECT_VRIENDSCHAP" (gebruiker_laag_id, gebruiker_hoog_id, aangevraagd_door, status) '
            "VALUES (%s, %s, %s, 'pending')",
            (low, high, user_id),
        )
        requester = conn.execute('SELECT naam FROM "GEBRUIKER" WHERE gebruiker_id = %s', (user_id,)).fetchone()
        create_notification(
            conn,
            payload.gebruiker_id,
            "friend_requests",
            "Nieuw vriendschapsverzoek",
            f'{requester["naam"] if requester else "Een gebruiker"} wil vrienden met je worden.',
        )
    return {"status": "pending"}


@router.post("/friends/respond")
def respond_friendship(payload: FriendResponseInput, request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        row = conn.execute(
            'SELECT * FROM "SPORTCONNECT_VRIENDSCHAP" WHERE vriendschap_id = %s FOR UPDATE',
            (payload.verzoek_id,),
        ).fetchone()
        if not row or row["status"] != "pending":
            raise HTTPException(status_code=404, detail="Verzoek niet gevonden.")
        if user_id == row["aangevraagd_door"]:
            raise HTTPException(status_code=403, detail="Je kunt je eigen verzoek niet beantwoorden.")
        if user_id not in (row["gebruiker_laag_id"], row["gebruiker_hoog_id"]):
            raise HTTPException(status_code=403, detail="Geen toegang tot dit verzoek.")
        status = "accepted" if payload.accepteren else "declined"
        conn.execute(
            'UPDATE "SPORTCONNECT_VRIENDSCHAP" SET status = %s, bijgewerkt_op = NOW() WHERE vriendschap_id = %s',
            (status, payload.verzoek_id),
        )
        if payload.accepteren:
            responder = conn.execute('SELECT naam FROM "GEBRUIKER" WHERE gebruiker_id = %s', (user_id,)).fetchone()
            create_notification(
                conn,
                row["aangevraagd_door"],
                "friend_requests",
                "Vriendschapsverzoek geaccepteerd",
                f'{responder["naam"] if responder else "Een gebruiker"} heeft je vriendschapsverzoek geaccepteerd.',
            )
    return {"status": status}


@router.delete("/friends/{friend_user_id}")
def remove_friend(friend_user_id: int, request: Request):
    user_id = get_session_user_id(request)
    if friend_user_id == user_id:
        raise HTTPException(status_code=400, detail="Ongeldige gebruiker.")
    low, high = sorted((user_id, friend_user_id))
    with get_connection() as conn:
        conn.execute('DELETE FROM "SPORTCONNECT_VRIENDSCHAP" WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s', (low, high))
    return {"status": "removed"}
