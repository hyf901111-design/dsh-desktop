CREATE TABLE invites (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, max_uses INTEGER NOT NULL CHECK(max_uses > 0), uses INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0);
CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, invite_hash TEXT NOT NULL REFERENCES invites(hash), created_at INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER redeem_invite BEFORE INSERT ON users BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM invites WHERE hash=NEW.invite_hash AND disabled=0 AND uses<max_uses AND expires_at>unixepoch()) THEN RAISE(ABORT,'INVALID_INVITE') END;
 UPDATE invites SET uses=uses+1 WHERE hash=NEW.invite_hash;
END;
CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE usage_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), capability TEXT NOT NULL, started_at INTEGER NOT NULL, status INTEGER, completed_at INTEGER);
CREATE INDEX usage_user_time ON usage_events(user_id,started_at);
