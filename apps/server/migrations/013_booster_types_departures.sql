ALTER TABLE booster_packs ADD COLUMN IF NOT EXISTS pack_type TEXT NOT NULL DEFAULT 'standard';
UPDATE booster_packs SET pack_type='starter' WHERE source='starter';
ALTER TABLE booster_purchases ADD COLUMN IF NOT EXISTS pack_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS departed JSONB NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS gameplay_resets(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES(13) ON CONFLICT DO NOTHING;
