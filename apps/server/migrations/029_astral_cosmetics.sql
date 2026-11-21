DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=29) THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_portrait_frame_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_portrait_frame_check
      CHECK(portrait_frame IN('classic','silver','azure','verdant','amethyst','gold','astral'));
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_profile_banner_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_profile_banner_check
      CHECK(profile_banner IN('classic','astral','ember','astral-crest'));
    CREATE INDEX IF NOT EXISTS match_ratings_profile_match ON match_ratings(profile_id,match_id);
    INSERT INTO schema_migrations(version) VALUES(29);
  END IF;
END $$;
