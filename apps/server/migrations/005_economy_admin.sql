ALTER TABLE profiles ADD COLUMN IF NOT EXISTS prisms INTEGER NOT NULL DEFAULT 0 CHECK(prisms>=0);
CREATE TABLE IF NOT EXISTS booster_packs(
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
 source TEXT NOT NULL CHECK(source IN('starter','purchase')), grant_index INTEGER,
 request_id TEXT, cost INTEGER NOT NULL DEFAULT 0 CHECK(cost>=0),
 cards JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), opened_at TIMESTAMPTZ,
 UNIQUE(profile_id,request_id), UNIQUE(profile_id,source,grant_index)
);
CREATE TABLE IF NOT EXISTS prism_ledger(
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), delta INTEGER NOT NULL,
 kind TEXT NOT NULL, reference TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(profile_id,reference)
);
CREATE TABLE IF NOT EXISTS server_admins(
 auth_user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS server_suspensions(
 auth_user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 reason TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moderation_log(
 id TEXT PRIMARY KEY, auth_user_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
