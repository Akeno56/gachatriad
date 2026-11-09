ALTER TABLE matches ADD COLUMN IF NOT EXISTS disconnected_at JSONB NOT NULL DEFAULT '[null,null]';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS activity_at JSONB NOT NULL DEFAULT '[0,0]';
ALTER TABLE local_population ADD COLUMN IF NOT EXISTS mix JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bot_difficulty TEXT NOT NULL DEFAULT 'medium';
UPDATE matches SET activity_at=jsonb_build_array((extract(epoch FROM created_at)*1000)::bigint,(extract(epoch FROM created_at)*1000)::bigint) WHERE activity_at='[0,0]'::jsonb;
CREATE TABLE IF NOT EXISTS chat_moderation_state (
 profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
 strikes INTEGER NOT NULL DEFAULT 0,
 window_started BIGINT NOT NULL,
 muted_until BIGINT NOT NULL DEFAULT 0
);
INSERT INTO schema_migrations(version) VALUES(14) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS battle_messages (
 id TEXT PRIMARY KEY,
 match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 body TEXT NOT NULL,
 request_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(sender_id,request_id)
);
CREATE INDEX IF NOT EXISTS battle_messages_match ON battle_messages(match_id,created_at);
