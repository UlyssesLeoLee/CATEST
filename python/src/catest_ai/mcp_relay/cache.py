"""In-memory TTL cache for task context.

The relay is stateless by design — this cache is a short-lived buffer
so remote AI agents don't have to wait for a round-trip to local CATEST
on every tool call. Entries expire after TTL_SECONDS.
"""

from __future__ import annotations

import time
from threading import Lock
from typing import Any

TTL_SECONDS = 3600  # 1 hour default


class ContextCache:
    """Thread-safe in-memory cache with TTL eviction."""

    def __init__(self, ttl: int = TTL_SECONDS) -> None:
        self._store: dict[str, tuple[float, dict[str, Any]]] = {}
        self._lock = Lock()
        self._ttl = ttl

    def put(self, trace_id: str, data: dict[str, Any]) -> None:
        with self._lock:
            self._store[trace_id] = (time.time(), data)

    def get(self, trace_id: str) -> dict[str, Any] | None:
        with self._lock:
            entry = self._store.get(trace_id)
            if entry is None:
                return None
            ts, data = entry
            if time.time() - ts > self._ttl:
                del self._store[trace_id]
                return None
            return data

    def get_all_active(self, project: str | None = None) -> list[dict[str, Any]]:
        """Return all non-expired entries, optionally filtered by project."""
        now = time.time()
        results = []
        with self._lock:
            expired = []
            for tid, (ts, data) in self._store.items():
                if now - ts > self._ttl:
                    expired.append(tid)
                    continue
                if project and data.get("project") != project:
                    continue
                results.append({"trace_id": tid, **data})
            for tid in expired:
                del self._store[tid]
        return results

    def put_result(self, trace_id: str, result: dict[str, Any]) -> None:
        """Attach an adapter result to an existing cache entry."""
        with self._lock:
            entry = self._store.get(trace_id)
            if entry:
                ts, data = entry
                data["_result"] = result
                self._store[trace_id] = (ts, data)
            else:
                # Store result even if original context expired
                self._store[trace_id] = (time.time(), {"_result": result})

    def get_result(self, trace_id: str) -> dict[str, Any] | None:
        with self._lock:
            entry = self._store.get(trace_id)
            if entry is None:
                return None
            _, data = entry
            return data.get("_result")

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


context_cache = ContextCache()
