CREATE TABLE IF NOT EXISTS deck_loadouts(
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(char_length(name) BETWEEN 1 AND 40),
 cards JSONB NOT NULL CHECK(jsonb_typeof(cards)='array' AND jsonb_array_length(cards)<=5),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS deck_loadout_names ON deck_loadouts(profile_id,lower(name));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_loadout_id TEXT;
INSERT INTO schema_migrations(version) VALUES(20) ON CONFLICT DO NOTHING;
