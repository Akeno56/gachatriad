DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=30) THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_portrait_frame_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_portrait_frame_check
      CHECK(portrait_frame IN('classic','silver','azure','verdant','amethyst','gold','astral','ember'));
    INSERT INTO schema_migrations(version) VALUES(30);
  END IF;
END $$;
