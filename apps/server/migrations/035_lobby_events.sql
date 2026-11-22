CREATE TABLE IF NOT EXISTS lobby_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
  starts_at BIGINT NOT NULL,
  ends_at BIGINT NOT NULL CHECK(ends_at > starts_at),
  rules JSONB NOT NULL,
  trade_rule TEXT NOT NULL CHECK(trade_rule IN('none','one')),
  allow_bots BOOLEAN NOT NULL
);
INSERT INTO schema_migrations(version) VALUES(35) ON CONFLICT DO NOTHING;
