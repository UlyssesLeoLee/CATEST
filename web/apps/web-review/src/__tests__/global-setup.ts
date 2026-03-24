/**
 * Vitest global setup — ensures catest_review schema and seed data exist
 * before integration tests run. Mirrors scripts/initdb.d/04-review.sql
 * so tests pass even when the Docker volume was initialised before
 * the TM / TB tables were added.
 */
import { Pool } from "pg";

function getReviewDbUrl(): string {
  if (process.env.REVIEW_DATABASE_URL) return process.env.REVIEW_DATABASE_URL;
  const gatewayUrl = process.env.DATABASE_URL;
  if (gatewayUrl) return gatewayUrl.replace(/\/catest_gateway$/, "/catest_review");
  const port = process.env.POSTGRES_PORT || process.env.PORT_POSTGRES || "34321";
  const host = process.env.POSTGRES_HOST || "localhost";
  const user = process.env.POSTGRES_USER || "catest";
  const pass = process.env.POSTGRES_PASSWORD || "password";
  return `postgres://${user}:${pass}@${host}:${port}/catest_review`;
}

export async function setup() {
  const pool = new Pool({
    connectionString: getReviewDbUrl(),
    max: 2,
    connectionTimeoutMillis: 10000,
    ssl: false,
  });

  try {
    // ── DDL (idempotent) ───────────────────────────────────────────────
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_tasks (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        snapshot_id     uuid NOT NULL,
        status          text NOT NULL DEFAULT 'created',
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS findings (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        review_task_id  uuid NOT NULL REFERENCES review_tasks(id) ON DELETE CASCADE,
        segment_id      uuid NOT NULL,
        severity        text NOT NULL,
        message         text NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES review_tasks(id) ON DELETE CASCADE,
        assignee_id UUID NOT NULL,
        role TEXT DEFAULT 'primary_reviewer',
        status TEXT DEFAULT 'assigned',
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES review_tasks(id) ON DELETE CASCADE,
        segment_hash TEXT,
        author_id UUID NOT NULL,
        content TEXT NOT NULL,
        parent_comment_id UUID REFERENCES review_comments(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS translation_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tm_name TEXT NOT NULL DEFAULT 'default',
        source_text TEXT NOT NULL,
        target_text TEXT NOT NULL,
        context TEXT,
        quality_score REAL DEFAULT 1.0,
        usage_count INT DEFAULT 1,
        created_by UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tm_source
        ON translation_memory USING gin(to_tsvector('simple', source_text))
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tm_name ON translation_memory(tm_name)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS terminology_base (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tb_name TEXT NOT NULL DEFAULT 'default',
        source_term TEXT NOT NULL,
        target_term TEXT NOT NULL,
        definition TEXT,
        domain TEXT,
        forbidden BOOLEAN DEFAULT false,
        created_by UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tb_source
        ON terminology_base USING gin(to_tsvector('simple', source_term))
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tb_name ON terminology_base(tb_name)
    `);

    // ── Seed data (skip if already present) ────────────────────────────
    const tmCount = await pool.query(
      `SELECT COUNT(*) FROM translation_memory WHERE tm_name = 'default'`
    );
    if (Number(tmCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO translation_memory (tm_name, source_text, target_text, context, quality_score, usage_count) VALUES
          ('default', 'handleRequest processes incoming HTTP calls', 'handleRequest 处理传入的 HTTP 调用', 'src/server/handler.ts', 1.0, 5),
          ('default', 'validateInput checks user-supplied data', '验证输入检查用户提供的数据', 'src/utils/validator.ts', 0.95, 3),
          ('default', 'initializeApp bootstraps the application', '初始化应用引导应用程序', 'src/index.ts', 0.9, 2),
          ('default', 'parseConfig reads environment variables', '解析配置读取环境变量', 'src/config/parser.ts', 0.85, 4),
          ('default', 'connectDatabase establishes a connection pool', '连接数据库建立连接池', 'src/db/connect.ts', 1.0, 6)
      `);
    }

    const tbCount = await pool.query(
      `SELECT COUNT(*) FROM terminology_base WHERE tb_name = 'default'`
    );
    if (Number(tbCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO terminology_base (tb_name, source_term, target_term, definition, domain, forbidden) VALUES
          ('default', 'validateInput', '验证输入', 'Checks and sanitises user-supplied data before processing', 'security', false),
          ('default', 'handleRequest', '处理请求', 'Entry point for incoming HTTP request handling', 'api', false),
          ('default', 'eval()', '禁止使用 eval', 'Dynamic code evaluation — forbidden for security reasons', 'security', true),
          ('default', 'middleware', '中间件', 'Interceptor in the request/response pipeline', 'api', false),
          ('default', 'connection pool', '连接池', 'Reusable set of database connections', 'database', false)
      `);
    }

    console.log("[global-setup] catest_review schema + seed data ready");
  } finally {
    await pool.end();
  }
}
