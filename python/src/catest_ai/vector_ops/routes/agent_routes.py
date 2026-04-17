"""Agent API routes — streaming LangGraph endpoints for code analysis.

Endpoints:
    POST /agent/code-analyze/start      — kick off analysis, runs until interrupt
    POST /agent/code-analyze/resume     — resume after human annotation review
    GET  /agent/code-analyze/state/{thread_id}  — poll current graph state
    GET  /agent/code-analyze/stream/{thread_id} — SSE event stream
"""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from catest_ai.vector_ops.graphs.code_analysis.graph import code_analysis_graph

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agent"])

# Fields too large / not useful to send over the wire
_REDACT_FIELDS = frozenset({"raw_cypher", "code_body", "code", "code_chunk"})

# Node display labels for SSE (used by frontend STEP_LABELS mapping)
_NODE_LABELS = {
    "detect_language":    "Detecting language",
    "enrich_context":     "Extracting code structure",
    "generate_cypher":    "Generating Cypher",
    "validate_cypher":    "Validating structure",
    "semantic_validate":  "Checking semantic accuracy",
    "fix_cypher":         "Repairing errors",
    "execute_cypher":     "Writing to Memgraph",
    "post_import_suggest": "Generating insights",
}


# ── Request / Response models ─────────────────────────────────────────────────

class StartRequest(BaseModel):
    code: str = Field(..., min_length=1)
    language: str = Field(default="auto")
    prefix: str = Field(default="Code")
    file_name: str = Field(default="input", description="Source filename for graph metadata")


class ResumeRequest(BaseModel):
    thread_id: str
    approved_annotation: str = Field(
        ...,
        description="The (possibly user-edited) /* Cypher annotation */ block",
    )


class GraphStateResponse(BaseModel):
    thread_id: str
    interrupted: bool          # True when waiting for human review
    next_nodes: list[str]      # which nodes will run on resume
    state: dict                # full state (large fields redacted)


class AnalysisInsights(BaseModel):
    """Convenience model — surfaced after resume completes."""
    code_summary: str
    suggested_queries: list[str]
    nodes_upserted: int
    edges_upserted: int
    execution_errors: list[str]
    semantic_score: float
    semantic_feedback: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


def _safe_state(raw: dict) -> dict:
    """Strip oversized fields before returning state to client."""
    return {k: v for k, v in raw.items() if k not in _REDACT_FIELDS}


def _snapshot_to_response(thread_id: str, snapshot) -> dict:
    return {
        "thread_id":  thread_id,
        "interrupted": bool(snapshot.next),
        "next_nodes":  list(snapshot.next),
        "state":       _safe_state(dict(snapshot.values)),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/agent/code-analyze/start", response_model=GraphStateResponse)
async def start_code_analysis(req: StartRequest):
    """Start a new code analysis run.

    Runs the pipeline:
        detect_language → enrich_context → generate_cypher
        → validate_cypher → semantic_validate
        → [INTERRUPT before execute_cypher]

    Returns thread_id + state including:
        annotation_block    — ready for human review/edit
        semantic_score      — LLM confidence that graph is accurate
        semantic_feedback   — critique text
        complexity_hint     — "small" / "medium" / "large"
        import_list, class_list, function_list — structural inventory
    """
    thread_id = str(uuid.uuid4())
    config    = _make_config(thread_id)

    initial_state = {
        "code":        req.code,
        "language":    req.language,
        "prefix":      req.prefix,
        "file_name":   req.file_name,
        "retry_count": 0,
    }

    try:
        await code_analysis_graph.ainvoke(initial_state, config)
    except Exception as exc:
        logger.error("Graph run failed for thread %s: %s", thread_id, exc)
        raise

    snapshot = code_analysis_graph.get_state(config)
    return _snapshot_to_response(thread_id, snapshot)


@router.post("/agent/code-analyze/resume", response_model=GraphStateResponse)
async def resume_code_analysis(req: ResumeRequest):
    """Resume graph after human annotation review.

    Injects the approved annotation, then runs:
        execute_cypher → post_import_suggest → END

    Final state includes:
        code_summary         — AI description of what was analyzed
        suggested_queries    — 4 Cypher exploration queries
        nodes_upserted / edges_upserted
        execution_errors
    """
    config = _make_config(req.thread_id)

    code_analysis_graph.update_state(
        config,
        {"approved_annotation": req.approved_annotation},
    )

    try:
        await code_analysis_graph.ainvoke(None, config)
    except Exception as exc:
        logger.error("Graph resume failed for thread %s: %s", req.thread_id, exc)
        raise

    snapshot = code_analysis_graph.get_state(config)
    return _snapshot_to_response(req.thread_id, snapshot)


@router.get("/agent/code-analyze/state/{thread_id}", response_model=GraphStateResponse)
async def get_graph_state(thread_id: str):
    """Poll current graph state without resuming."""
    config   = _make_config(thread_id)
    snapshot = code_analysis_graph.get_state(config)
    return _snapshot_to_response(thread_id, snapshot)


@router.get("/agent/code-analyze/insights/{thread_id}", response_model=AnalysisInsights)
async def get_insights(thread_id: str):
    """Convenience endpoint — returns only the post-import insight fields.

    Call this after resume completes to get summary + suggested queries
    without the full state blob.
    """
    config   = _make_config(thread_id)
    snapshot = code_analysis_graph.get_state(config)
    s = dict(snapshot.values)
    return {
        "code_summary":      s.get("code_summary", ""),
        "suggested_queries": s.get("suggested_queries", []),
        "nodes_upserted":    s.get("nodes_upserted", s.get("node_count", 0)),
        "edges_upserted":    s.get("edges_upserted", s.get("edge_count", 0)),
        "execution_errors":  s.get("execution_errors", []),
        "semantic_score":    s.get("semantic_score", 0.0),
        "semantic_feedback": s.get("semantic_feedback", ""),
    }


@router.get("/agent/code-analyze/stream/{thread_id}")
async def stream_graph(thread_id: str):
    """SSE stream of graph node execution events.

    Event format (text/event-stream):
        data: {
            "step":   "<node_name>",
            "label":  "<human readable label>",
            "status": "running" | "done" | "error",
            "output": { ... }   // safe subset of node output
        }

    NOTE: If the graph is already interrupted (waiting for human review before
    execute_cypher), this endpoint returns immediately without resuming execution.
    The frontend synthesises step display from the POST /start response state.
    """
    config = _make_config(thread_id)

    # Guard: do NOT resume an interrupted graph via SSE.
    # astream_events(None, config) would resume from the interrupt point,
    # accidentally running execute_cypher without the approved annotation.
    snapshot = code_analysis_graph.get_state(config)
    if snapshot.next:
        async def _empty():
            return
            yield  # make it an async generator
        return StreamingResponse(
            _empty(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    async def generate():
        try:
            async for event in code_analysis_graph.astream_events(
                None, config, version="v2"
            ):
                kind = event["event"]
                name = event.get("name", "")

                if name in ("", "LangGraph") or "__" in name:
                    continue

                label = _NODE_LABELS.get(name, name)

                if kind == "on_chain_start":
                    payload = json.dumps({
                        "step":   name,
                        "label":  label,
                        "status": "running",
                    })
                    yield f"data: {payload}\n\n"

                elif kind == "on_chain_end":
                    output = event.get("data", {}).get("output") or {}
                    safe = {k: v for k, v in output.items() if k not in _REDACT_FIELDS}
                    payload = json.dumps({
                        "step":   name,
                        "label":  label,
                        "status": "done",
                        "output": safe,
                    })
                    yield f"data: {payload}\n\n"

        except Exception as exc:
            err = json.dumps({"step": "error", "label": "Error", "status": "error", "message": str(exc)})
            yield f"data: {err}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
