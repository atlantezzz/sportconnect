from datetime import date

import pytest
from fastapi import HTTPException

from app.ages import calculate_age, validate_birth_date


@pytest.mark.parametrize(
    ("birth", "today", "expected"),
    [
        (date(2000, 5, 10), date(2026, 5, 10), 26),  # birthday today
        (date(2000, 5, 10), date(2026, 5, 9), 25),  # birthday tomorrow
        (date(2000, 5, 10), date(2026, 5, 11), 26),  # birthday yesterday
        (date(2000, 12, 31), date(2026, 1, 1), 25),
        (date(2004, 2, 29), date(2026, 2, 28), 21),  # leap day, no 29th this year
        (date(2004, 2, 29), date(2026, 3, 1), 22),
        (date(2004, 2, 29), date(2028, 2, 29), 24),
    ],
)
def test_calculate_age(birth, today, expected):
    assert calculate_age(birth, today) == expected


def test_exactly_minimum_age_is_allowed():
    assert validate_birth_date(date(2013, 10, 28), today=date(2026, 10, 28)) == 13


def test_one_day_short_of_minimum_age_is_refused():
    with pytest.raises(HTTPException) as error:
        validate_birth_date(date(2013, 10, 29), today=date(2026, 10, 28))
    assert error.value.status_code == 422
    assert "13" in error.value.detail


def test_future_birth_date_is_refused():
    with pytest.raises(HTTPException) as error:
        validate_birth_date(date(2027, 1, 1), today=date(2026, 10, 28))
    assert error.value.status_code == 422


def test_unrealistic_birth_date_is_refused():
    with pytest.raises(HTTPException):
        validate_birth_date(date(1880, 1, 1), today=date(2026, 10, 28))
