ALTER TABLE trade_offers ALTER COLUMN wanted_card DROP NOT NULL;
ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS price INTEGER;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='market_offer_payment') THEN
  ALTER TABLE trade_offers ADD CONSTRAINT market_offer_payment CHECK (
   (wanted_card IS NOT NULL AND price IS NULL) OR
   (wanted_card IS NULL AND price IS NOT NULL AND price BETWEEN 1 AND 1000000)
  );
 END IF;
END $$;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS season INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS match_season_record ON matches(season,mode,status);
INSERT INTO schema_migrations(version) VALUES(17) ON CONFLICT DO NOTHING;
