ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bot_style TEXT NOT NULL DEFAULT 'balanced' CHECK(bot_style IN('balanced','aggressive','defensive','combo'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS cpu_style TEXT NOT NULL DEFAULT 'balanced' CHECK(cpu_style IN('balanced','aggressive','defensive','combo'));
CREATE TABLE IF NOT EXISTS match_replays(
 match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
 payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS replay_owners(
 match_id TEXT NOT NULL REFERENCES match_replays(match_id) ON DELETE CASCADE,
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 seat INTEGER NOT NULL CHECK(seat IN(0,1)),
 favorite BOOLEAN NOT NULL DEFAULT false,
 PRIMARY KEY(match_id,profile_id)
);
CREATE INDEX IF NOT EXISTS replay_library ON replay_owners(profile_id,favorite,match_id);
INSERT INTO schema_migrations(version) VALUES(22) ON CONFLICT DO NOTHING;
