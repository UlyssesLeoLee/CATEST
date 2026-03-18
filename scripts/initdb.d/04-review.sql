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
