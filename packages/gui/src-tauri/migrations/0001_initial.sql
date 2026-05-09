CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT,
  icon TEXT,
  last_opened_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_profiles (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  base_url TEXT,
  username TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ui_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  opencode_session_id TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thread_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  opencode_session_id TEXT,
  title TEXT,
  status TEXT NOT NULL,
  plan_json TEXT,
  summary_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thread_activity (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_offsets (
  scope TEXT PRIMARY KEY,
  last_event_id TEXT,
  updated_at INTEGER NOT NULL
);
