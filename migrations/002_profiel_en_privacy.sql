-- Profielgegevens en privacyinstellingen server-side opslaan
-- (voorheen alleen in localStorage van de browser).
--
-- Sportvoorkeuren gebruiken de bestaande tabel "GEBRUIKER_SPORTVOORKEUR":
--   voorkeursniveau 3 = favoriet, 1 = verborgen (geen rij = neutraal).

BEGIN;

ALTER TABLE "GEBRUIKER"
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS profiel_openbaar BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS priveberichten_toestaan BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS favoriete_sporten_tonen BOOLEAN NOT NULL DEFAULT TRUE;

-- profielfoto bestaat al (varchar); begrens bio-lengte in de database.
ALTER TABLE "GEBRUIKER" DROP CONSTRAINT IF EXISTS bio_lengte;
ALTER TABLE "GEBRUIKER"
    ADD CONSTRAINT bio_lengte CHECK (bio IS NULL OR char_length(bio) <= 500);

COMMIT;
