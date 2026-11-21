DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=34) THEN
    ALTER TABLE achievement_unlocks ADD COLUMN IF NOT EXISTS reward_claimed_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS daily_puzzle_solves_profile ON daily_puzzle_runs(profile_id)
      WHERE solved_at IS NOT NULL;
    INSERT INTO schema_migrations(version) VALUES(34);
  END IF;
END $$;
