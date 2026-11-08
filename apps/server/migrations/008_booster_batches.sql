CREATE TABLE IF NOT EXISTS booster_purchases(
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 total_cost INTEGER NOT NULL CHECK(total_cost>0),
 pack_ids JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,request_id)
);
INSERT INTO booster_purchases(profile_id,request_id,quantity,total_cost,pack_ids)
 SELECT profile_id,request_id,1,cost,jsonb_build_array(id) FROM booster_packs
 WHERE source='purchase' AND request_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=8) ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(version) VALUES(8) ON CONFLICT DO NOTHING;
