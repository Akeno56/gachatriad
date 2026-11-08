CREATE TABLE IF NOT EXISTS friend_messages(
 id TEXT PRIMARY KEY,
 sender_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 recipient_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 300),
 request_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 read_at TIMESTAMPTZ,
 CHECK(sender_id<>recipient_id),
 UNIQUE(sender_id,request_id)
);
CREATE INDEX IF NOT EXISTS friend_messages_thread ON friend_messages(sender_id,recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS friend_messages_unread ON friend_messages(recipient_id) WHERE read_at IS NULL;
INSERT INTO schema_migrations(version) VALUES(7) ON CONFLICT DO NOTHING;
