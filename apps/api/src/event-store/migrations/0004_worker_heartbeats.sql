CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_id TEXT PRIMARY KEY,
    beat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
