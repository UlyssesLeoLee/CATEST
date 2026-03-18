-- Initial DDL for codecat_ingestion
\c catest_ingestion;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE snapshot_status AS ENUM ('pending','running','failed','ready','archived');

CREATE TABLE IF NOT EXISTS snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL, -- references gateway.repositories
  commit_sha    text NOT NULL,
  status        snapshot_status NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

CREATE TABLE IF NOT EXISTS files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id   uuid NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  path          text NOT NULL,
  language      text NOT NULL,
  size_bytes    bigint NOT NULL DEFAULT 0,
  sha256        text NOT NULL,
  content_text  text NOT NULL,
  is_binary     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for ON CONFLICT (snapshot_id, path)
CREATE UNIQUE INDEX IF NOT EXISTS ux_files_snapshot_path ON files (snapshot_id, path);
