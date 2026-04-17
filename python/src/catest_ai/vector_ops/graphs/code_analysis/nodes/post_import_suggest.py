"""post_import_suggest node — AI-generated value after successful import.

Runs after execute_cypher. Asks the LLM to produce:
  1. code_summary     — 2-3 sentence natural language description of what was analyzed
  2. suggested_queries — 4 ready-to-run Cypher queries for exploring the imported graph

These surface directly in the frontend "Import" step result panel so the user
immediately gets actionable graph exploration entry points.
"""

from __future__ import annotations

import json
import logging
import re

from langsmith import traceable

from catest_ai.common.llm import get_llm_nim

logger = logging.getLogger(__name__)

_SYSTEM = """\
You are a code intelligence assistant. Given information about source code that was \
analyzed and imported into a graph database, produce:
1. A concise 2-3 sentence SUMMARY of what the code does and its main components.
2. Four CYPHER queries (for Memgraph) that would be useful for exploring the \
   imported graph. Each query must be runnable as-is.

Respond with JSON only:
{
  "summary": "<2-3 sentences describing the code>",
  "queries": [
    "<Cypher query 1>",
    "<Cypher query 2>",
    "<Cypher query 3>",
    "<Cypher query 4>"
  ]
}

Query guidelines:
- Use MATCH … RETURN patterns (read-only).
- Queries should reveal: entry points, dependency chains, class hierarchies, \
  most-connected nodes, call paths.
- Use the actual prefix and entity names from the import results.
- Keep queries concise — aim for single-line Cypher.\
"""


def _parse_response(text: str, prefix: str) -> tuple[str, list[str]]:
    """Extract (summary, queries) from LLM response."""
    text = text.strip()
    try:
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            data = json.loads(m.group(0))
            summary = str(data.get("summary", ""))
            queries = [str(q) for q in data.get("queries", []) if q][:5]
            return summary, queries
    except Exception:
        pass
    # Fallback: return generic queries
    return (
        "Code structure analyzed and imported into the knowledge graph.",
        [
            f"MATCH (n:{prefix}_Module) RETURN n LIMIT 10",
            f"MATCH (n)-[r]->(m) WHERE any(l IN labels(n) WHERE l STARTS WITH '{prefix}_') RETURN n, r, m LIMIT 50",
            f"MATCH (n:{prefix}_Function) RETURN n.name, n.line_start ORDER BY n.line_start LIMIT 20",
            f"MATCH (c:{prefix}_Class)-[r:CONTAINS]->(m) RETURN c.name, type(r), m.name LIMIT 30",
        ],
    )


@traceable(name="code_analysis.post_import_suggest")
async def post_import_suggest_node(state: dict) -> dict:
    """Generate code summary and suggested exploration queries after import."""
    prefix: str        = state.get("prefix", "Code")
    language: str      = state.get("detected_language", "unknown")
    file_name: str     = state.get("file_name", "input")
    classes: list      = state.get("class_list", [])
    functions: list    = state.get("function_list", [])
    nodes_up: int      = state.get("nodes_upserted", state.get("node_count", 0))
    edges_up: int      = state.get("edges_upserted", state.get("edge_count", 0))
    stmts: list[str]   = state.get("statements", [])
    exec_errors: list  = state.get("execution_errors", [])

    # Skip LLM if import failed entirely
    if exec_errors and nodes_up == 0:
        return {
            "code_summary":     "Import failed — no nodes were created.",
            "suggested_queries": [],
        }

    human_msg = (
        f"Language: {language}  File: {file_name}  Prefix: {prefix}\n"
        f"Import result: {nodes_up} nodes, {edges_up} relationships created\n"
        f"Classes/Types: {', '.join(classes[:10]) or 'none detected'}\n"
        f"Functions: {', '.join(functions[:15]) or 'none detected'}\n"
        f"Cypher statements ({len(stmts)} total):\n"
        + "\n".join(stmts[:20])
        + ("\n..." if len(stmts) > 20 else "")
        + "\n\nGenerate summary and 4 exploration queries. JSON only."
    )

    try:
        llm = get_llm_nim(temperature=0.3)   # slight creativity for variety in queries
        response = await llm.ainvoke([
            ("system", _SYSTEM),
            ("human", human_msg),
        ])
        summary, queries = _parse_response(response.content, prefix)
        logger.info("post_import_suggest: %d queries generated", len(queries))
        return {
            "code_summary":      summary,
            "suggested_queries": queries,
        }
    except Exception as exc:
        logger.warning("post_import_suggest failed: %s", exc)
        _, fallback = _parse_response("", prefix)
        return {
            "code_summary":      "Code structure imported into the knowledge graph.",
            "suggested_queries": fallback,
        }
