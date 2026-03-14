-- Initial DDL for catest_gateway
\c catest_gateway;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_status AS ENUM ('active', 'disabled', 'pending_verification');
CREATE TYPE user_role   AS ENUM ('admin', 'user', 'viewer');
CREATE TYPE project_status AS ENUM ('active','archived');
CREATE TYPE license_plan AS ENUM ('free', 'pro', 'enterprise');

CREATE TABLE IF NOT EXISTS tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Core user identity. One user can belong to one tenant.
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  email         text NOT NULL UNIQUE,
  display_name  text,
  password_hash text NOT NULL,
  role          user_role   NOT NULL DEFAULT 'user',
  status        user_status NOT NULL DEFAULT 'active',
  last_login    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email));

-- Persist active JWT sessions to enable revocation
CREATE TABLE IF NOT EXISTS user_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent    text,
  ip_address    text,
  revoked       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id) WHERE revoked = false;

-- License / plan association per user
CREATE TABLE IF NOT EXISTS licenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan          license_plan NOT NULL DEFAULT 'free',
  is_active     boolean NOT NULL DEFAULT true,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,  -- NULL means perpetual for current plan
  notes         text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_license_active_user ON licenses (user_id) WHERE is_active = true;

-- Long-lived machine-to-machine API tokens
CREATE TABLE IF NOT EXISTS api_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  token_prefix  text NOT NULL,   -- First 8 chars of the raw token (for display)
  token_hash    text NOT NULL,   -- SHA-256(raw token) — the raw token is NEVER stored
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz      -- NULL means no expiry
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens (user_id);

CREATE TABLE IF NOT EXISTS projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  status        project_status NOT NULL DEFAULT 'active',
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_tenant_name ON projects (tenant_id, name);

CREATE TABLE IF NOT EXISTS repositories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider      text NOT NULL DEFAULT 'git',
  git_url       text NOT NULL,
  default_branch text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
