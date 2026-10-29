NOTIFICATION_CATEGORIES = {
    "participants",
    "activity_changes",
    "group_chat",
    "private_messages",
    "friend_requests",
    "profile_views",
    "reminders",
}


def create_notification(
    conn,
    gebruiker_id: int,
    categorie: str,
    titel: str,
    inhoud: str = "",
    activiteit_id=None,
    bericht_id=None,
    doel_url=None,
):
    create_notifications(
        conn, [gebruiker_id], categorie, titel, inhoud,
        activiteit_id=activiteit_id, bericht_id=bericht_id, doel_url=doel_url,
    )


def create_notifications(
    conn,
    gebruiker_ids: list[int],
    categorie: str,
    titel: str,
    inhoud: str = "",
    activiteit_id=None,
    bericht_id=None,
    doel_url=None,
):
    """One query for all recipients; skips users who turned this category off in the app."""
    if categorie not in NOTIFICATION_CATEGORIES:
        raise ValueError("Onbekende notificatiecategorie")
    if not gebruiker_ids:
        return

    if doel_url is None:
        if activiteit_id is not None:
            doel_url = f"/activities/{activiteit_id}/chat"
        elif categorie == "friend_requests":
            doel_url = "/friends"

    # Geen voorkeur opgeslagen betekent standaard ingeschakeld.
    conn.execute(
        '''
        INSERT INTO "NOTIFICATIE"
            (gebruiker_id, type, titel, inhoud, activiteit_id, bericht_id, doel_url, aangemaakt_op)
        SELECT ontvanger.id, %(categorie)s::varchar, %(titel)s::varchar, %(inhoud)s::text,
               %(activiteit_id)s::int, %(bericht_id)s::int, %(doel_url)s::text, CURRENT_TIMESTAMP
        FROM unnest(%(gebruiker_ids)s::int[]) AS ontvanger(id)
        WHERE NOT EXISTS (
            SELECT 1 FROM "GEBRUIKER_NOTIFICATIEVOORKEUR" v
            WHERE v.gebruiker_id = ontvanger.id AND v.categorie = %(categorie)s::varchar
              AND v.kanaal = 'in_app' AND NOT v.ingeschakeld
        )
        ''',
        {
            "gebruiker_ids": list(gebruiker_ids),
            "categorie": categorie,
            "titel": titel,
            "inhoud": inhoud,
            "activiteit_id": activiteit_id,
            "bericht_id": bericht_id,
            "doel_url": doel_url,
        },
    )
