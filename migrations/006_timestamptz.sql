-- Tijdstippen met tijdzone (timestamptz). Bestaande waarden zijn UTC (de
-- databasesessie draait in UTC). Uitzondering: "ACTIVITEIT".starttijd blijft
-- een Nederlandse kloktijd zonder tijdzone (zo stuurt de frontend hem).
-- GROEPSCHAT.verloopt_op is starttijd + 7 dagen, dus Nederlandse tijd.
-- Idempotent: een kolom die al timestamptz is, wordt overgeslagen.
BEGIN;

DO $$
DECLARE
    kolom RECORD;
BEGIN
    FOR kolom IN
        SELECT * FROM (VALUES
            ('ACTIVITEIT', 'aangemaakt_op', 'UTC'),
            ('ACTIVITEIT', 'bijgewerkt_op', 'UTC'),
            ('ACTIVITEIT_DEELNEMER', 'deelname_vanaf', 'UTC'),
            ('BERICHT', 'verzonden_op', 'UTC'),
            ('BERICHT_BIJLAGE', 'aangemaakt_op', 'UTC'),
            ('CHATLID', 'toegevoegd_op', 'UTC'),
            ('CHATLID', 'verlaten_op', 'UTC'),
            ('GEBRUIKER', 'aangemaakt_op', 'UTC'),
            ('GEBRUIKER', 'bijgewerkt_op', 'UTC'),
            ('GEBRUIKER_BLOKKADE', 'aangemaakt_op', 'UTC'),
            ('GROEPSCHAT', 'aangemaakt_op', 'UTC'),
            ('NOTIFICATIE', 'aangemaakt_op', 'UTC'),
            ('NOTIFICATIE', 'gelezen_op', 'UTC'),
            ('RAPPORTAGE', 'aangemaakt_op', 'UTC'),
            ('RAPPORTAGE', 'afgehandeld_op', 'UTC'),
            ('GROEPSCHAT', 'verloopt_op', 'Europe/Amsterdam')
        ) AS k(tabel, naam, zone)
        WHERE EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = k.tabel AND column_name = k.naam
              AND data_type = 'timestamp without time zone'
        )
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE %L',
            kolom.tabel, kolom.naam, kolom.naam, kolom.zone
        );
    END LOOP;
END $$;

COMMIT;
