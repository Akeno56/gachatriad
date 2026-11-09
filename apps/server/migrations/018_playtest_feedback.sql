CREATE TABLE IF NOT EXISTS feedback_reports(
 id TEXT PRIMARY KEY, profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
 request_id TEXT NOT NULL, network_hash TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('bug','feedback')),
 subject TEXT NOT NULL, details TEXT NOT NULL, context JSONB NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewing','resolved','dismissed')),
 admin_note TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(profile_id,request_id)
);
CREATE INDEX IF NOT EXISTS feedback_recent ON feedback_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_network ON feedback_reports(network_hash,created_at);
CREATE INDEX IF NOT EXISTS matches_active_runtime ON matches(deadline) WHERE status IN('playing','drafting');
CREATE INDEX IF NOT EXISTS matches_pending_claim ON matches(claim_deadline) WHERE status='complete' AND NOT settlement_done;
CREATE INDEX IF NOT EXISTS matches_player1_status ON matches(player1,status,completed_at DESC);
CREATE INDEX IF NOT EXISTS matches_player0_status ON matches(player0,status,completed_at DESC);
CREATE INDEX IF NOT EXISTS offers_open_runtime ON trade_offers(created_at DESC) WHERE status='open';
INSERT INTO schema_migrations(version) VALUES(18) ON CONFLICT DO NOTHING;
