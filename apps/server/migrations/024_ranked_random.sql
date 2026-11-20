ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ranked_random_rating INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS unrated_rematch BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
 -- A rollback to a release before Ranked Random can restore the older lobby constraint.
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='lobbies'::regclass AND conname='lobbies_mode_check'
   AND strpos(pg_get_constraintdef(oid),'ranked-random')>0
 ) THEN
  ALTER TABLE lobbies DROP CONSTRAINT IF EXISTS lobbies_mode_check;
  ALTER TABLE lobbies ADD CONSTRAINT lobbies_mode_check CHECK(mode IN('casual','custom','ranked','ranked-random','draft','shared-draft','roulette'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version=24) THEN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_featured_mode_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_featured_mode_check CHECK(featured_mode IN('ranked','ranked-random','draft','shared-draft'));
  UPDATE lobbies SET rules=rules || '{"threeOpen":true,"allOpen":false,"elemental":true}'::jsonb
   WHERE mode='ranked' AND status='waiting';
  INSERT INTO schema_migrations(version) VALUES(24);
 END IF;
END $$;
