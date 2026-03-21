-- Double play events: one row per detected double play
CREATE TABLE double_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  dj TEXT,
  show_name TEXT,
  classification TEXT DEFAULT 'legitimate',
  first_play_timestamp TEXT NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 2,
  plays_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_dp_timestamp ON double_plays(first_play_timestamp DESC);

-- Scan cursor and stats: always exactly one row
CREATE TABLE scan_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  total_scan_time_ms INTEGER DEFAULT 0,
  total_api_requests INTEGER DEFAULT 0,
  last_scan_duration INTEGER DEFAULT 0,
  last_scan_requests INTEGER DEFAULT 0,
  last_scan_time TEXT,
  scan_direction TEXT DEFAULT 'forward'
);

INSERT INTO scan_state (id, start_time, end_time)
VALUES (1, datetime('now', '-7 days'), datetime('now'));
