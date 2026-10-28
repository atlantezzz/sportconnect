-- 003: niveau bij activiteiten, geboortedatum, runtime-tabellen vastleggen,
-- en indexen voor chatoverzicht en meldingen.

BEGIN;

-- Niveau van een activiteit (werd in het formulier gevraagd maar niet opgeslagen).
ALTER TABLE "ACTIVITEIT"
    ADD COLUMN IF NOT EXISTS niveau VARCHAR(20) NOT NULL DEFAULT 'Alle niveaus';
ALTER TABLE "ACTIVITEIT" DROP CONSTRAINT IF EXISTS activiteit_niveau_geldig;
ALTER TABLE "ACTIVITEIT"
    ADD CONSTRAINT activiteit_niveau_geldig
    CHECK (niveau IN ('Alle niveaus', 'Beginner', 'Gemiddeld', 'Gevorderd'));

-- Geboortedatum; leeftijd wordt daaruit berekend. Bestaande accounts hebben alleen
-- "leeftijd" (blijft als terugval tot de gebruiker een geboortedatum invult).
ALTER TABLE "GEBRUIKER"
    ADD COLUMN IF NOT EXISTS geboortedatum DATE;

-- Tabellen die tot nu toe door de backend zelf werden aangemaakt (ensure_*_table).
CREATE TABLE IF NOT EXISTS "SPORTCONNECT_VRIENDSCHAP" (
    vriendschap_id BIGSERIAL PRIMARY KEY,
    gebruiker_laag_id BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
    gebruiker_hoog_id BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
    aangevraagd_door BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined')),
    aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (gebruiker_laag_id < gebruiker_hoog_id),
    UNIQUE (gebruiker_laag_id, gebruiker_hoog_id)
);

CREATE TABLE IF NOT EXISTS "SPORTCONNECT_PRIVATBERICHT" (
    bericht_id BIGSERIAL PRIMARY KEY,
    afzender_id BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
    ontvanger_id BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
    inhoud TEXT NOT NULL CHECK (char_length(trim(inhoud)) BETWEEN 1 AND 4000),
    verzonden_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (afzender_id <> ontvanger_id)
);
CREATE INDEX IF NOT EXISTS "idx_sc_privmsg_pair"
    ON "SPORTCONNECT_PRIVATBERICHT" (afzender_id, ontvanger_id, bericht_id);
CREATE INDEX IF NOT EXISTS "idx_sc_privmsg_reverse_pair"
    ON "SPORTCONNECT_PRIVATBERICHT" (ontvanger_id, afzender_id, bericht_id);

-- Chatoverzicht (laatste bericht per chat) en lidmaatschap per gebruiker.
CREATE INDEX IF NOT EXISTS "idx_bericht_chat" ON "BERICHT" (chat_id, bericht_id);
CREATE INDEX IF NOT EXISTS "idx_chatlid_gebruiker" ON "CHATLID" (gebruiker_id);
CREATE INDEX IF NOT EXISTS "idx_deelnemer_gebruiker" ON "ACTIVITEIT_DEELNEMER" (gebruiker_id);

-- Meldingen per gebruiker, en ontdubbelen van profielbezoekmeldingen.
CREATE INDEX IF NOT EXISTS "idx_notificatie_gebruiker"
    ON "NOTIFICATIE" (gebruiker_id, aangemaakt_op DESC);
CREATE INDEX IF NOT EXISTS "idx_notificatie_ontdubbelen"
    ON "NOTIFICATIE" (gebruiker_id, type, doel_url);

-- Wie zich al heeft afgemeld maar nog als actief chatlid staat, krijgt geen
-- groepschatmeldingen meer.
UPDATE "CHATLID" cl
SET verlaten_op = CURRENT_TIMESTAMP
FROM "GROEPSCHAT" gc
JOIN "ACTIVITEIT" a ON a.activiteit_id = gc.activiteit_id
WHERE cl.chat_id = gc.chat_id
  AND cl.verlaten_op IS NULL
  AND cl.gebruiker_id <> a.maker_id
  AND NOT EXISTS (
      SELECT 1 FROM "ACTIVITEIT_DEELNEMER" ad
      WHERE ad.activiteit_id = a.activiteit_id
        AND ad.gebruiker_id = cl.gebruiker_id
  );

COMMIT;
