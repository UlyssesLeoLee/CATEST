"""Embed node — generate vector embedding from structured content."""

from __future__ import annotations

from catest_ai.common.embedding import embed_text
from catest_ai.orchestrator_svc.state import OrchestratorState


async def embed(state: OrchestratorState) -> dict:
    """Generate embedding from summary + task descriptions."""
    task_texts = " ".join(t.get("description", "") if isinstance(t, dict) else t.description for t in state["tasks"])
    text = f"{state['summary']} {task_texts}".strip()
    vector = await embed_text(text)
    return {"embedding": vector}
