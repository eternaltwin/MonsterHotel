CREATE TABLE IF NOT EXISTS players (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS hotels (player_id BIGINT PRIMARY KEY REFERENCES players(id), state JSONB NOT NULL, revision BIGINT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS friendships (requester BIGINT NOT NULL REFERENCES players(id), recipient BIGINT NOT NULL REFERENCES players(id), accepted BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY(requester,recipient), CHECK(requester <> recipient));
CREATE TABLE IF NOT EXISTS gifts (id BIGSERIAL PRIMARY KEY, sender BIGINT NOT NULL REFERENCES players(id), recipient BIGINT NOT NULL REFERENCES players(id), kind TEXT NOT NULL CHECK(kind IN ('gold','gem','love')), amount INTEGER NOT NULL CHECK(amount > 0), claimed BOOLEAN NOT NULL DEFAULT FALSE);
CREATE TABLE IF NOT EXISTS requests (player_id BIGINT NOT NULL REFERENCES players(id), request_id TEXT NOT NULL, payload_hash TEXT NOT NULL, response JSONB NOT NULL, PRIMARY KEY(player_id,request_id));

CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique ON friendships (LEAST(requester, recipient), GREATEST(requester, recipient));
