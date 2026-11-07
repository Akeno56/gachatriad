CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS profiles(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 rating INTEGER NOT NULL DEFAULT 1000, draft_rating INTEGER NOT NULL DEFAULT 1000, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
 draws INTEGER NOT NULL DEFAULT 0, played INTEGER NOT NULL DEFAULT 0, captures INTEGER NOT NULL DEFAULT 0,
 same_captures INTEGER NOT NULL DEFAULT 0, plus_captures INTEGER NOT NULL DEFAULT 0, combo_captures INTEGER NOT NULL DEFAULT 0,
 best_combo INTEGER NOT NULL DEFAULT 0, perfect_wins INTEGER NOT NULL DEFAULT 0, trade_wins INTEGER NOT NULL DEFAULT 0,
 default_deck JSONB NOT NULL, starter_granted BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS profile_accounts(
 user_key TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id),
 auth_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL, is_primary BOOLEAN NOT NULL DEFAULT false,
 PRIMARY KEY(user_key,profile_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_primary_profile ON profile_accounts(auth_user_id) WHERE is_primary AND auth_user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS card_definitions(id TEXT PRIMARY KEY, definition JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS inventory(
 profile_id TEXT NOT NULL REFERENCES profiles(id), card_id TEXT NOT NULL REFERENCES card_definitions(id),
 quantity INTEGER NOT NULL CHECK(quantity>=0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=quantity),
 PRIMARY KEY(profile_id,card_id)
);
CREATE TABLE IF NOT EXISTS matches(
 id TEXT PRIMARY KEY, mode TEXT NOT NULL, player0 TEXT NOT NULL REFERENCES profiles(id), player1 TEXT REFERENCES profiles(id),
 difficulty TEXT, state JSONB, decks JSONB NOT NULL, pools JSONB, rules JSONB NOT NULL,
 trade_rule TEXT NOT NULL DEFAULT 'none' CHECK(trade_rule IN('none','one')),
 status TEXT NOT NULL CHECK(status IN('drafting','playing','complete')), winner INTEGER CHECK(winner IN(0,1)),
 is_draw BOOLEAN NOT NULL DEFAULT false, version INTEGER NOT NULL DEFAULT 0,
 deadline BIGINT, auto_turns JSONB NOT NULL DEFAULT '[0,0]', claim_deadline BIGINT, claimed_card TEXT REFERENCES card_definitions(id),
 settlement_done BOOLEAN NOT NULL DEFAULT false, end_reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS matches_participants ON matches(player0,player1,status);
CREATE TABLE IF NOT EXISTS lobbies(
 id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES profiles(id), guest_id TEXT REFERENCES profiles(id),
 name TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN('casual','custom','ranked','draft','roulette')),
 rules JSONB NOT NULL, trade_rule TEXT NOT NULL DEFAULT 'none',
 status TEXT NOT NULL CHECK(status IN('waiting','playing','closed')), match_id TEXT REFERENCES matches(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_waiting_lobby_per_host ON lobbies(host_id) WHERE status='waiting';
CREATE TABLE IF NOT EXISTS inventory_ledger(
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), card_id TEXT NOT NULL REFERENCES card_definitions(id),
 delta INTEGER NOT NULL, kind TEXT NOT NULL, match_id TEXT REFERENCES matches(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_trade_settlement ON inventory_ledger(match_id,profile_id) WHERE kind='trade-one';
CREATE TABLE IF NOT EXISTS achievement_unlocks(
 profile_id TEXT NOT NULL REFERENCES profiles(id), achievement_id TEXT NOT NULL,
 unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(profile_id,achievement_id)
);
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
