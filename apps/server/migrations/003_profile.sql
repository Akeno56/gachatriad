ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_card TEXT REFERENCES card_definitions(id);
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
