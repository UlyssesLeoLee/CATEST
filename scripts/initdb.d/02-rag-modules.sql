-- Modular RAG Components DDL
\c catest_intelligence;

-- 1. Memory Base (MB) - The "Translation Memory" for Code Review
-- Stores historical code snippets and their successfully applied fixes or comments
CREATE TABLE IF NOT EXISTS memory_base (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
    code_hash     text NOT NULL, -- SHA256 of normalized code segment
    source_code   text NOT NULL, -- The original problematic code 
    fixed_code    text,          -- The applied fix if any
    review_comment text NOT NULL, -- The expert/AI feedback that solved it
    severity      text,          -- info, warning, danger
    category      text,          -- performance, security, design_pattern
    usage_count   integer DEFAULT 1,
    last_applied  timestamptz DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_base_hash ON memory_base (code_hash);

-- 2. Termbase (TB) - Architectural & Naming Consistency
-- Adapted from translation glossary to code naming/pattern enforcement
CREATE TABLE IF NOT EXISTS term_base (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
    category      text NOT NULL, -- 'naming_convention', 'pattern', 'dependency'
    source_pattern text NOT NULL, -- Forbidden pattern or legacy name
    target_pattern text,          -- Preferred pattern or new name
    is_forbidden  boolean DEFAULT false,
    explanation   text,          -- Architectural rationale
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_term_base_source ON term_base (lower(source_term));

-- 2. Rulebase - Custom linting and architectural rules for AI review
CREATE TABLE IF NOT EXISTS rule_base (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
    rule_type     text NOT NULL, -- e.g. 'architecture', 'security', 'style'
    condition_desc text NOT NULL, -- Human readable condition
    condition_ast jsonb,         -- Structured pattern if applicable
    message       text NOT NULL, -- What the AI should say
    severity      text DEFAULT 'warning',
    is_enabled    boolean DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- 3. Document Metadata - Tracking external docs/ADRs for RAG
CREATE TABLE IF NOT EXISTS document_metadata (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
    title         text NOT NULL,
    url           text,
    doc_type      text NOT NULL, -- e.g. 'ADR', 'Wiki', 'README'
    qdrant_point_id uuid,        -- Link to the vector store entry
    last_synced   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);
