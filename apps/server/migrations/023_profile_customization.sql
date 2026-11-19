ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_bio TEXT NOT NULL DEFAULT '' CHECK(char_length(profile_bio)<=160);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS portrait_frame TEXT NOT NULL DEFAULT 'classic' CHECK(portrait_frame IN('classic','silver','azure','verdant','amethyst','gold'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS featured_mode TEXT NOT NULL DEFAULT 'ranked' CHECK(featured_mode IN('ranked','draft','shared-draft'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS showcase_cards JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(showcase_cards)='array' AND jsonb_array_length(showcase_cards)<=3);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS showcase_achievements JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(showcase_achievements)='array' AND jsonb_array_length(showcase_achievements)<=3);
INSERT INTO schema_migrations(version) VALUES(23) ON CONFLICT DO NOTHING;
