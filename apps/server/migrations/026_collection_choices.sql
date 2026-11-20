CREATE TABLE IF NOT EXISTS card_wishlist(
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 card_id TEXT NOT NULL REFERENCES card_definitions(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,card_id)
);
CREATE TABLE IF NOT EXISTS market_requests(
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 card_id TEXT NOT NULL REFERENCES card_definitions(id),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','fulfilled','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS market_request_card ON market_requests(profile_id,card_id) WHERE status='open';
ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS market_request_id TEXT REFERENCES market_requests(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS market_response_seller ON trade_offers(market_request_id,owner_id) WHERE market_request_id IS NOT NULL AND status='open';
CREATE INDEX IF NOT EXISTS market_wishlist_offers ON trade_offers(offered_card) WHERE market_request_id IS NULL AND status='open';
CREATE TABLE IF NOT EXISTS weekly_swaps(
 account_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 week_start DATE NOT NULL,
 original TEXT NOT NULL,
 replacement TEXT NOT NULL,
 PRIMARY KEY(account_id,week_start)
);
INSERT INTO schema_migrations(version) VALUES(26) ON CONFLICT DO NOTHING;
