CREATE TABLE ai_quota_pool (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  roster_version INTEGER NOT NULL DEFAULT 0,
  monthly_limit_units INTEGER NOT NULL CHECK (monthly_limit_units BETWEEN 0 AND 9007199254740991),
  weekly_limit_units INTEGER NOT NULL CHECK (weekly_limit_units BETWEEN 0 AND 9007199254740991),
  five_hour_limit_units INTEGER NOT NULL CHECK (five_hour_limit_units BETWEEN 0 AND 9007199254740991),
  first_start INTEGER NOT NULL,
  first_end INTEGER NOT NULL CHECK (first_end > first_start)
) STRICT;

/* Micro-AFP. The first planning cycle is 11 Nov 08:57 to 12 Dec 00:00 Beijing time. */
INSERT INTO ai_quota_pool (
  id, monthly_limit_units, weekly_limit_units, five_hour_limit_units, first_start, first_end
) VALUES (1, 900000000000, 350000000000, 100000000000,
  unixepoch('2026-11-11 00:57:00'), unixepoch('2026-12-11 16:00:00'));

CREATE TRIGGER ai_quota_revision_guard
BEFORE UPDATE OF revision ON ai_quota_pool
WHEN NEW.revision <> OLD.revision + 1
BEGIN
  SELECT RAISE(ABORT, 'AI_QUOTA_STALE');
END;

CREATE TRIGGER ai_quota_pool_changed
AFTER UPDATE OF monthly_limit_units, weekly_limit_units, five_hour_limit_units, first_start, first_end ON ai_quota_pool
BEGIN
  UPDATE ai_quota_pool SET revision = revision + 1, roster_version = roster_version + 1 WHERE id = 1;
END;

CREATE TABLE ai_quota_user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  five_hour_limit_units INTEGER CHECK (five_hour_limit_units BETWEEN 0 AND 9007199254740991),
  weekly_limit_units INTEGER CHECK (weekly_limit_units BETWEEN 0 AND 9007199254740991),
  paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
  version INTEGER NOT NULL CHECK (version > 0)
) STRICT;

CREATE TRIGGER ai_quota_user_settings_guard
BEFORE UPDATE ON ai_quota_user_settings
WHEN NEW.version <> OLD.version + 1
BEGIN
  SELECT RAISE(ABORT, 'AI_QUOTA_SETTINGS_STALE');
END;

CREATE TRIGGER ai_quota_user_joined AFTER INSERT ON users WHEN NEW.disabled = 0
BEGIN
  UPDATE ai_quota_pool SET revision = revision + 1, roster_version = roster_version + 1 WHERE id = 1;
END;

CREATE TRIGGER ai_quota_user_status AFTER UPDATE OF disabled ON users WHEN OLD.disabled <> NEW.disabled
BEGIN
  UPDATE ai_quota_pool SET revision = revision + 1, roster_version = roster_version + 1 WHERE id = 1;
END;

CREATE TRIGGER ai_quota_user_left AFTER DELETE ON users WHEN OLD.disabled = 0
BEGIN
  UPDATE ai_quota_pool SET revision = revision + 1, roster_version = roster_version + 1 WHERE id = 1;
END;

CREATE TRIGGER ai_quota_settings_added AFTER INSERT ON ai_quota_user_settings
BEGIN
  UPDATE ai_quota_pool SET revision = revision + 1, roster_version = roster_version + 1 WHERE id = 1;
END;

CREATE TRIGGER ai_quota_settings_updated AFTER UPDATE ON ai_quota_user_settings
BEGIN
  UPDATE ai_quota_pool SET revision = revision + 1, roster_version = roster_version + 1 WHERE id = 1;
END;

CREATE TABLE ai_quota_windows (
  kind TEXT PRIMARY KEY CHECK (kind IN ('week', 'fiveHour')),
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL CHECK (end_at > start_at),
  limit_units INTEGER NOT NULL CHECK (limit_units >= 0),
  generation INTEGER NOT NULL,
  roster_version INTEGER NOT NULL
) STRICT;

CREATE TABLE ai_quota_grants (
  kind TEXT NOT NULL REFERENCES ai_quota_windows(kind),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  units INTEGER NOT NULL CHECK (units > 0),
  PRIMARY KEY (kind, user_id)
) STRICT;

CREATE TABLE ai_quota_requests (
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  step INTEGER NOT NULL CHECK (step >= 0),
  admitted_at INTEGER NOT NULL,
  month_at INTEGER NOT NULL,
  week_at INTEGER NOT NULL,
  five_hour_at INTEGER NOT NULL,
  week_generation INTEGER NOT NULL,
  five_hour_generation INTEGER NOT NULL,
  held_units INTEGER NOT NULL CHECK (held_units > 0),
  billed_units INTEGER CHECK (billed_units BETWEEN 0 AND held_units),
  charged_month_at INTEGER,
  settled_at INTEGER,
  CHECK ((billed_units IS NULL AND charged_month_at IS NULL AND settled_at IS NULL)
    OR (billed_units IS NOT NULL AND charged_month_at IS NOT NULL AND settled_at IS NOT NULL)),
  PRIMARY KEY (user_id, request_id, step)
) STRICT;

CREATE INDEX ai_quota_charged_month ON ai_quota_requests(charged_month_at);
CREATE INDEX ai_quota_unsettled ON ai_quota_requests(held_units) WHERE billed_units IS NULL;
CREATE INDEX ai_quota_week_usage ON ai_quota_requests(week_at, user_id);
CREATE INDEX ai_quota_five_hour_usage ON ai_quota_requests(five_hour_at, user_id);
