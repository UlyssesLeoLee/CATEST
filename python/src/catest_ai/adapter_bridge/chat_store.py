"""chat_store — Async PostgreSQL writer for structured chat data.

Writes to catest_orchestration DB tables:
  • chat_sessions        — one row per trace_id
  • chat_messages        — typed SSE events (prompt / response / tool_use / error …)
  • ide_deliveries       — keyboard-automation delivery records
  • chat_tool_invocations — normalised tool call/result pairs

All operations are fire-and-forget (non-fatal on failure) so bridge streaming
is never blocked by DB unavailability.

Vector DB (Qdrant) and graph DB (Memgraph) columns are pre-wired as NULL stubs;
a future enrichment worker populates them via UPDATE after embedding/entity extraction.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger("adapter-bridge.chat_store")

# Host-accessible postgres URL (bridge runs on host, not in K8s).
# NodePort 31281 exposes postgres externally.  Set CHAT_DB_URL to override.
_DEFAULT_DB_URL = os.getenv(
    "CHAT_DB_URL",
    "postgresql://catest:password@localhost:35432/catest_orchestration",
)

_pool = None  # asyncpg.Pool — lazily created


async def _get_pool():
    global _pool
    if _pool is not None:
        return _pool
    try:
        import asyncpg  # type: ignore
        _pool = await asyncpg.create_pool(_DEFAULT_DB_URL, min_size=1, max_size=4, timeout=5)
        logger.info("chat_store: connected to catest_orchestration")
        await _ensure_schema(_pool)
    except Exception as exc:
        logger.warning("chat_store: DB unavailable (%s) — running without persistence", exc)
        _pool = None
    return _pool


async def _ensure_schema(pool) -> None:
    """Create tables if they don't exist yet (idempotent)."""
    ddl = """
    DO $$ BEGIN CREATE TYPE dispatch_target_t AS ENUM ('claude_code','codex','antigravity');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE session_status_t AS ENUM ('running','completed','failed','cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE message_role_t AS ENUM ('user','assistant','system');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE message_kind_t AS ENUM (
        'prompt','response','status','tool_use','tool_result','error','ide_paste');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trace_id        TEXT NOT NULL UNIQUE,
        project         TEXT NOT NULL DEFAULT 'default',
        dispatch_target dispatch_target_t NOT NULL,
        model           TEXT NOT NULL DEFAULT '',
        user_id         TEXT,
        status          session_status_t NOT NULL DEFAULT 'running',
        started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at     TIMESTAMPTZ,
        qdrant_point_id UUID,
        embedding_model TEXT,
        embedding_dim   SMALLINT,
        graph_node_id   TEXT,
        title           TEXT,
        tags            TEXT[]
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
        message_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id      UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        trace_id        TEXT NOT NULL,
        seq             SMALLINT NOT NULL DEFAULT 0,
        role            message_role_t NOT NULL,
        kind            message_kind_t NOT NULL,
        content         TEXT NOT NULL DEFAULT '',
        tool_name       TEXT,
        tool_input      TEXT,
        qdrant_point_id UUID,
        embedding_model TEXT,
        embedding_dim   SMALLINT,
        graph_node_id   TEXT,
        entities        JSONB DEFAULT '[]'::jsonb,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, seq);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_trace  ON chat_messages(trace_id);

    CREATE TABLE IF NOT EXISTS ide_deliveries (
        delivery_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id    UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        trace_id      TEXT NOT NULL,
        target        dispatch_target_t NOT NULL,
        prompt        TEXT NOT NULL,
        ps1_stdout    TEXT,
        success       BOOLEAN NOT NULL DEFAULT FALSE,
        error_message TEXT,
        delivered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ide_deliveries_trace ON ide_deliveries(trace_id);

    CREATE TABLE IF NOT EXISTS chat_tool_invocations (
        invocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id    UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        trace_id      TEXT NOT NULL,
        tool_name     TEXT NOT NULL,
        tool_input    JSONB,
        tool_result   TEXT,
        graph_edge_id TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_chat_tools_session ON chat_tool_invocations(session_id);
    """
    async with pool.acquire() as conn:
        await conn.execute(ddl)


# ── Public API ────────────────────────────────────────────────────────────────


async def open_session(
    trace_id: str,
    target: str,
    model: str,
    project: str,
    user_id: str | None = None,
) -> None:
    """Insert a new chat_session row when /execute is called."""
    pool = await _get_pool()
    if pool is None:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO chat_sessions (trace_id, dispatch_target, model, project, user_id)
                   VALUES ($1, $2::dispatch_target_t, $3, $4, $5)
                   ON CONFLICT (trace_id) DO NOTHING""",
                trace_id, target, model, project, user_id,
            )
    except Exception as exc:
        logger.debug("chat_store.open_session failed: %s", exc)


async def close_session(trace_id: str, status: str = "completed") -> None:
    """Update session status + finished_at when the run ends."""
    pool = await _get_pool()
    if pool is None:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE chat_sessions
                   SET status = $2::session_status_t, finished_at = NOW()
                   WHERE trace_id = $1""",
                trace_id, status,
            )
    except Exception as exc:
        logger.debug("chat_store.close_session failed: %s", exc)


async def store_prompt(trace_id: str, prompt: str) -> None:
    """Store the user's prompt as a chat_message of kind='prompt'."""
    await _insert_message(trace_id, role="user", kind="prompt", content=prompt)


async def store_event(trace_id: str, seq: int, event: dict) -> None:
    """Map an SSE event dict to the right message kind and persist it."""
    etype = event.get("event", "")

    if etype == "text":
        content = event.get("content", "")
        if content:
            await _insert_message(trace_id, "assistant", "response", content, seq=seq)

    elif etype == "status":
        msg = event.get("message", "")
        if msg:
            await _insert_message(trace_id, "assistant", "status", msg, seq=seq)

    elif etype == "tool_use":
        tool_name = event.get("tool", "")
        tool_input = event.get("input", "")
        await _insert_message(
            trace_id, "assistant", "tool_use",
            content=f"{tool_name}: {tool_input}"[:2000],
            tool_name=tool_name,
            tool_input=tool_input[:2000] if tool_input else None,
            seq=seq,
        )
        # Also normalise into chat_tool_invocations for workspace linkage
        await _insert_tool_invocation(trace_id, tool_name, tool_input)

    elif etype == "tool_result":
        content = event.get("content", "")[:4000]
        await _insert_message(trace_id, "assistant", "tool_result", content, seq=seq)
        # Update last invocation with result
        await _update_last_tool_result(trace_id, content)

    elif etype == "error":
        msg = event.get("message", "")
        if msg:
            await _insert_message(trace_id, "assistant", "error", msg, seq=seq)


async def store_ide_delivery(
    trace_id: str,
    target: str,
    prompt: str,
    success: bool,
    ps1_stdout: str | None = None,
    error_message: str | None = None,
) -> None:
    """Record an IDE keyboard-automation delivery attempt."""
    pool = await _get_pool()
    if pool is None:
        return
    try:
        async with pool.acquire() as conn:
            session_id = await conn.fetchval(
                "SELECT session_id FROM chat_sessions WHERE trace_id = $1", trace_id
            )
            if session_id is None:
                return
            await conn.execute(
                """INSERT INTO ide_deliveries
                   (session_id, trace_id, target, prompt, ps1_stdout, success, error_message)
                   VALUES ($1, $2, $3::dispatch_target_t, $4, $5, $6, $7)""",
                session_id, trace_id, target, prompt, ps1_stdout, success, error_message,
            )
            # Also log as message kind='ide_paste'
            await conn.execute(
                """INSERT INTO chat_messages (session_id, trace_id, role, kind, content)
                   VALUES ($1, $2, 'assistant', 'ide_paste', $3)""",
                session_id, trace_id,
                f"{'OK' if success else 'FAIL'}: pasted to {target}" + (f" — {error_message}" if error_message else ""),
            )
    except Exception as exc:
        logger.debug("chat_store.store_ide_delivery failed: %s", exc)


# ── Internals ─────────────────────────────────────────────────────────────────


async def _insert_message(
    trace_id: str,
    role: str,
    kind: str,
    content: str,
    tool_name: str | None = None,
    tool_input: str | None = None,
    seq: int = 0,
) -> None:
    pool = await _get_pool()
    if pool is None:
        return
    try:
        async with pool.acquire() as conn:
            session_id = await conn.fetchval(
                "SELECT session_id FROM chat_sessions WHERE trace_id = $1", trace_id
            )
            if session_id is None:
                return
            await conn.execute(
                """INSERT INTO chat_messages
                   (session_id, trace_id, seq, role, kind, content, tool_name, tool_input)
                   VALUES ($1, $2, $3, $4::message_role_t, $5::message_kind_t, $6, $7, $8)""",
                session_id, trace_id, seq,
                role, kind, content, tool_name, tool_input,
            )
    except Exception as exc:
        logger.debug("chat_store._insert_message(%s) failed: %s", kind, exc)


async def _insert_tool_invocation(
    trace_id: str, tool_name: str, tool_input_raw: str
) -> None:
    pool = await _get_pool()
    if pool is None:
        return
    try:
        try:
            tool_input_json = json.loads(tool_input_raw) if tool_input_raw else None
        except Exception:
            tool_input_json = {"raw": tool_input_raw[:2000]}
        async with pool.acquire() as conn:
            session_id = await conn.fetchval(
                "SELECT session_id FROM chat_sessions WHERE trace_id = $1", trace_id
            )
            if session_id is None:
                return
            await conn.execute(
                """INSERT INTO chat_tool_invocations (session_id, trace_id, tool_name, tool_input)
                   VALUES ($1, $2, $3, $4)""",
                session_id, trace_id, tool_name,
                json.dumps(tool_input_json) if tool_input_json else None,
            )
    except Exception as exc:
        logger.debug("chat_store._insert_tool_invocation failed: %s", exc)


async def _update_last_tool_result(trace_id: str, result: str) -> None:
    pool = await _get_pool()
    if pool is None:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE chat_tool_invocations
                   SET tool_result = $2
                   WHERE invocation_id = (
                       SELECT invocation_id FROM chat_tool_invocations
                       WHERE trace_id = $1 AND tool_result IS NULL
                       ORDER BY created_at DESC LIMIT 1
                   )""",
                trace_id, result[:4000],
            )
    except Exception as exc:
        logger.debug("chat_store._update_last_tool_result failed: %s", exc)
