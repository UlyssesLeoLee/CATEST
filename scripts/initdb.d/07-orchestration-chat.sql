-- =============================================================================
-- catest_orchestration — Structured chat & delivery tables
-- Purpose: typed storage for all orchestration UI interactions, with columns
--          pre-wired for future Qdrant vector storage and Memgraph graph links.
-- =============================================================================

\connect catest_orchestration

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE dispatch_target_t AS ENUM ('claude_code', 'codex', 'antigravity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE session_status_t AS ENUM ('running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE message_role_t AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    -- Content categories — used for routing to the right downstream store
    CREATE TYPE message_kind_t AS ENUM (
        'prompt',        -- user input text
        'response',      -- assistant text reply
        'status',        -- progress / status update
        'tool_use',      -- tool invocation (name + input)
        'tool_result',   -- tool response content
        'error',         -- error event
        'ide_paste'      -- keyboard-automation delivery confirmation
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── chat_sessions ─────────────────────────────────────────────────────────────
-- One row per trace_id.  Groups all messages from a single user request.

CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id        TEXT        NOT NULL UNIQUE,
    project         TEXT        NOT NULL DEFAULT 'default',
    dispatch_target dispatch_target_t NOT NULL,
    model           TEXT        NOT NULL DEFAULT '',
    user_id         TEXT,                         -- nullable; filled when auth available
    status          session_status_t NOT NULL DEFAULT 'running',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,

    -- Vector DB foundation: point to the Qdrant entry for this session summary
    qdrant_point_id UUID,
    embedding_model TEXT,        -- e.g. 'intfloat/multilingual-e5-small'
    embedding_dim   SMALLINT,    -- e.g. 384

    -- Graph DB foundation: node ID in Memgraph representing this session
    graph_node_id   TEXT,

    -- Extracted metadata for downstream enrichment
    title           TEXT,        -- short summary of the request (filled by orchestrator)
    tags            TEXT[]       -- keyword tags extracted from the prompt
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_trace ON chat_sessions (trace_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions (project);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_target ON chat_sessions (dispatch_target);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_started ON chat_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions (user_id) WHERE user_id IS NOT NULL;

-- ── chat_messages ─────────────────────────────────────────────────────────────
-- Individual SSE events saved by kind.  Each kind maps to a downstream table/store.
--
-- Future routing:
--   prompt / response  → Qdrant (semantic search) + Memgraph (entity edges)
--   tool_use / tool_result → catest_workspace (code-level correlation)
--   ide_paste          → ide_deliveries (below)
--   error              → alerting / dashboard

CREATE TABLE IF NOT EXISTS chat_messages (
    message_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID        NOT NULL REFERENCES chat_sessions (session_id) ON DELETE CASCADE,
    trace_id        TEXT        NOT NULL,
    seq             SMALLINT    NOT NULL DEFAULT 0,  -- order within session
    role            message_role_t NOT NULL,
    kind            message_kind_t NOT NULL,
    content         TEXT        NOT NULL DEFAULT '',

    -- Structured fields for tool events (null for prompt/response)
    tool_name       TEXT,
    tool_input      TEXT,        -- JSON string, truncated to 2 KB

    -- Vector DB foundation
    qdrant_point_id UUID,
    embedding_model TEXT,
    embedding_dim   SMALLINT,

    -- Graph DB foundation: Memgraph node for this message
    graph_node_id   TEXT,

    -- Entity extraction placeholder (populated later by NER pipeline)
    -- Shape: [{"type":"file","name":"src/server.ts"},{"type":"fn","name":"handleAuth"}]
    entities        JSONB        DEFAULT '[]'::jsonb,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_seq_positive CHECK (seq >= 0)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, seq);
CREATE INDEX IF NOT EXISTS idx_chat_messages_trace ON chat_messages (trace_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_kind ON chat_messages (kind);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages (created_at DESC);
-- Full-text search on content (for future keyword search without vector DB)
CREATE INDEX IF NOT EXISTS idx_chat_messages_fts ON chat_messages
    USING GIN (to_tsvector('simple', content));

-- ── ide_deliveries ────────────────────────────────────────────────────────────
-- Records every keyboard-automation paste attempt.
-- Separate table because delivery ≠ AI response; success/failure is independent.

CREATE TABLE IF NOT EXISTS ide_deliveries (
    delivery_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID        NOT NULL REFERENCES chat_sessions (session_id) ON DELETE CASCADE,
    trace_id        TEXT        NOT NULL,
    target          dispatch_target_t NOT NULL,
    prompt          TEXT        NOT NULL,
    ps1_stdout      TEXT,        -- raw PowerShell output for debugging
    success         BOOLEAN     NOT NULL DEFAULT FALSE,
    error_message   TEXT,
    delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ide_deliveries_session ON ide_deliveries (session_id);
CREATE INDEX IF NOT EXISTS idx_ide_deliveries_trace ON ide_deliveries (trace_id);
CREATE INDEX IF NOT EXISTS idx_ide_deliveries_target ON ide_deliveries (target);

-- ── chat_tool_invocations ─────────────────────────────────────────────────────
-- Normalised extract of tool_use / tool_result pairs from CLI responses.
-- Foundation for linking AI tool calls to code segments in catest_workspace.

CREATE TABLE IF NOT EXISTS chat_tool_invocations (
    invocation_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID        NOT NULL REFERENCES chat_sessions (session_id) ON DELETE CASCADE,
    trace_id        TEXT        NOT NULL,
    tool_name       TEXT        NOT NULL,
    tool_input      JSONB,
    tool_result     TEXT,        -- truncated to 4 KB
    -- Graph DB foundation: edge from session node → code segment node
    graph_edge_id   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_tools_session ON chat_tool_invocations (session_id);
CREATE INDEX IF NOT EXISTS idx_chat_tools_name ON chat_tool_invocations (tool_name);
