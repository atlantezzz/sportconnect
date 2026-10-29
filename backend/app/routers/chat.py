from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request

from app.db import get_connection
from app.notifications import create_notifications
from app.schemas import ChatMessageInput
from app.security import get_session_user_id

router = APIRouter()


def _authorize_activity_chat(conn, activity_id: int, user_id: int):
    """The activity, if the user is its organizer or a participant; 403/404 otherwise."""
    activity = conn.execute(
        '''
        SELECT activiteit_id, maker_id, titel, starttijd, locatie_naam, woonplaats, status
        FROM "ACTIVITEIT" WHERE activiteit_id = %s
        ''',
        (activity_id,),
    ).fetchone()
    if not activity:
        raise HTTPException(status_code=404, detail="Activiteit niet gevonden.")

    # De organisator heeft toegang, ook als oude records geen deelnemersrij hebben.
    is_member = conn.execute(
        'SELECT 1 FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id = %s AND gebruiker_id = %s',
        (activity_id, user_id),
    ).fetchone()
    if activity["maker_id"] != user_id and not is_member:
        raise HTTPException(
            status_code=403,
            detail="Alleen deelnemers en de organisator hebben toegang tot deze groepschat.",
        )
    return activity


def _existing_chat_id(conn, activity_id: int) -> int | None:
    chat = conn.execute('SELECT chat_id FROM "GROEPSCHAT" WHERE activiteit_id = %s', (activity_id,)).fetchone()
    return chat["chat_id"] if chat else None


def _ensure_chat_member(conn, activity: dict, user_id: int) -> tuple[int, int]:
    """Create the chat and (re)activate the user's membership; returns (chat_id, chatlid_id)."""
    conn.execute(
        '''
        INSERT INTO "GROEPSCHAT" (activiteit_id, aangemaakt_op, verloopt_op)
        VALUES (%s, CURRENT_TIMESTAMP, %s)
        ON CONFLICT (activiteit_id) DO NOTHING
        ''',
        (activity["activiteit_id"], activity["starttijd"] + timedelta(days=7)),
    )
    chat_id = _existing_chat_id(conn, activity["activiteit_id"])
    member = conn.execute(
        '''
        INSERT INTO "CHATLID" (chat_id, gebruiker_id, toegevoegd_op, verlaten_op)
        VALUES (%s, %s, CURRENT_TIMESTAMP, NULL)
        ON CONFLICT (chat_id, gebruiker_id) DO UPDATE SET verlaten_op = NULL
        RETURNING chatlid_id
        ''',
        (chat_id, user_id),
    ).fetchone()
    return chat_id, member["chatlid_id"]


@router.get("/activities/{activity_id}/chat")
def get_activity_chat(activity_id: int, request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        activity = _authorize_activity_chat(conn, activity_id, user_id)
        chat_id = _existing_chat_id(conn, activity_id)
    return {"chat_id": chat_id, "activiteit": activity}


@router.get("/activities/{activity_id}/chat/messages")
def get_activity_chat_messages(activity_id: int, request: Request, after_id: int = 0, limit: int = 100):
    user_id = get_session_user_id(request)
    if after_id < 0:
        raise HTTPException(status_code=422, detail="after_id mag niet negatief zijn.")
    limit = max(1, min(limit, 100))

    with get_connection() as conn:
        _authorize_activity_chat(conn, activity_id, user_id)
        chat_id = _existing_chat_id(conn, activity_id)
        if chat_id is None:
            return {"messages": []}
        # after_id = 0: the newest `limit` messages; otherwise the next ones after after_id (polling).
        # Either way the result is sorted oldest -> newest. Times are stored as UTC.
        order = "DESC" if after_id == 0 else "ASC"
        rows = conn.execute(
            f'''
            SELECT * FROM (
                SELECT b.bericht_id, b.inhoud,
                       b.verzonden_op AT TIME ZONE 'UTC' AS verzonden_op,
                       cl.gebruiker_id, g.naam AS afzender_naam
                FROM "BERICHT" b
                JOIN "CHATLID" cl ON cl.chatlid_id = b.chatlid_id
                JOIN "GEBRUIKER" g ON g.gebruiker_id = cl.gebruiker_id
                WHERE b.chat_id = %s AND b.bericht_id > %s
                ORDER BY b.bericht_id {order}
                LIMIT %s
            ) page
            ORDER BY bericht_id ASC
            ''',
            (chat_id, after_id, limit),
        ).fetchall()
    return {"messages": rows}


@router.post("/activities/{activity_id}/chat/messages", status_code=201)
def post_activity_chat_message(activity_id: int, request: Request, data: ChatMessageInput):
    user_id = get_session_user_id(request)
    inhoud = data.inhoud.strip()
    if not inhoud:
        raise HTTPException(status_code=422, detail="Een bericht mag niet leeg zijn.")

    with get_connection() as conn:
        activity = _authorize_activity_chat(conn, activity_id, user_id)
        if activity["status"] != "OPEN":
            raise HTTPException(status_code=409, detail="Deze activiteit is gesloten. Nieuwe berichten zijn niet toegestaan.")
        chat_id, chatlid_id = _ensure_chat_member(conn, activity, user_id)

        message = conn.execute(
            '''
            INSERT INTO "BERICHT" (chat_id, chatlid_id, inhoud, verzonden_op)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING bericht_id, inhoud, verzonden_op AT TIME ZONE 'UTC' AS verzonden_op
            ''',
            (chat_id, chatlid_id, inhoud),
        ).fetchone()
        sender = conn.execute('SELECT naam FROM "GEBRUIKER" WHERE gebruiker_id = %s', (user_id,)).fetchone()
        sender_name = sender["naam"] if sender else "Een deelnemer"

        # Current participants and the organizer; people who left get nothing.
        recipients = conn.execute(
            '''
            SELECT gebruiker_id FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id = %s
            UNION
            SELECT maker_id FROM "ACTIVITEIT" WHERE activiteit_id = %s
            ''',
            (activity_id, activity_id),
        ).fetchall()
        create_notifications(
            conn,
            [r["gebruiker_id"] for r in recipients if r["gebruiker_id"] != user_id],
            "group_chat",
            "Nieuw groepschatbericht",
            f"{sender_name} heeft een bericht geplaatst.",
            activiteit_id=activity_id,
            bericht_id=message["bericht_id"],
        )

    return {**message, "gebruiker_id": user_id, "afzender_naam": sender["naam"] if sender else "Gebruiker"}
