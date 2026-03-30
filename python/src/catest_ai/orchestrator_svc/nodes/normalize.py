"""Normalize node — clean and prepare raw user input."""

from __future__ import annotations

import re

from catest_ai.orchestrator_svc.state import OrchestratorState

MAX_INPUT_LENGTH = 8000


def normalize(state: OrchestratorState) -> dict:
    """Strip noise from raw input: collapse whitespace, truncate."""
    text = state["raw_input"].strip()
    # Collapse multiple whitespace / newlines
    text = re.sub(r"\s+", " ", text)
    # Truncate
    if len(text) > MAX_INPUT_LENGTH:
        text = text[:MAX_INPUT_LENGTH] + "..."
    return {"normalized_input": text}
