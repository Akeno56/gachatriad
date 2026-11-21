DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=32) THEN
    ALTER TABLE achievement_unlocks ADD COLUMN IF NOT EXISTS granted_by TEXT;
    INSERT INTO achievement_unlocks(profile_id,achievement_id)
      SELECT p.id,milestone.id FROM profiles p
      CROSS JOIN (VALUES ('rated-25',25),('rated-50',50),('rated-100',100),('rated-200',200),('rated-500',500)) AS milestone(id,games)
      WHERE p.rated_cosmetic_games>=milestone.games AND NOT p.is_bot
      ON CONFLICT DO NOTHING;
    INSERT INTO schema_migrations(version) VALUES(32);
  END IF;
END $$;
