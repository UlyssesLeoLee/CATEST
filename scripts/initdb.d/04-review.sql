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

-- Review Task Assignments (Mainstream CAT-style collaboration)
CREATE TABLE IF NOT EXISTS review_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES review_tasks(id) ON DELETE CASCADE,
    assignee_id UUID NOT NULL, -- Logical reference to user_id in hub
    role TEXT DEFAULT 'primary_reviewer', -- 'primary_reviewer', 'security_auditor', 'architect'
    status TEXT DEFAULT 'assigned', -- 'assigned', 'in_progress', 'completed'
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Real-time collaborative comments (Threaded)
CREATE TABLE IF NOT EXISTS review_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES review_tasks(id) ON DELETE CASCADE,
    segment_hash TEXT, -- Specific code block hash
    author_id UUID NOT NULL,
    content TEXT NOT NULL,
    parent_comment_id UUID REFERENCES review_comments(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════
-- Translation Memory (TM) — stores verified source↔comment pairs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS translation_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tm_name TEXT NOT NULL DEFAULT 'default',       -- Memory bank name
    source_text TEXT NOT NULL,
    target_text TEXT NOT NULL,
    context TEXT,                                   -- Optional: file path, function name, etc.
    quality_score REAL DEFAULT 1.0,                -- 0.0~1.0
    usage_count INT DEFAULT 1,
    created_by UUID,                               -- user who confirmed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tm_source ON translation_memory USING gin(to_tsvector('simple', source_text));
CREATE INDEX IF NOT EXISTS idx_tm_name ON translation_memory(tm_name);

-- ═══════════════════════════════════════════════════════════════════════
-- Terminology Base (TB) — domain-specific terms and conventions
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS terminology_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tb_name TEXT NOT NULL DEFAULT 'default',        -- Termbase name
    source_term TEXT NOT NULL,
    target_term TEXT NOT NULL,
    definition TEXT,                                -- Term definition/explanation
    domain TEXT,                                    -- e.g. 'security', 'auth', 'api'
    forbidden BOOLEAN DEFAULT false,               -- Mark as "do not use"
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tb_source ON terminology_base USING gin(to_tsvector('simple', source_term));
CREATE INDEX IF NOT EXISTS idx_tb_name ON terminology_base(tb_name);
