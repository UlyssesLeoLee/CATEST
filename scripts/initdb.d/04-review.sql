-- Initial DDL for codecat_review
\c catest_review;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Review domains (findings, tasks)
CREATE TABLE IF NOT EXISTS review_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     uuid NOT NULL, -- references ingestion.snapshots
  status          text NOT NULL DEFAULT 'created',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS findings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_task_id  uuid NOT NULL REFERENCES review_tasks(id) ON DELETE CASCADE,
  segment_id      uuid NOT NULL, -- references parser.segments
  severity        text NOT NULL,
  message         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
