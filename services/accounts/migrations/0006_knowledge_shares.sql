CREATE TABLE knowledge_shares (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('upload', 'generated')),
  size INTEGER NOT NULL CHECK(size >= 0),
  object_key TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX knowledge_shares_catalog ON knowledge_shares(revoked_at, updated_at DESC, id);
CREATE INDEX knowledge_shares_owner ON knowledge_shares(owner_id, revoked_at);
CREATE TABLE knowledge_share_uploads (
  object_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
