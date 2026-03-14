-- Modular RAG Components DDL
\c catest_gateway;

-- 1. Termbase (TB) - Glossary and naming conventions
CREATE TABLE IF NOT EXISTS term_base (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
    category      text NOT NULL, -- e.g. 'domain', 'ui', 'infrastructure'
    source_term   text NOT NULL, -- The original or forbidden term
    target_term   text,          -- The preferred term
    is_forbidden  boolean DEFAULT false,
    explanation   text,
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
