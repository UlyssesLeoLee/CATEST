"""LangSmith tracing bridge — maps orchestration events to LangSmith runs."""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

from langsmith import Client

logger = logging.getLogger(__name__)

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = Client(
            api_key=os.getenv("CATEST_AI_LANGSMITH_API_KEY", ""),
        )
    return _client


def record_event(
    trace_id: str,
    event_type: str,
    source_service: str,
    status: str,
    payload: dict[str, Any],
    timestamp: datetime | None = None,
) -> None:
    """Record an orchestration event as a LangSmith run.

    Each trace_id maps to a parent run. Events within the same trace
    are child runs, creating a tree view in LangSmith.
    """
    try:
        client = get_client()
        project = os.getenv("CATEST_AI_LANGSMITH_PROJECT", "catest-orchestration")

        # Use trace_id as the parent run name for grouping
        run_name = f"{source_service}/{event_type.split('.')[-1]}"

        client.create_run(
            name=run_name,
            run_type="chain",
            inputs={"event_type": event_type, "source_service": source_service},
            outputs={"status": status, "payload_keys": list(payload.keys())},
            extra={
                "trace_id": trace_id,
                "status": status,
                "metadata": {"event_type": event_type},
            },
            project_name=project,
            tags=[trace_id[:8], source_service, status],
        )
    except Exception:
        logger.exception("Failed to record event in LangSmith")
