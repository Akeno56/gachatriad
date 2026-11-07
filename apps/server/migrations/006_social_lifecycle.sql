ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE profiles p SET last_seen_at=greatest(p.created_at,u."updatedAt",coalesce((SELECT max(s."updatedAt") FROM session s WHERE s."userId"=u.id),u."createdAt"))
 FROM profile_accounts a JOIN "user" u ON u.id=a.auth_user_id WHERE a.profile_id=p.id AND coalesce(u."isAnonymous",false)
 AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=6);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS selected_title TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ranked_acknowledged BOOLEAN NOT NULL DEFAULT false;
UPDATE profiles p SET ranked_acknowledged=true WHERE EXISTS(SELECT 1 FROM matches m WHERE (m.player0=p.id OR m.player1=p.id) AND m.mode='ranked');
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS peak_rating INTEGER NOT NULL DEFAULT 1000;
UPDATE profiles SET peak_rating=greatest(peak_rating,rating);
ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS allow_bots BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS invited_profile TEXT REFERENCES profiles(id);
ALTER TABLE local_population ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN('easy','medium','hard'));
CREATE TABLE IF NOT EXISTS friendships(
 profile_a TEXT NOT NULL REFERENCES profiles(id), profile_b TEXT NOT NULL REFERENCES profiles(id),
 requested_by TEXT NOT NULL REFERENCES profiles(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(profile_a,profile_b), CHECK(profile_a<profile_b)
);
CREATE TABLE IF NOT EXISTS chat_messages(
 id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 300),
 request_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted BOOLEAN NOT NULL DEFAULT false,
 UNIQUE(profile_id,request_id)
);
CREATE INDEX IF NOT EXISTS chat_recent ON chat_messages(created_at DESC);
CREATE TABLE IF NOT EXISTS duel_invitations(
 id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES profiles(id),recipient_id TEXT NOT NULL REFERENCES profiles(id),
 lobby_id TEXT NOT NULL REFERENCES lobbies(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','expired')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_lobby_invite ON duel_invitations(lobby_id) WHERE status='pending';
ALTER TABLE booster_packs DROP CONSTRAINT IF EXISTS booster_packs_source_check;
ALTER TABLE booster_packs ADD CONSTRAINT booster_packs_source_check CHECK(source IN('starter','purchase','admin'));
ALTER TABLE booster_packs ADD COLUMN IF NOT EXISTS new_cards JSONB NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS admin_grants(
 id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),kind TEXT NOT NULL CHECK(kind IN('prisms','boosters')),
 amount INTEGER NOT NULL CHECK(amount>0),actor TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING;
