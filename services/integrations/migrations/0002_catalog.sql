-- Operator-managed public entries. There is intentionally no HTTP write API.
CREATE TABLE IF NOT EXISTS integration_catalog_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('plugin','app','tool','skill')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
  entry_json TEXT NOT NULL CHECK(json_valid(entry_json) AND length(CAST(entry_json AS BLOB))<=262144),
  CHECK(json_extract(entry_json,'$.id')=id AND json_extract(entry_json,'$.kind')=kind)
);
CREATE INDEX IF NOT EXISTS integration_catalog_published ON integration_catalog_entries(status,kind,id);
CREATE TABLE IF NOT EXISTS integration_catalog_revision (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  revision INTEGER NOT NULL
);
INSERT OR IGNORE INTO integration_catalog_revision(singleton,revision) VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS integration_catalog_insert AFTER INSERT ON integration_catalog_entries
BEGIN UPDATE integration_catalog_revision SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER IF NOT EXISTS integration_catalog_update AFTER UPDATE ON integration_catalog_entries
BEGIN UPDATE integration_catalog_revision SET revision=revision+1 WHERE singleton=1; END;
CREATE TRIGGER IF NOT EXISTS integration_catalog_delete AFTER DELETE ON integration_catalog_entries
BEGIN UPDATE integration_catalog_revision SET revision=revision+1 WHERE singleton=1; END;
