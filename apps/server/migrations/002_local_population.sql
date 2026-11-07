ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS local_population(id INTEGER PRIMARY KEY CHECK(id=1),enabled BOOLEAN NOT NULL DEFAULT false);
INSERT INTO local_population(id,enabled) VALUES(1,false) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS trade_offers(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES profiles(id),offered_card TEXT NOT NULL REFERENCES card_definitions(id),
 wanted_card TEXT NOT NULL REFERENCES card_definitions(id),status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','accepted','cancelled')),
 taker_id TEXT REFERENCES profiles(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),settled_at TIMESTAMPTZ
);
ALTER TABLE inventory_ledger ADD COLUMN IF NOT EXISTS offer_id TEXT REFERENCES trade_offers(id);
CREATE UNIQUE INDEX IF NOT EXISTS one_market_settlement ON inventory_ledger(offer_id,profile_id,card_id) WHERE kind='card-trade';
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
