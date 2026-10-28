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
    if categorie not in NOTIFICATION_CATEGORIES:
        raise ValueError("Onbekende notificatiecategorie")

    preference = conn.execute(
        'SELECT ingeschakeld FROM "GEBRUIKER_NOTIFICATIEVOORKEUR" '
        'WHERE gebruiker_id = %s AND categorie = %s AND kanaal = %s',
        (gebruiker_id, categorie, "in_app"),
    ).fetchone()

    # Geen voorkeur opgeslagen betekent standaard ingeschakeld.
    if preference is not None and not preference["ingeschakeld"]:
        return

    if doel_url is None:
        if activiteit_id is not None:
            doel_url = f"/activities/{activiteit_id}/chat"
        elif categorie == "friend_requests":
            doel_url = "/friends"

    conn.execute(
        'INSERT INTO "NOTIFICATIE" '
        '(gebruiker_id, type, titel, inhoud, activiteit_id, bericht_id, doel_url, aangemaakt_op) '
        'VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)',
        (gebruiker_id, categorie, titel, inhoud, activiteit_id, bericht_id, doel_url),
    )
