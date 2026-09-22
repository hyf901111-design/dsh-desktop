CREATE TABLE IF NOT EXISTS integration_oauth_flows (
  state_hash TEXT PRIMARY KEY,
  ticket_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','exchanging','ready','consumed','cancelled','failed')),
  expires_at INTEGER NOT NULL,
  account_label TEXT,
  ciphertext TEXT
);
CREATE INDEX IF NOT EXISTS integration_flow_owner ON integration_oauth_flows(user_id,connection_id);
CREATE TABLE IF NOT EXISTS integration_tokens (
  user_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  refresh_owner TEXT,
  refresh_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,connection_id)
);
