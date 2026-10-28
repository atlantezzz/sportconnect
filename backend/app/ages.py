from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.config import LOCAL_TIMEZONE, MINIMUM_AGE


def local_today() -> date:
    return datetime.now(ZoneInfo(LOCAL_TIMEZONE)).date()


def calculate_age(birth_date: date, today: date) -> int:
    """Whole years; one less when this year's birthday hasn't happened yet."""
    had_birthday = (today.month, today.day) >= (birth_date.month, birth_date.day)
    return today.year - birth_date.year - (0 if had_birthday else 1)


def validate_birth_date(birth_date: date, today: date | None = None) -> int:
    """Return the age for a valid birth date, or raise a Dutch 422."""
    today = today or local_today()
    if birth_date > today:
        raise HTTPException(status_code=422, detail="Je geboortedatum kan niet in de toekomst liggen.")
    age = calculate_age(birth_date, today)
    if age < MINIMUM_AGE:
        raise HTTPException(status_code=422, detail=f"Je moet minimaal {MINIMUM_AGE} jaar oud zijn.")
    if age > 120:
        raise HTTPException(status_code=422, detail="Vul een geldige geboortedatum in.")
    return age
