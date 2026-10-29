from fastapi import APIRouter, HTTPException, Request

from app.db import get_connection
from app.notifications import create_notification
from app.schemas import PrivateMessageInput
from app.security import get_session_user_id

router = APIRouter()


def require_friendship(conn, user_id: int, friend_user_id: int):
    low, high = sorted((user_id, friend_user_id))
    row = conn.execute('''
        SELECT status FROM "SPORTCONNECT_VRIENDSCHAP"
        WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s
    ''', (low, high)).fetchone()
    if not row or row["status"] != "accepted":
        raise HTTPException(status_code=403, detail="Privéberichten zijn alleen beschikbaar tussen vrienden.")


@router.get("/messages/{friend_user_id}")
def get_private_messages(friend_user_id: int, request: Request, after_id: int = 0, limit: int = 100):
    user_id = get_session_user_id(request)
    if friend_user_id == user_id:
        raise HTTPException(status_code=400, detail="Je kunt geen gesprek met jezelf openen.")
    with get_connection() as conn:
        require_friendship(conn, user_id, friend_user_id)
        friend = conn.execute('SELECT gebruiker_id, naam FROM "GEBRUIKER" WHERE gebruiker_id = %s', (friend_user_id,)).fetchone()
        if not friend:
            raise HTTPException(status_code=404, detail="Gebruiker niet gevonden.")
        # after_id = 0: the newest `limit` messages; otherwise the next ones after after_id (polling).
        # Either way the result is sorted oldest -> newest.
        newest_first = after_id <= 0
        messages = conn.execute(f'''
            SELECT * FROM (
                SELECT b.bericht_id, b.afzender_id, b.ontvanger_id, b.inhoud, b.verzonden_op, g.naam AS afzender_naam
                FROM "SPORTCONNECT_PRIVATBERICHT" b
                JOIN "GEBRUIKER" g ON g.gebruiker_id = b.afzender_id
                WHERE ((b.afzender_id = %s AND b.ontvanger_id = %s) OR (b.afzender_id = %s AND b.ontvanger_id = %s))
                  AND b.bericht_id > %s
                ORDER BY b.bericht_id {"DESC" if newest_first else "ASC"} LIMIT %s
            ) page
            ORDER BY bericht_id ASC
        ''', (user_id, friend_user_id, friend_user_id, user_id, max(0, after_id), max(1, min(limit, 200)))).fetchall()
    return {"friend": friend, "messages": messages}


@router.post("/messages/{friend_user_id}")
def send_private_message(friend_user_id: int, payload: PrivateMessageInput, request: Request):
    user_id = get_session_user_id(request)
    inhoud = payload.inhoud.strip()
    if not inhoud:
        raise HTTPException(status_code=422, detail="Een bericht mag niet leeg zijn.")
    if friend_user_id == user_id:
        raise HTTPException(status_code=400, detail="Je kunt geen bericht naar jezelf sturen.")
    with get_connection() as conn:
        require_friendship(conn, user_id, friend_user_id)
        recipient = conn.execute(
            'SELECT gebruiker_id, priveberichten_toestaan FROM "GEBRUIKER" WHERE gebruiker_id = %s',
            (friend_user_id,),
        ).fetchone()
        if not recipient:
            raise HTTPException(status_code=404, detail="Gebruiker niet gevonden.")
        if not recipient["priveberichten_toestaan"]:
            raise HTTPException(status_code=403, detail="Deze gebruiker ontvangt op dit moment geen privéberichten.")
        message = conn.execute('''
            INSERT INTO "SPORTCONNECT_PRIVATBERICHT" (afzender_id, ontvanger_id, inhoud)
            VALUES (%s, %s, %s)
            RETURNING bericht_id, afzender_id, ontvanger_id, inhoud, verzonden_op
        ''', (user_id, friend_user_id, inhoud)).fetchone()
        sender = conn.execute('SELECT naam FROM "GEBRUIKER" WHERE gebruiker_id = %s', (user_id,)).fetchone()
        create_notification(
            conn,
            friend_user_id,
            "private_messages",
            "Nieuw privébericht",
            f'{sender["naam"] if sender else "Een gebruiker"} heeft je een bericht gestuurd.',
            doel_url=f"/messages/{user_id}",
        )
    return {**message, "afzender_naam": sender["naam"] if sender else "Gebruiker"}


@router.get("/chats")
def get_chat_overview(request: Request):
    """All group chats the user takes part in and all friends, each with its latest message.

    Read-only: unlike opening a chat, this never creates chat rows.
    """
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        groups = conn.execute(
            '''
            SELECT a.activiteit_id, a.titel, a.woonplaats, a.status, s.naam AS sport,
                   lm.afzender_naam, lm.inhoud,
                   lm.verzonden_op
            FROM "ACTIVITEIT" a
            JOIN "SPORT" s ON s.sport_id = a.sport_id
            LEFT JOIN "GROEPSCHAT" gc ON gc.activiteit_id = a.activiteit_id
            LEFT JOIN LATERAL (
                SELECT g.naam AS afzender_naam, b.inhoud, b.verzonden_op
                FROM "BERICHT" b
                JOIN "CHATLID" cl ON cl.chatlid_id = b.chatlid_id
                JOIN "GEBRUIKER" g ON g.gebruiker_id = cl.gebruiker_id
                WHERE b.chat_id = gc.chat_id
                ORDER BY b.bericht_id DESC
                LIMIT 1
            ) lm ON TRUE
            WHERE a.maker_id = %(user_id)s
               OR EXISTS (
                    SELECT 1 FROM "ACTIVITEIT_DEELNEMER" ad
                    WHERE ad.activiteit_id = a.activiteit_id AND ad.gebruiker_id = %(user_id)s
               )
            ''',
            {"user_id": user_id},
        ).fetchall()
        privates = conn.execute(
            '''
            SELECT g.gebruiker_id, g.naam, lm.afzender_naam, lm.inhoud, lm.verzonden_op
            FROM "SPORTCONNECT_VRIENDSCHAP" v
            JOIN "GEBRUIKER" g ON g.gebruiker_id =
                CASE WHEN v.gebruiker_laag_id = %(user_id)s THEN v.gebruiker_hoog_id ELSE v.gebruiker_laag_id END
            LEFT JOIN LATERAL (
                SELECT sender.naam AS afzender_naam, b.inhoud, b.verzonden_op
                FROM "SPORTCONNECT_PRIVATBERICHT" b
                JOIN "GEBRUIKER" sender ON sender.gebruiker_id = b.afzender_id
                WHERE (b.afzender_id = %(user_id)s AND b.ontvanger_id = g.gebruiker_id)
                   OR (b.afzender_id = g.gebruiker_id AND b.ontvanger_id = %(user_id)s)
                ORDER BY b.bericht_id DESC
                LIMIT 1
            ) lm ON TRUE
            WHERE (v.gebruiker_laag_id = %(user_id)s OR v.gebruiker_hoog_id = %(user_id)s)
              AND v.status = 'accepted'
            ''',
            {"user_id": user_id},
        ).fetchall()

    def last_message(row):
        if row["inhoud"] is None:
            return None
        return {"afzender_naam": row["afzender_naam"], "inhoud": row["inhoud"], "verzonden_op": row["verzonden_op"]}

    chats = [
        {
            "sleutel": f"group-{row['activiteit_id']}",
            "soort": "groep",
            "sport": row["sport"],
            "titel": row["titel"],
            "subtitel": " · ".join(part for part in (row["sport"], row["woonplaats"]) if part),
            "geannuleerd": row["status"] == "GEANNULEERD",
            "href": f"/activities/{row['activiteit_id']}/chat",
            "laatste_bericht": last_message(row),
        }
        for row in groups
    ] + [
        {
            "sleutel": f"private-{row['gebruiker_id']}",
            "soort": "prive",
            "sport": None,
            "titel": row["naam"],
            "subtitel": "Privébericht",
            "geannuleerd": False,
            "href": f"/messages/{row['gebruiker_id']}",
            "laatste_bericht": last_message(row),
        }
        for row in privates
    ]
    # Newest conversation first; chats without messages at the end, by title.
    chats.sort(key=lambda chat: chat["titel"].lower())
    chats.sort(
        key=lambda chat: chat["laatste_bericht"]["verzonden_op"].timestamp() if chat["laatste_bericht"] else 0,
        reverse=True,
    )
    return {"chats": chats}
