CREATE TABLE IF NOT EXISTS journey_stamps(
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 chapter TEXT NOT NULL,
 completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,chapter)
);
CREATE TABLE IF NOT EXISTS weekly_claims(
 account_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 week_start DATE NOT NULL,
 claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,week_start)
);
CREATE TABLE IF NOT EXISTS journey_deck_weeks(
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 week_start DATE NOT NULL,
 PRIMARY KEY(profile_id,week_start)
);
INSERT INTO journey_stamps(profile_id,chapter)
 SELECT DISTINCT profile_id,'deck' FROM deck_loadouts WHERE jsonb_array_length(cards)=5 ON CONFLICT DO NOTHING;
INSERT INTO journey_deck_weeks(profile_id,week_start)
 SELECT DISTINCT profile_id,date_trunc('week',updated_at AT TIME ZONE 'UTC')::date FROM deck_loadouts WHERE jsonb_array_length(cards)=5 ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS weekly_matches_player0 ON matches(player0,completed_at) WHERE status='complete';
CREATE INDEX IF NOT EXISTS weekly_matches_player1 ON matches(player1,completed_at) WHERE status='complete';
INSERT INTO schema_migrations(version) VALUES(21) ON CONFLICT DO NOTHING;
