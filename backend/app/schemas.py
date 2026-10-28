from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

ActivityLevel = Literal["Alle niveaus", "Beginner", "Gemiddeld", "Gevorderd"]


class RegisterInput(BaseModel):
    naam: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    wachtwoord: str = Field(min_length=8, max_length=128)
    geboortedatum: date
    woonplaats: str = Field(min_length=2, max_length=100)
    land: str = Field(min_length=2, max_length=100)


class LoginInput(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    wachtwoord: str = Field(min_length=1, max_length=128)


class ActivityCreate(BaseModel):
    sport_id: int = Field(gt=0)
    titel: str = Field(min_length=3, max_length=120)
    beschrijving: str | None = Field(default=None, max_length=1000)
    starttijd: datetime
    niveau: ActivityLevel = "Alle niveaus"
    locatie_naam: str | None = None
    woonplaats: str | None = None
    straatnaam: str | None = Field(default=None, max_length=200)
    huisnummer: str | None = Field(default=None, max_length=30)
    postcode: str | None = Field(default=None, max_length=20)
    land: str | None = Field(default=None, max_length=100)
    breedtegraad: float | None = Field(default=None, ge=-90, le=90)
    lengtegraad: float | None = Field(default=None, ge=-180, le=180)
    externe_locatie_id: str | None = Field(default=None, max_length=255)
    maximaal_aantal_deelnemers: int = Field(ge=2, le=50)


class ActivityUpdate(BaseModel):
    titel: str = Field(min_length=3, max_length=120)
    beschrijving: str | None = Field(default=None, max_length=1000)
    starttijd: datetime
    niveau: ActivityLevel | None = None
    locatie_naam: str | None = None
    woonplaats: str | None = None
    straatnaam: str | None = Field(default=None, max_length=200)
    huisnummer: str | None = Field(default=None, max_length=30)
    postcode: str | None = Field(default=None, max_length=20)
    land: str | None = Field(default=None, max_length=100)
    breedtegraad: float | None = Field(default=None, ge=-90, le=90)
    lengtegraad: float | None = Field(default=None, ge=-180, le=180)
    externe_locatie_id: str | None = Field(default=None, max_length=255)
    maximaal_aantal_deelnemers: int = Field(ge=2, le=50)


class OrganizerTransfer(BaseModel):
    nieuwe_organisator_id: int = Field(gt=0)


# Base64 data URL of a raster image; ~1.5 MB file → ~2 MB of text. No SVG (can carry scripts).
PROFILE_PHOTO_PATTERN = r"^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$"


class ProfileUpdate(BaseModel):
    naam: str | None = Field(default=None, min_length=2, max_length=100)
    woonplaats: str | None = Field(default=None, min_length=2, max_length=100)
    geboortedatum: date | None = None
    bio: str | None = Field(default=None, max_length=500)
    profielfoto: str | None = Field(default=None, max_length=2_100_000, pattern=PROFILE_PHOTO_PATTERN)
    profiel_openbaar: bool | None = None
    priveberichten_toestaan: bool | None = None
    favoriete_sporten_tonen: bool | None = None


# Columns that may be cleared with an explicit null.
PROFILE_NULLABLE_FIELDS = {"bio", "profielfoto"}


class SportPreferencesInput(BaseModel):
    favoriet: list[str] = Field(default_factory=list, max_length=50)
    verborgen: list[str] = Field(default_factory=list, max_length=50)


class FriendRequestInput(BaseModel):
    gebruiker_id: int = Field(gt=0)


class FriendResponseInput(BaseModel):
    verzoek_id: int = Field(gt=0)
    accepteren: bool


class PrivateMessageInput(BaseModel):
    inhoud: str = Field(min_length=1, max_length=4000)


class ChatMessageInput(BaseModel):
    inhoud: str = Field(min_length=1, max_length=4000)
