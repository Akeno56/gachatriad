ALTER TABLE matches ADD COLUMN IF NOT EXISTS turn_hours SMALLINT CHECK(turn_hours IN(24,48,72));
ALTER TABLE duel_invitations ALTER COLUMN lobby_id DROP NOT NULL;
ALTER TABLE duel_invitations ADD COLUMN IF NOT EXISTS turn_hours SMALLINT CHECK(turn_hours IN(24,48,72));
ALTER TABLE duel_invitations ADD COLUMN IF NOT EXISTS match_id TEXT REFERENCES matches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS correspondence_host ON matches(player0) WHERE mode='correspondence' AND status='playing';
CREATE INDEX IF NOT EXISTS correspondence_guest ON matches(player1) WHERE mode='correspondence' AND status='playing';
CREATE TABLE IF NOT EXISTS lobby_presets(
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  rules JSONB NOT NULL,
  trade_rule TEXT NOT NULL CHECK(trade_rule IN('none','one')),
  allow_bots BOOLEAN NOT NULL,
  UNIQUE(profile_id,name)
);
INSERT INTO schema_migrations(version) VALUES(25) ON CONFLICT DO NOTHING;
