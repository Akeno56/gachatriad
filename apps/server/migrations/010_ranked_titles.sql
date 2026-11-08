ALTER TABLE profiles ADD COLUMN IF NOT EXISTS best_ranked_position INTEGER CHECK(best_ranked_position>=1);
UPDATE lobbies SET rules=rules || '{"same":true,"plus":true,"combo":true}'::jsonb
 WHERE status='waiting' AND mode IN('casual','draft') AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=10);
INSERT INTO schema_migrations(version) VALUES(10) ON CONFLICT DO NOTHING;
