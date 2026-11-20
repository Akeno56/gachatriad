ALTER TABLE matches ADD COLUMN IF NOT EXISTS shared_draft JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shared_draft_rating INTEGER NOT NULL DEFAULT 1000;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version=24) THEN
  ALTER TABLE lobbies DROP CONSTRAINT IF EXISTS lobbies_mode_check;
  ALTER TABLE lobbies ADD CONSTRAINT lobbies_mode_check CHECK(mode IN('casual','custom','ranked','draft','shared-draft','roulette'));
 END IF;
END $$;
UPDATE lobbies SET trade_rule='none' WHERE mode='ranked' AND status='waiting';
UPDATE matches SET trade_rule='none' WHERE mode='ranked' AND status IN('playing','drafting');
CREATE TABLE IF NOT EXISTS daily_puzzles(
 day DATE PRIMARY KEY, initial_state JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily_puzzle_runs(
 day DATE NOT NULL REFERENCES daily_puzzles(day),
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 state JSONB NOT NULL, attempts INTEGER NOT NULL DEFAULT 1 CHECK(attempts>0),
 version INTEGER NOT NULL DEFAULT 0, started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 solved_at TIMESTAMPTZ, solve_attempts INTEGER, elapsed_ms BIGINT,
 rewarded BOOLEAN NOT NULL DEFAULT false,
 last_start TEXT,
 PRIMARY KEY(day,profile_id)
);
CREATE INDEX IF NOT EXISTS daily_puzzle_leaderboard ON daily_puzzle_runs(day,solve_attempts,elapsed_ms) WHERE rewarded;
CREATE UNIQUE INDEX IF NOT EXISTS daily_puzzle_account_reward ON prism_ledger(reference) WHERE kind='daily-puzzle';
INSERT INTO schema_migrations(version) VALUES(19) ON CONFLICT DO NOTHING;
