ALTER TABLE lobby_events ADD COLUMN IF NOT EXISTS prizes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE lobby_events ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE lobby_events ADD COLUMN IF NOT EXISTS settled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE lobby_events ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS unsettled_lobby_events ON lobby_events(ends_at) WHERE NOT settled AND NOT cancelled;
ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS lobby_event_id TEXT REFERENCES lobby_events(id);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS lobby_event_id TEXT REFERENCES lobby_events(id);
CREATE INDEX IF NOT EXISTS event_matches ON matches(lobby_event_id) WHERE lobby_event_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS lobby_event_awards (
  event_id TEXT NOT NULL REFERENCES lobby_events(id),
  reward_index INTEGER NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title_id TEXT,
  PRIMARY KEY(event_id,reward_index,profile_id)
);
CREATE INDEX IF NOT EXISTS event_award_titles ON lobby_event_awards(profile_id) WHERE title_id IS NOT NULL;
INSERT INTO schema_migrations(version) VALUES(36) ON CONFLICT DO NOTHING;
