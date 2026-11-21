DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=31) THEN
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rated_cosmetic_games INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS matches_rematch_target ON matches(rematch_match_id)
      WHERE rematch_match_id IS NOT NULL;
    UPDATE profiles p SET rated_cosmetic_games=eligible.games
    FROM (
      SELECT r.profile_id, count(*)::int AS games
      FROM match_ratings r JOIN matches m ON m.id=r.match_id
      WHERE m.status='complete' AND m.end_reason IS NULL
        AND m.mode IN('ranked','ranked-random','draft','shared-draft')
        AND NOT EXISTS(SELECT 1 FROM matches previous WHERE previous.rematch_match_id=m.id)
      GROUP BY r.profile_id
    ) eligible
    WHERE p.id=eligible.profile_id;
    UPDATE profiles SET
      portrait_frame=CASE WHEN portrait_frame IN('silver','azure','verdant','amethyst','gold')
        OR (rated_cosmetic_games<50 AND portrait_frame='ember') THEN 'classic' ELSE portrait_frame END,
      profile_banner=CASE WHEN rated_cosmetic_games<50 AND profile_banner='ember' THEN 'classic' ELSE profile_banner END,
      profile_revision=profile_revision+1
    WHERE portrait_frame IN('silver','azure','verdant','amethyst','gold')
      OR (rated_cosmetic_games<50 AND (portrait_frame='ember' OR profile_banner='ember'));
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_portrait_frame_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_portrait_frame_check
      CHECK(portrait_frame IN('classic','slate','ember','jade','eclipse','regalia','astral-season','astral'));
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_profile_banner_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_profile_banner_check
      CHECK(profile_banner IN('classic','slate','ember','jade','eclipse','regalia','astral','astral-crest'));
    INSERT INTO schema_migrations(version) VALUES(31);
  END IF;
END $$;
