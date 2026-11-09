ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS spectatable BOOLEAN NOT NULL DEFAULT true;
UPDATE lobbies SET spectatable=false WHERE invited_profile IS NOT NULL;
INSERT INTO schema_migrations(version) VALUES(15) ON CONFLICT DO NOTHING;
