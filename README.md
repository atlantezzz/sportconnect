# SportConnect

SportConnect is een Nederlandse webapp om samen te sporten. Je vindt sportactiviteiten bij jou in de buurt op een kaart, meldt je aan, organiseert zelf activiteiten en spreekt af via een groepschat per activiteit. Daarnaast kun je vrienden toevoegen, privéberichten sturen en meldingen ontvangen.

De app is in ontwikkeling en draait nu alleen lokaal op de server. Publieke toegang via https://sportconnect.fit (Cloudflare Tunnel) is gepland maar nog niet ingericht.

## Functies

- **Kaart en activiteiten**: activiteiten zoeken en filteren op sport, plaats en type (alles, eigen, aangemeld, van vrienden); activiteiten aanmaken, wijzigen, annuleren en het organisatorschap overdragen.
- **Groepschat** per activiteit voor deelnemers en organisator.
- **Vrienden en privéberichten**: gebruikers zoeken, vriendschapsverzoeken, privégesprekken tussen vrienden.
- **Meldingen** in de app, met voorkeuren per categorie.
- **E-mail** via Resend: welkomstmail na registratie en wachtwoord vergeten/herstellen (`/wachtwoord-vergeten`).
- **Profiel**: naam, woonplaats, geboortedatum (anderen zien alleen je leeftijd), bio, profielfoto, favoriete en verborgen sporten, en privacykeuzes (openbaar profiel, privéberichten toestaan). Andere gebruikers bekijken je profiel via `/users/<id>`; je krijgt een melding als iemand dat doet.
- **Licht en donker thema**.

## Techniek

| Onderdeel | Gebruikt |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, react-leaflet |
| Backend | FastAPI (Python), psycopg 3 met ruwe SQL, argon2 voor wachtwoorden |
| Database | PostgreSQL 17 |
| Adressen | Geoapify (autocomplete en geocoding, via de frontend-proxy) |
| Draaien | Docker Compose |

De browser praat alleen met de frontend. Eén catch-all route, `frontend/src/app/api/[...path]/route.ts`, stuurt verzoeken met de sessiecookie door naar de FastAPI-backend; alleen de adresroutes (`api/geocode/*`) zijn aparte bestanden.

## Mappen

```
backend/app/             FastAPI-backend: main.py koppelt de routers in routers/
backend/tests/           API-tests (pytest), te starten met backend/run-tests.sh
frontend/src/app/        Pagina's en API-proxyroutes (Next.js App Router)
frontend/src/components/ Gedeelde componenten (header, kaart, formulieren, chat)
migrations/              SQL-migraties
compose.yml              Services: db, api (:8000), frontend (:3000) en tunnel
tools/ui-audit/          Browsertest: gebruikersstromen, screenshots en contrastcheck
```

## Starten

Nodig: Docker met Docker Compose.

1. Maak een `.env` in de hoofdmap met deze variabelen (staat niet in Git):

   ```
   POSTGRES_PASSWORD=...
   SESSION_SECRET=...
   GEOAPIFY_API_KEY=...
   RESEND_API_KEY=...      # optioneel: e-mails (welkom, wachtwoordherstel)
   CLOUDFLARE_TUNNEL_TOKEN=...  # alleen nodig voor de publieke site
   ```

2. Start alles:

   ```bash
   docker compose up -d --build
   ```

3. Open http://localhost:3000. De poorten 3000 en 8000 zijn alleen op `127.0.0.1` bereikbaar.

Inloggen werkt alleen via `localhost` of HTTPS, omdat de sessiecookie `Secure` is (`COOKIE_SECURE=true`).

Na een codewijziging herbouw je alleen wat veranderd is: `docker compose up -d --build api` of `docker compose up -d --build frontend`.

## Online

De site staat live op https://sportconnect.fit via een Cloudflare Tunnel (service `tunnel` in `compose.yml`, token in `.env`). In het Cloudflare-dashboard (Zero Trust → Tunnels) wijst de route naar `http://sportconnect-frontend:3000`; de tunnel moet daarom op het Docker-netwerk `backend` blijven. Alles wat je deployt is dus meteen openbaar.

## API

Alle endpoints (behalve registreren, inloggen en wachtwoordherstel) vragen een ingelogde sessie. De JSON gebruikt Nederlandse sleutels (`activiteit_id`, `starttijd`), behalve `/notifications`. Foutmeldingen staan in `detail`.

| Groep | Endpoints |
|---|---|
| Account | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/logout-everywhere`, `/auth/password/change`, `/auth/password-reset/request`, `/auth/password-reset/confirm`, `GET /auth/me` |
| Profiel | `GET/PUT /profile`, `PUT /profile/sport-preferences`, `GET /users/{id}`, `GET /sports` |
| Activiteiten | `GET/POST /activities`, `GET /activities/joined`, `PUT /activities/{id}`, `POST /activities/{id}/cancel`, `POST/DELETE /activities/{id}/join`, `GET /activities/{id}/members`, `POST /activities/{id}/transfer-organizer` |
| Groepschat | `GET /activities/{id}/chat`, `GET/POST /activities/{id}/chat/messages` |
| Vrienden en berichten | `GET /friends`, `GET /friends/search`, `POST /friends/request`, `POST /friends/respond`, `DELETE /friends/{id}`, `GET/POST /messages/{id}`, `GET /chats` |
| Meldingen | `GET /notifications`, `POST /notifications/read-all`, `GET/PUT /notification-preferences` |

## Datamodel

Tabelnamen zijn Nederlands en in hoofdletters. De belangrijkste:

- `GEBRUIKER`: account, profiel en `sessie_versie` (uitloggen op alle apparaten).
- `SPORT`, `GEBRUIKER_SPORTVOORKEUR`: sporten en favorieten per gebruiker.
- `ACTIVITEIT`: titel, sport, starttijd (Nederlandse tijd), locatie met coördinaten, niveau, maximum aantal deelnemers, status `OPEN`/`GEANNULEERD`, organisator (`maker_id`).
- `ACTIVITEIT_DEELNEMER`: wie meedoet.
- `GROEPSCHAT`, `CHATLID`, `BERICHT`: groepschat per activiteit.
- `SPORTCONNECT_VRIENDSCHAP`, `SPORTCONNECT_PRIVATBERICHT`: vriendschappen en privéberichten.
- `NOTIFICATIE`, `GEBRUIKER_NOTIFICATIEVOORKEUR`: meldingen en welke je wilt ontvangen.
- `WACHTWOORD_HERSTEL`: eenmalige herstellinks (alleen de hash).

## Database

- Migraties staan in `migrations/` en voer je met de hand uit:
  `docker exec -i sportconnect-db psql -U sportconnect -d sportconnect -v ON_ERROR_STOP=1 < migrations/NNN_naam.sql`
- `001` t/m `006` op volgorde uitvoeren op een lege database geeft precies het schema van de live database.
- Maak vóór een migratie een back-up in `backups/db/` (die map staat niet in Git).
- Verwijder nooit het volume `postgres_data` (dus geen `docker compose down -v`).

## Controleren

```bash
cd frontend
npx tsc --noEmit -p .                    # typecheck
npx eslint src                           # lint
curl -s http://127.0.0.1:8000/health     # backend
curl -s http://127.0.0.1:8000/db-health  # database
backend/run-tests.sh                     # API-tests (vanuit de hoofdmap)
tools/ui-audit/run.sh "<activiteit-ids>" # browsertest en contrastcheck
```

De API-tests draaien tegen de echte database met de twee testaccounts uit `~/.claude/sportconnect-test-account.env`. Alles wat ze aanmaken heet `[TEST] …` en wordt na afloop verwijderd; `backend/scripts/verwijder_testdata.sql` ruimt achtergebleven testdata op.

## Projectbeheer

Taken, bugs en het logboek staan in Notion (in het Nederlands). Afspraken voor wie aan de code werkt, ook voor Claude Code, staan in `CLAUDE.md`.
