ALTER TABLE battle_messages ADD COLUMN IF NOT EXISTS stamp_id TEXT CHECK(stamp_id IN('good-luck','nice-play','good-game','thanks'));
INSERT INTO schema_migrations(version) VALUES(28) ON CONFLICT DO NOTHING;
