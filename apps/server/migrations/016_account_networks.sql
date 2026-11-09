CREATE TABLE IF NOT EXISTS account_networks (
 network TEXT PRIMARY KEY, blocked BOOLEAN NOT NULL DEFAULT false,
 allow_shared BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS account_ips (
 user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 ip TEXT NOT NULL, network TEXT NOT NULL,
 first_seen TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,ip)
);
CREATE INDEX IF NOT EXISTS account_ips_network ON account_ips(network);
INSERT INTO account_ips(user_id,ip,network,first_seen,last_seen)
 SELECT s."userId",host(s."ipAddress"::inet),
 CASE WHEN family(s."ipAddress"::inet)=6 THEN network(set_masklen(s."ipAddress"::inet,64))::text ELSE host(s."ipAddress"::inet) END,
 min(s."createdAt"),max(s."createdAt")
 FROM session s JOIN "user" u ON u.id=s."userId"
 WHERE coalesce(u."isAnonymous",false)=false AND s."ipAddress" IS NOT NULL
 AND s."ipAddress" ~ '^[0-9a-fA-F:.]+$'
 GROUP BY s."userId",s."ipAddress"
 ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS security_log (
 id BIGSERIAL PRIMARY KEY, action TEXT NOT NULL, network TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS match_ratings (
 match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 before_rating INTEGER NOT NULL, after_rating INTEGER NOT NULL,
 PRIMARY KEY(match_id,profile_id)
);
INSERT INTO schema_migrations(version) VALUES(16) ON CONFLICT DO NOTHING;
