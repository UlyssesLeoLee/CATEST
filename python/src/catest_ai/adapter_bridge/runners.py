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

DEFAULT_CWD = os.getenv("BRIDGE_CWD", os.getcwd())


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
        # model="ide"  →  paste into Claude Code's chat window
        if model == "ide":
            yield {"event": "status", "message": "Focusing Claude Code IDE…"}
            result = await asyncio.to_thread(_run_ide_ps, "claude_code", prompt)
            if result["ok"]:
                yield {"event": "status", "message": "Prompt pasted into Claude Code ✓"}
            else:
                yield {"event": "error", "message": result["err"]}
            return

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
        # model="ide"  →  paste into VS Code Copilot/Codex chat
        if model == "ide":
            yield {"event": "status", "message": "Focusing VS Code (Codex IDE)…"}
            result = await asyncio.to_thread(_run_ide_ps, "codex", prompt)
            if result["ok"]:
                yield {"event": "status", "message": "Prompt pasted into VS Code ✓"}
            else:
                yield {"event": "error", "message": result["err"]}
            return

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


# ── IDE Keyboard Automation ───────────────────────────────────────────

ANTIGRAVITY_INBOX_URL = os.getenv(
    "ANTIGRAVITY_INBOX_URL",
    "http://localhost:33000/api/antigravity/inbox",
)

# Unified IDE keyboard-automation script.
# Used when model="ide" on any target, or as the default delivery for Antigravity.
#
# Per-target:
#   claude_code  — finds "claude" process (Claude Code desktop/CLI), pastes
#   codex        — finds VS Code, opens Copilot chat (Ctrl+Alt+I), pastes
#   antigravity  — finds Antigravity, opens Gemini chat (Ctrl+I), pastes
#
# Text is placed in the chat INPUT but NOT submitted — user presses Enter.

_IDE_PS1 = r"""
param([string]$Target, [string]$Prompt)

Set-Clipboard -Value $Prompt

# Win32 helpers for reliable foreground-window stealing from background processes.
# AttachThreadInput lets us call SetForegroundWindow even without the foreground lock.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinHelper {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint  GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool  AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] public static extern bool  BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] public static extern bool  SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool  ShowWindow(IntPtr h, int cmd);
    public static bool ForceForeground(IntPtr hwnd) {
        IntPtr fg   = GetForegroundWindow();
        uint fgPid2 = 0;
        uint fgTid  = GetWindowThreadProcessId(fg, out fgPid2);
        uint myTid  = GetCurrentThreadId();
        bool att    = (fgTid != myTid) && AttachThreadInput(myTid, fgTid, true);
        ShowWindow(hwnd, 9);
        BringWindowToTop(hwnd);
        bool ok = SetForegroundWindow(hwnd);
        if (att) AttachThreadInput(myTid, fgTid, false);
        return ok;
    }
}
"@

function Activate-IDE {
    param([string[]]$Names, [string]$Label)
    foreach ($n in $Names) {
        $procs = Get-Process -Name $n -ErrorAction SilentlyContinue |
                 Where-Object { $_.MainWindowHandle -ne 0 }
        foreach ($p in $procs) {
            $hwnd = [IntPtr]$p.MainWindowHandle
            $ok   = [WinHelper]::ForceForeground($hwnd)
            Write-Output "ForceForeground $Label PID=$($p.Id) hwnd=$hwnd result=$ok"
            if ($ok) { return $hwnd }
        }
    }
    Write-Error "$Label window not found or could not be activated"
    exit 1
}

$wsh = New-Object -ComObject WScript.Shell

switch ($Target) {
    "claude_code" {
        Activate-IDE -Names @("claude","WindowsTerminal","powershell","pwsh") -Label "Claude Code"
        Start-Sleep -Milliseconds 600
        $wsh.SendKeys("^v")
    }
    "codex" {
        Activate-IDE -Names @("Code","code") -Label "VS Code"
        Start-Sleep -Milliseconds 600
        $wsh.SendKeys("^%i")    # Ctrl+Alt+I  ->  Copilot Chat
        Start-Sleep -Milliseconds 1000
        $wsh.SendKeys("^a")
        Start-Sleep -Milliseconds 150
        $wsh.SendKeys("^v")
    }
    "antigravity" {
        Activate-IDE -Names @("Antigravity") -Label "Antigravity"
        Start-Sleep -Milliseconds 600
        $wsh.SendKeys("^i")     # Ctrl+I  ->  antigravity.openChatView
        Start-Sleep -Milliseconds 1000
        $wsh.SendKeys("^a")
        Start-Sleep -Milliseconds 150
        $wsh.SendKeys("^v")
    }
    default {
        Write-Error "Unknown target: $Target"
        exit 1
    }
}

Start-Sleep -Milliseconds 200
Write-Output "ok"
"""

# Keep old name as alias (AntigravityRunner still references it)
_ANTIGRAVITY_PS1 = _IDE_PS1


def _run_ide_ps(target: str, prompt: str) -> dict:
    """Run the unified IDE automation PS1 synchronously. Returns {ok, err}."""
    import tempfile, os as _os

    ps = shutil.which("powershell") or shutil.which("pwsh")
    if not ps:
        return {"ok": False, "err": "PowerShell not found"}

    script_path = ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".ps1", delete=False, encoding="utf-8"
        ) as f:
            f.write(_IDE_PS1)
            script_path = f.name

        proc = subprocess.run(
            [ps, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
             "-File", script_path, "-Target", target, "-Prompt", prompt],
            capture_output=True, text=True, timeout=15,
        )
        if proc.returncode == 0:
            return {"ok": True, "stdout": proc.stdout.strip()}
        err = (proc.stderr or proc.stdout or "unknown error").strip()[:500]
        return {"ok": False, "err": err}
    except Exception as exc:
        return {"ok": False, "err": str(exc)}
    finally:
        if script_path:
            try:
                _os.unlink(script_path)
            except Exception:
                pass


class AntigravityRunner(BaseRunner):
    """Delivers a prompt to Antigravity IDE chat via keyboard automation."""

    async def run(
        self, prompt: str, *, cwd: str = ".", project: str = "default", model: str = ""
    ) -> AsyncIterator[dict]:
        yield {"event": "status", "message": "Focusing Antigravity IDE…"}
        result = await asyncio.to_thread(_run_ide_ps, "antigravity", prompt)
        if result["ok"]:
            yield {"event": "status", "message": "Prompt pasted into Antigravity ✓"}
        else:
            yield {"event": "error", "message": result["err"]}



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
                        {"id": "ide",    "label": "IDE Chat"},
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
                    "models": [{"id": "ide", "label": "IDE Chat"}] + [{"id": m, "label": m} for m in codex_models],
                }
        except Exception:
            pass

    # Antigravity – available if either CLI or API URL is configured
    ag_cmd = os.getenv("ANTIGRAVITY_CLI", "") or shutil.which("antigravity")
    ag_api = os.getenv("ANTIGRAVITY_API_URL", "")
    ag_model = os.getenv("ANTIGRAVITY_MODEL", "")
    # Antigravity always available (keyboard automation doesn't need CLI/API)
    if True:
        models_list: list[dict] = [{"id": "ide", "label": "IDE Chat"}]
        if ag_model:
            models_list.append({"id": ag_model, "label": ag_model})
        elif ag_api:
            models_list.append({"id": "gpt-4o-mini", "label": "GPT-4o Mini"})
            models_list.append({"id": "gpt-4o", "label": "GPT-4o"})
        result["antigravity"] = {
            "available": True,
            "version": "keyboard",
            "models": models_list,
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
