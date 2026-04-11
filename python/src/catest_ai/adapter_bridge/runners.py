"""CLI runners for Claude Code, Codex, and Antigravity.

Each runner spawns a local subprocess and yields structured event dicts
that the bridge streams back to the frontend as SSE.

Uses subprocess.Popen + threading to avoid Windows asyncio subprocess
limitations (ProactorEventLoop NotImplementedError with uvicorn).

Event schema (all runners):
    {"event": "status",      "message": str}
    {"event": "text",        "content": str}
    {"event": "tool_use",    "tool": str, "input": str}
    {"event": "tool_result", "content": str}
    {"event": "result",      ...}              # final summary
    {"event": "output",      "content": str}   # generic line
    {"event": "error",       "message": str}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import queue
import shutil
import subprocess
import threading
from abc import ABC, abstractmethod
from typing import AsyncIterator

logger = logging.getLogger("adapter-bridge.runners")


def _reader_thread(pipe, q: queue.Queue) -> None:
    """Read lines from a pipe in a background thread, push to queue."""
    try:
        for raw_line in iter(pipe.readline, b""):
            q.put(raw_line)
    finally:
        q.put(None)  # sentinel
        pipe.close()


class BaseRunner(ABC):
    @abstractmethod
    async def run(
        self, prompt: str, *, cwd: str = ".", project: str = "default", model: str = ""
    ) -> AsyncIterator[dict]:
        yield {}  # pragma: no cover


# ── Claude Code ───────────────────────────────────────────────────────


class ClaudeCodeRunner(BaseRunner):
    """Invokes ``claude -p`` with ``--output-format stream-json``."""

    async def run(
        self, prompt: str, *, cwd: str = ".", project: str = "default", model: str = ""
    ) -> AsyncIterator[dict]:
        cmd = os.getenv("CLAUDE_CLI", "") or shutil.which("claude")
        if not cmd:
            yield {"event": "error", "message": "claude CLI not found in PATH"}
            return

        args = [cmd, "-p", prompt, "--output-format", "stream-json", "--verbose"]
        if model:
            args.extend(["--model", model])

        yield {"event": "status", "message": f"Launching Claude Code ({model or 'default'}) in {cwd}"}

        proc = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
        )

        q: queue.Queue = queue.Queue()
        t = threading.Thread(target=_reader_thread, args=(proc.stdout, q), daemon=True)
        t.start()

        try:
            while True:
                raw_line = await asyncio.to_thread(q.get)
                if raw_line is None:
                    break
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    parsed = _parse_claude_event(data)
                    if parsed:
                        yield parsed
                except json.JSONDecodeError:
                    yield {"event": "output", "content": line}

            proc.wait()

            if proc.returncode and proc.returncode != 0:
                stderr = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
                yield {
                    "event": "error",
                    "message": f"exit {proc.returncode}: {stderr[:500]}",
                }
        except asyncio.CancelledError:
            proc.kill()
            yield {"event": "cancelled", "message": "Claude Code execution cancelled"}
            raise


def _parse_claude_event(data: dict) -> dict | None:
    """Convert a ``stream-json`` line into our SSE event dict."""
    etype = data.get("type", "")

    if etype == "assistant":
        msg = data.get("message", {})
        for block in msg.get("content", []):
            btype = block.get("type", "")
            if btype == "text":
                return {"event": "text", "content": block.get("text", "")}
            if btype == "tool_use":
                return {
                    "event": "tool_use",
                    "tool": block.get("name", ""),
                    "input": json.dumps(
                        block.get("input", {}), ensure_ascii=False
                    )[:300],
                }
        return None

    if etype == "tool":
        content = data.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                str(c.get("content", c)) if isinstance(c, dict) else str(c)
                for c in content
            )
        return {"event": "tool_result", "content": str(content)[:1000]}

    if etype == "result":
        return {
            "event": "result",
            "subtype": data.get("subtype", ""),
            "cost_usd": data.get("cost_usd"),
            "duration_ms": data.get("duration_ms"),
            "num_turns": data.get("num_turns"),
        }

    if etype == "system":
        return {
            "event": "system",
            "subtype": data.get("subtype", ""),
            "message": str(data)[:300],
        }

    return {"event": "raw", "data": str(data)[:500]}


# ── Codex ─────────────────────────────────────────────────────────────


class CodexRunner(BaseRunner):
    """Invokes the OpenAI Codex CLI."""

    async def run(
        self, prompt: str, *, cwd: str = ".", project: str = "default", model: str = ""
    ) -> AsyncIterator[dict]:
        cmd = os.getenv("CODEX_CLI", "") or shutil.which("codex")
        if not cmd:
            yield {"event": "error", "message": "codex CLI not found in PATH"}
            return

        args = [cmd, "--approval-mode", "full-auto", "--quiet"]
        if model:
            args.extend(["--model", model])
        args.append(prompt)

        yield {"event": "status", "message": f"Launching Codex ({model or 'default'}) in {cwd}"}

        proc = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
        )

        q: queue.Queue = queue.Queue()
        t = threading.Thread(target=_reader_thread, args=(proc.stdout, q), daemon=True)
        t.start()

        try:
            while True:
                raw_line = await asyncio.to_thread(q.get)
                if raw_line is None:
                    break
                line = raw_line.decode("utf-8", errors="replace").strip()
                if line:
                    yield {"event": "output", "content": line}

            proc.wait()

            if proc.returncode and proc.returncode != 0:
                stderr = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
                yield {
                    "event": "error",
                    "message": f"exit {proc.returncode}: {stderr[:500]}",
                }
        except asyncio.CancelledError:
            proc.kill()
            yield {"event": "cancelled", "message": "Codex execution cancelled"}
            raise


# ── Antigravity ───────────────────────────────────────────────────────


class AntigravityRunner(BaseRunner):
    """Invokes the Antigravity CLI or falls back to its HTTP API."""

    async def run(
        self, prompt: str, *, cwd: str = ".", project: str = "default", model: str = ""
    ) -> AsyncIterator[dict]:
        cmd = os.getenv("ANTIGRAVITY_CLI", "") or shutil.which("antigravity")

        if cmd:
            yield {"event": "status", "message": f"Launching Antigravity in {cwd}"}
            async for ev in self._run_cli(cmd, prompt, cwd):
                yield ev
        else:
            api_url = os.getenv("ANTIGRAVITY_API_URL", "")
            if not api_url:
                yield {
                    "event": "error",
                    "message": "Neither antigravity CLI nor ANTIGRAVITY_API_URL configured",
                }
                return
            async for ev in self._run_api(api_url, prompt, project):
                yield ev

    async def _run_cli(
        self, cmd: str, prompt: str, cwd: str
    ) -> AsyncIterator[dict]:
        proc = subprocess.Popen(
            [cmd, prompt],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
        )

        q: queue.Queue = queue.Queue()
        t = threading.Thread(target=_reader_thread, args=(proc.stdout, q), daemon=True)
        t.start()

        try:
            while True:
                raw_line = await asyncio.to_thread(q.get)
                if raw_line is None:
                    break
                line = raw_line.decode("utf-8", errors="replace").strip()
                if line:
                    yield {"event": "output", "content": line}

            proc.wait()

            if proc.returncode and proc.returncode != 0:
                stderr = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
                yield {
                    "event": "error",
                    "message": f"exit {proc.returncode}: {stderr[:500]}",
                }
        except asyncio.CancelledError:
            proc.kill()
            raise

    async def _run_api(
        self, api_url: str, prompt: str, project: str
    ) -> AsyncIterator[dict]:
        import httpx

        yield {"event": "status", "message": "Calling Antigravity API\u2026"}
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{api_url}/missions",
                json={
                    "mission": {
                        "title": prompt[:80],
                        "description": prompt,
                        "project": project,
                    }
                },
                headers={
                    "Authorization": f"Bearer {os.getenv('ANTIGRAVITY_API_KEY', '')}",
                },
            )
            resp.raise_for_status()
            result = resp.json()
            yield {
                "event": "output",
                "content": json.dumps(result, ensure_ascii=False),
            }


# ── Factory ───────────────────────────────────────────────────────────

_RUNNERS: dict[str, type[BaseRunner]] = {
    "claude_code": ClaudeCodeRunner,
    "codex": CodexRunner,
    "antigravity": AntigravityRunner,
}


def create_runner(target: str) -> BaseRunner:
    cls = _RUNNERS.get(target)
    if cls is None:
        raise ValueError(
            f"Unknown target '{target}'. Available: {list(_RUNNERS.keys())}"
        )
    return cls()


# ── Dynamic model detection ──────────────────────────────────────────

async def detect_models() -> dict:
    """Detect available CLI tools and their models from local installation."""
    import asyncio

    result: dict[str, list[dict]] = {}

    # Claude Code: `claude --version` to check availability,
    # models come from the API and use aliases
    claude_cmd = os.getenv("CLAUDE_CLI", "") or shutil.which("claude")
    if claude_cmd:
        try:
            proc = await asyncio.to_thread(
                subprocess.run,
                [claude_cmd, "--version"],
                capture_output=True, text=True, timeout=10,
            )
            if proc.returncode == 0:
                version = proc.stdout.strip()
                result["claude_code"] = {
                    "available": True,
                    "version": version,
                    "models": [
                        {"id": "opus",   "label": "Opus"},
                        {"id": "sonnet", "label": "Sonnet"},
                        {"id": "haiku",  "label": "Haiku"},
                    ],
                }
        except Exception:
            pass

    # Codex: parse config.toml for default model, scan session history for used models
    codex_cmd = os.getenv("CODEX_CLI", "") or shutil.which("codex")
    if codex_cmd:
        try:
            proc = await asyncio.to_thread(
                subprocess.run,
                [codex_cmd, "--version"],
                capture_output=True, text=True, timeout=10,
            )
            if proc.returncode == 0:
                version = proc.stdout.strip()
                codex_models = _scan_codex_models()
                result["codex"] = {
                    "available": True,
                    "version": version,
                    "models": [{"id": m, "label": m} for m in codex_models],
                }
        except Exception:
            pass

    # Antigravity
    ag_cmd = os.getenv("ANTIGRAVITY_CLI", "") or shutil.which("antigravity")
    ag_api = os.getenv("ANTIGRAVITY_API_URL", "")
    if ag_cmd or ag_api:
        result["antigravity"] = {
            "available": True,
            "version": "api" if not ag_cmd else "cli",
            "models": [],
        }

    return result


def _scan_codex_models() -> list[str]:
    """Scan ~/.codex for config default model and session history models."""
    import glob
    import pathlib

    home = pathlib.Path.home() / ".codex"
    models: set[str] = set()

    # 1. Config default
    config_file = home / "config.toml"
    if config_file.exists():
        try:
            text = config_file.read_text(encoding="utf-8", errors="ignore")
            for line in text.splitlines():
                line = line.strip()
                if line.startswith("model") and "=" in line and not line.startswith("model_"):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        models.add(val)
        except Exception:
            pass

    # 2. Session history — scan all lines in recent sessions for model fields
    session_files = sorted(
        glob.glob(str(home / "sessions" / "**" / "*.jsonl"), recursive=True),
        key=os.path.getmtime,
        reverse=True,
    )[:100]  # last 100 sessions

    for f in session_files:
        try:
            with open(f, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    try:
                        d = json.loads(line)
                        p = d.get("payload", {})
                        if isinstance(p, dict):
                            m = p.get("model")
                            if m:
                                models.add(m)
                            # Check nested dicts (response_meta, etc.)
                            for v in p.values():
                                if isinstance(v, dict):
                                    m2 = v.get("model")
                                    if m2:
                                        models.add(m2)
                    except json.JSONDecodeError:
                        pass
        except Exception:
            pass

    # Sort: newest/highest version first
    return sorted(models, reverse=True)
