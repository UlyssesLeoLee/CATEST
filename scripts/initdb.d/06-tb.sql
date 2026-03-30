-- Dedicated database for Terminology Base (TB)
\c catest_tb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════
-- Terminology Base — domain-specific terms and naming conventions
-- Follows TBX (TermBase eXchange) ISO 30042 data model
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tb_banks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL UNIQUE,
    description     text,
    source_lang     text NOT NULL DEFAULT 'en',
    target_lang     text NOT NULL DEFAULT 'zh',
    created_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tb_entries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id         uuid NOT NULL REFERENCES tb_banks(id) ON DELETE CASCADE,
    source_term     text NOT NULL,
    target_term     text NOT NULL,
    definition      text,                       -- Term definition/explanation
    domain          text,                       -- e.g. 'security', 'auth', 'api'
    pos             text,                       -- Part of speech: noun, verb, adj, etc.
    forbidden       boolean DEFAULT false,      -- Mark as "do not use"
    note            text,                       -- Additional notes
    created_by      uuid,
    updated_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tb_entries_bank ON tb_entries(bank_id);
CREATE INDEX IF NOT EXISTS idx_tb_entries_source ON tb_entries USING gin(to_tsvector('simple', source_term));
CREATE INDEX IF NOT EXISTS idx_tb_entries_target ON tb_entries USING gin(to_tsvector('simple', target_term));
CREATE INDEX IF NOT EXISTS idx_tb_entries_domain ON tb_entries(domain);

-- ═══════════════════════════════════════════════════════════════════════
-- TB Access Control — bank-level permissions per user
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tb_bank_permissions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id         uuid NOT NULL REFERENCES tb_banks(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL,
    permission      text NOT NULL DEFAULT 'read',   -- 'read', 'write', 'admin'
    granted_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_bank_perm ON tb_bank_permissions(bank_id, user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- TB Import/Export History
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tb_import_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id         uuid NOT NULL REFERENCES tb_banks(id) ON DELETE CASCADE,
    file_name       text NOT NULL,
    format          text NOT NULL DEFAULT 'csv',    -- 'tbx', 'csv', 'tsv'
    imported_count  int NOT NULL DEFAULT 0,
    skipped_count   int NOT NULL DEFAULT 0,
    imported_by     uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Seed data
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO tb_banks (name, description, source_lang, target_lang) VALUES
    ('default', 'Default terminology base', 'en', 'zh')
ON CONFLICT DO NOTHING;

INSERT INTO tb_entries (bank_id, source_term, target_term, definition, domain, forbidden)
SELECT b.id, v.source, v.target, v.def, v.dom, v.forb
FROM tb_banks b
CROSS JOIN (VALUES
    ('validateInput', '验证输入', 'Checks and sanitises user-supplied data before processing', 'security', false),
    ('handleRequest', '处理请求', 'Entry point for incoming HTTP request handling', 'api', false),
    ('eval()', '禁止使用 eval', 'Dynamic code evaluation — forbidden for security reasons', 'security', true),
    ('middleware', '中间件', 'Interceptor in the request/response pipeline', 'api', false),
    ('connection pool', '连接池', 'Reusable set of database connections', 'database', false)
) AS v(source, target, def, dom, forb)
WHERE b.name = 'default'
ON CONFLICT DO NOTHING;
