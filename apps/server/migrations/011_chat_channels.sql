ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'general' CHECK(channel IN('general','trade','lobbies'));
CREATE INDEX IF NOT EXISTS chat_by_channel ON chat_messages(channel,created_at DESC);
INSERT INTO schema_migrations(version) VALUES(11) ON CONFLICT DO NOTHING;
