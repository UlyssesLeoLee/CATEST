-- Initial DDL for codecat_parser
\c catest_parser;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE segment_kind AS ENUM ('function','method','class','interface','enum','config_block','sql_block','statement_group','file_header','other');

CREATE TABLE IF NOT EXISTS segments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     uuid NOT NULL, -- references ingestion.snapshots
  kind            segment_kind NOT NULL DEFAULT 'other',
  symbol_name     text,
  code_text       text NOT NULL,
  normalized_hash text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
