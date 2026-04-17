"""AI-powered code structure analysis — converts code to Cypher and imports into Memgraph.

Flow:
1. User submits source code + language hint
2. AI (OpenAI-compatible API via CATEST_AI_* env vars) analyzes the code
3. AI returns Cypher CREATE/MERGE statements describing the structure
4. Backend executes Cypher against Memgraph
5. Returns the created nodes/edges for frontend visualization
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from catest_ai.common.config import settings
from catest_ai.vector_ops.routes.graph_ops import _get_driver

logger = logging.getLogger(__name__)

router = APIRouter(tags=["code-analysis"])

# ── Request / Response models ──


class CodeAnalysisRequest(BaseModel):
    """Submit code for AI-powered structure analysis."""

    code: str = Field(..., min_length=1, description="Source code to analyze")
    language: str = Field(default="auto", description="Language hint (auto-detect if 'auto')")
    label_prefix: str = Field(
        default="Code",
        description="Prefix for Memgraph node labels, e.g. 'Code' → :Code_Class, :Code_Function",
    )


class CypherStatement(BaseModel):
    """A single Cypher statement extracted from AI output."""

    cypher: str
    description: str = ""


class AnalysisResult(BaseModel):
    """Result of code structure analysis."""

    statements: list[CypherStatement]
    node_count: int = 0
    edge_count: int = 0
    raw_cypher: str = ""
    errors: list[str] = Field(default_factory=list)


# ── System prompt for the AI ──

SYSTEM_PROMPT = """\
You are a code structure analyzer. Given source code, output ONLY valid Cypher \
statements that describe the code's structural relationships.

Rules:
- Use MERGE (not CREATE) so re-analysis is idempotent.
- Node labels use the given prefix. Common labels:
  {prefix}_Module, {prefix}_Class, {prefix}_Function, {prefix}_Method, \
  {prefix}_Variable, {prefix}_Interface, {prefix}_Enum, {prefix}_Import
- Relationship types: CONTAINS, CALLS, IMPORTS, EXTENDS, IMPLEMENTS, \
  USES, RETURNS, ACCEPTS_PARAM, DECORATES
- Every node MUST have a `name` property (the identifier) and a `kind` property \
  (e.g. "class", "function", "method", "variable").
- Add `language`, `file` (use "input" if unknown), `line_start` properties where possible.
- Output ONLY Cypher statements separated by semicolons. No markdown, no explanation.
- Each statement on its own line, ending with a semicolon.

Example output for a Python file:
MERGE (m:{prefix}_Module {{name: "utils", kind: "module", language: "python"}});
MERGE (f:{prefix}_Function {{name: "parse_config", kind: "function", language: "python", line_start: 5}});
MERGE (m)-[:CONTAINS]->(f);
"""


def _build_prompt(code: str, language: str, label_prefix: str) -> list[dict[str, str]]:
    """Build the chat messages for the AI."""
    system = SYSTEM_PROMPT.replace("{prefix}", label_prefix)
    user_msg = f"Language: {language}\n\n```\n{code}\n```"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_msg},
    ]


def _parse_cypher_statements(raw: str) -> list[CypherStatement]:
    """Extract individual Cypher statements from AI output."""
    # Strip markdown code fences if present
    raw = re.sub(r"```(?:cypher)?\s*", "", raw)
    raw = raw.replace("```", "")

    statements: list[CypherStatement] = []
    # Split on semicolons, keeping each statement
    for line in raw.split(";"):
        line = line.strip()
        if not line:
            continue
        # Skip lines that are pure comments
        if line.startswith("//") and "\n" not in line:
            continue
        statements.append(CypherStatement(cypher=line + ";"))
    return statements


async def _call_ai(messages: list[dict[str, str]]) -> str:
    """Call the OpenAI-compatible AI API."""
    import httpx

    if not settings.api_key:
        raise HTTPException(status_code=500, detail="CATEST_AI_API_KEY not configured")

    # Build the base URL — ensure it ends with /chat/completions
    base = settings.base_url.rstrip("/")
    if not base.endswith("/chat/completions"):
        if base.endswith("/v1"):
            url = base + "/chat/completions"
        else:
            url = base + "/v1/chat/completions"
    else:
        url = base

    payload = {
        "model": settings.model,
        "messages": messages,
        "temperature": 0.1,  # low temperature for structured output
        "max_tokens": 4096,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {settings.api_key}",
                "Content-Type": "application/json",
            },
        )
        if resp.status_code != 200:
            logger.error("AI API error %d: %s", resp.status_code, resp.text[:500])
            raise HTTPException(
                status_code=502,
                detail=f"AI API returned {resp.status_code}: {resp.text[:200]}",
            )
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _execute_cypher_batch(statements: list[CypherStatement]) -> tuple[int, int, list[str]]:
    """Execute Cypher statements against Memgraph and return (nodes_created, rels_created, errors)."""
    driver = await _get_driver()
    total_nodes = 0
    total_rels = 0
    errors: list[str] = []

    try:
        async with driver.session() as session:
            for stmt in statements:
                try:
                    result = await session.run(stmt.cypher)
                    summary = await result.consume()
                    counters = summary.counters
                    total_nodes += counters.nodes_created
                    total_rels += counters.relationships_created
                except Exception as e:
                    err_msg = f"Cypher error: {e} | Statement: {stmt.cypher[:120]}"
                    logger.warning(err_msg)
                    errors.append(err_msg)
    finally:
        await driver.close()

    return total_nodes, total_rels, errors


# ── Endpoints ──


@router.post("/code/analyze", response_model=AnalysisResult)
async def analyze_code(req: CodeAnalysisRequest):
    """Analyze code structure with AI → generate Cypher → import into Memgraph."""
    # 1. Call AI to get Cypher
    messages = _build_prompt(req.code, req.language, req.label_prefix)
    raw_cypher = await _call_ai(messages)

    # 2. Parse statements
    statements = _parse_cypher_statements(raw_cypher)
    if not statements:
        return AnalysisResult(
            statements=[],
            raw_cypher=raw_cypher,
            errors=["AI returned no valid Cypher statements"],
        )

    # 3. Execute in Memgraph
    node_count, edge_count, errors = await _execute_cypher_batch(statements)

    return AnalysisResult(
        statements=statements,
        node_count=node_count,
        edge_count=edge_count,
        raw_cypher=raw_cypher,
        errors=errors,
    )


@router.post("/code/preview", response_model=AnalysisResult)
async def preview_code_analysis(req: CodeAnalysisRequest):
    """Preview only — AI generates Cypher but does NOT execute it."""
    messages = _build_prompt(req.code, req.language, req.label_prefix)
    raw_cypher = await _call_ai(messages)
    statements = _parse_cypher_statements(raw_cypher)

    return AnalysisResult(
        statements=statements,
        raw_cypher=raw_cypher,
        errors=[] if statements else ["AI returned no valid Cypher statements"],
    )


# ── Chat endpoint ──────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """Free-form Q&A with optional graph context."""
    question: str = Field(..., min_length=1)
    context: str = Field(default="", description="Optional context (selected node, graph state, etc.)")


class ChatResponse(BaseModel):
    answer: str


CHAT_SYSTEM_PROMPT = """\
You are an AI assistant embedded in CATEST, a knowledge-base and code-graph tool.
The user may provide context about a selected graph node or code structure.
Answer concisely and helpfully. You may suggest Cypher queries when relevant.
"""


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """General-purpose Q&A — optionally grounded in graph node context."""
    messages: list[dict[str, str]] = [
        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
    ]
    if req.context.strip():
        messages.append({
            "role": "user",
            "content": f"Context:\n{req.context}\n\nQuestion: {req.question}",
        })
    else:
        messages.append({"role": "user", "content": req.question})

    answer = await _call_ai(messages)
    return ChatResponse(answer=answer)


# ── Execute raw Cypher (no AI step) ───────────────────────────────────────────

class ExecuteCypherRequest(BaseModel):
    """Execute a list of raw Cypher statements directly — used when importing from annotation."""
    statements: list[str]


class ExecuteCypherResponse(BaseModel):
    node_count: int
    edge_count: int
    errors: list[str] = []


@router.post("/code/execute-cypher", response_model=ExecuteCypherResponse)
async def execute_cypher(req: ExecuteCypherRequest):
    """Execute raw Cypher statements without AI analysis step."""
    stmts = [CypherStatement(cypher=s.strip()) for s in req.statements if s.strip()]
    if not stmts:
        return ExecuteCypherResponse(node_count=0, edge_count=0)
    node_count, edge_count, errors = await _execute_cypher_batch(stmts)
    return ExecuteCypherResponse(node_count=node_count, edge_count=edge_count, errors=errors)
