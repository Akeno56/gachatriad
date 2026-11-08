ALTER TABLE matches ADD COLUMN IF NOT EXISTS draft_revealed JSONB NOT NULL DEFAULT '[0,0]';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS rematch_requested_by TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS rematch_requested_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS rematch_match_id TEXT;
CREATE TABLE IF NOT EXISTS card_purchases(
 profile_id TEXT NOT NULL REFERENCES profiles(id), request_id TEXT NOT NULL,
 card_id TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(profile_id,request_id)
);
INSERT INTO schema_migrations(version) VALUES(12) ON CONFLICT DO NOTHING;
