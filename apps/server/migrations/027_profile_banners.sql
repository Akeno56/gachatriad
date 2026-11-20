ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_banner TEXT NOT NULL DEFAULT 'classic' CHECK(profile_banner IN('classic','astral','ember'));
INSERT INTO schema_migrations(version) VALUES(27) ON CONFLICT DO NOTHING;
