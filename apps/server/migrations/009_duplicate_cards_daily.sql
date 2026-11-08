ALTER TABLE booster_packs DROP CONSTRAINT IF EXISTS booster_packs_source_check;
ALTER TABLE booster_packs ADD CONSTRAINT booster_packs_source_check CHECK(source IN('starter','purchase','admin','daily'));
CREATE TABLE IF NOT EXISTS duplicate_actions(
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('recycle','trade-up')),
 inputs JSONB NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,request_id)
);
INSERT INTO schema_migrations(version) VALUES(9) ON CONFLICT DO NOTHING;
