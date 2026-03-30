-- Dedicated database for Translation Memory (TM)
\c catest_tm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════
-- Translation Memory — stores verified source↔target segment pairs
-- Follows TMX 1.4b (Translation Memory eXchange) data model
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tm_banks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL UNIQUE,
    description     text,
    source_lang     text NOT NULL DEFAULT 'en',
    target_lang     text NOT NULL DEFAULT 'zh',
    created_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tm_entries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id         uuid NOT NULL REFERENCES tm_banks(id) ON DELETE CASCADE,
    source_text     text NOT NULL,
    target_text     text NOT NULL,
    context         text,                       -- file path, function name, etc.
    quality_score   real DEFAULT 1.0,           -- 0.0~1.0
    usage_count     int DEFAULT 1,
    created_by      uuid,
    updated_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tm_entries_bank ON tm_entries(bank_id);
CREATE INDEX IF NOT EXISTS idx_tm_entries_source ON tm_entries USING gin(to_tsvector('simple', source_text));
CREATE INDEX IF NOT EXISTS idx_tm_entries_target ON tm_entries USING gin(to_tsvector('simple', target_text));

-- ═══════════════════════════════════════════════════════════════════════
-- TM Access Control — bank-level permissions per user
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tm_bank_permissions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id         uuid NOT NULL REFERENCES tm_banks(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL,
    permission      text NOT NULL DEFAULT 'read',   -- 'read', 'write', 'admin'
    granted_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tm_bank_perm ON tm_bank_permissions(bank_id, user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- TM Import/Export History
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tm_import_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id         uuid NOT NULL REFERENCES tm_banks(id) ON DELETE CASCADE,
    file_name       text NOT NULL,
    format          text NOT NULL DEFAULT 'tmx',    -- 'tmx', 'tsv', 'csv'
    imported_count  int NOT NULL DEFAULT 0,
    skipped_count   int NOT NULL DEFAULT 0,
    imported_by     uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Seed data
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO tm_banks (name, description, source_lang, target_lang) VALUES
    ('default', 'Default translation memory bank', 'en', 'zh')
ON CONFLICT DO NOTHING;

INSERT INTO tm_entries (bank_id, source_text, target_text, context, quality_score, usage_count)
SELECT b.id, v.source, v.target, v.context, v.score, v.usage
FROM tm_banks b
CROSS JOIN (VALUES
    ('handleRequest processes incoming HTTP calls', 'handleRequest 处理传入的 HTTP 调用', 'src/server/handler.ts', 1.0, 5),
    ('validateInput checks user-supplied data', '验证输入检查用户提供的数据', 'src/utils/validator.ts', 0.95, 3),
    ('initializeApp bootstraps the application', '初始化应用引导应用程序', 'src/index.ts', 0.9, 2),
    ('parseConfig reads environment variables', '解析配置读取环境变量', 'src/config/parser.ts', 0.85, 4),
    ('connectDatabase establishes a connection pool', '连接数据库建立连接池', 'src/db/connect.ts', 1.0, 6)
) AS v(source, target, context, score, usage)
WHERE b.name = 'default'
ON CONFLICT DO NOTHING;
