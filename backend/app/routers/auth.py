import re

from argon2.exceptions import VerificationError, VerifyMismatchError
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from psycopg.errors import UniqueViolation

from app.ages import validate_birth_date
from app.db import AGE_SQL, get_connection
from app.mailer import send_welcome_email
from app.schemas import LoginInput, RegisterInput
from app.security import (
    clear_session_cookie,
    client_ip,
    enforce_rate_limit,
    failed_login_limiter,
    get_session_user_id,
    login_ip_limiter,
    password_hasher,
    register_ip_limiter,
    set_session_cookie,
)

router = APIRouter()


def public_user(user: dict) -> dict:
    return {
        "gebruiker_id": user["gebruiker_id"],
        "naam": user["naam"],
        "email": user["email"],
        "leeftijd": user["leeftijd"],
        "woonplaats": user["woonplaats"],
        "land": user["land"],
    }


USER_COLUMNS = f"g.gebruiker_id, g.naam, g.email, {AGE_SQL} AS leeftijd, g.woonplaats, g.land"


@router.post("/auth/register", status_code=201)
def register(data: RegisterInput, request: Request, response: Response, background: BackgroundTasks):
    ip = client_ip(request)
    enforce_rate_limit(register_ip_limiter, ip)

    email = data.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=422, detail="Vul een geldig e-mailadres in.")

    naam = data.naam.strip()
    woonplaats = data.woonplaats.strip()
    land = data.land.strip()
    if not naam or not woonplaats or not land:
        raise HTTPException(status_code=422, detail="Naam, woonplaats en land zijn verplicht.")

    leeftijd = validate_birth_date(data.geboortedatum)
    register_ip_limiter.hit(ip)
    password_hash = password_hasher.hash(data.wachtwoord)

    try:
        with get_connection() as conn:
            created = conn.execute(
                '''
                INSERT INTO "GEBRUIKER" (
                    naam, leeftijd, geboortedatum, email, wachtwoord_hash,
                    woonplaats, land, aangemaakt_op, bijgewerkt_op
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING gebruiker_id
                ''',
                (naam, leeftijd, data.geboortedatum, email, password_hash, woonplaats, land),
            ).fetchone()
            user = conn.execute(
                f'SELECT {USER_COLUMNS} FROM "GEBRUIKER" g WHERE g.gebruiker_id = %s',
                (created["gebruiker_id"],),
            ).fetchone()
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="Er bestaat al een account met dit e-mailadres.")

    set_session_cookie(response, user["gebruiker_id"])
    background.add_task(send_welcome_email, email, naam)
    return {"user": public_user(user)}


@router.post("/auth/login")
def login(data: LoginInput, request: Request, response: Response):
    email = data.email.strip().lower()
    ip = client_ip(request)
    enforce_rate_limit(login_ip_limiter, ip)
    enforce_rate_limit(failed_login_limiter, email)
    login_ip_limiter.hit(ip)

    with get_connection() as conn:
        user = conn.execute(
            f'SELECT {USER_COLUMNS}, g.wachtwoord_hash FROM "GEBRUIKER" g WHERE g.email = %s',
            (email,),
        ).fetchone()

    try:
        if not user:
            raise VerifyMismatchError()
        password_hasher.verify(user["wachtwoord_hash"], data.wachtwoord)
    except (VerifyMismatchError, VerificationError):
        failed_login_limiter.hit(email)
        raise HTTPException(status_code=401, detail="E-mailadres of wachtwoord is onjuist.")

    failed_login_limiter.reset(email)
    set_session_cookie(response, user["gebruiker_id"])
    return {"user": public_user(user)}


@router.get("/auth/me")
def current_user(request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        user = conn.execute(
            f'SELECT {USER_COLUMNS} FROM "GEBRUIKER" g WHERE g.gebruiker_id = %s',
            (user_id,),
        ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Account niet gevonden.")
    return {"user": public_user(user)}


@router.post("/auth/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"status": "ok"}
