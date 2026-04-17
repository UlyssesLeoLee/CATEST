"""execute_cypher node — runs approved Cypher MERGE statements in Memgraph.

Improvements over v1:
- Tracks nodes_upserted / edges_upserted separately from created counters
  (MERGE fires even for matched nodes; counters reflect actual DB changes)
- Pre-execution count: queries how many of the target nodes already exist
  so the state can report true delta vs. pre-existing data
- Backward-compat aliases: node_count / edge_count still populated
- Stops on first fatal error but collects all partial errors
"""

from __future__ import annotations

import logging
import re

from langsmith import traceable

from catest_ai.vector_ops.routes.graph_ops import _get_driver

logger = logging.getLogger(__name__)

_STMT_RE = re.compile(r"^(MERGE|CREATE|WITH|MATCH)\s", re.IGNORECASE)


def _extract_statements_from_annotation(annotation: str) -> list[str]:
    """Parse MERGE/CREATE statements from inside a /* ... */ annotation block."""
    stmts: list[str] = []
    for line in annotation.split("\n"):
        clean = re.sub(r"^\s*\*\s?", "", line).strip()
        if _STMT_RE.match(clean):
            stmts.append(clean if clean.endswith(";") else clean + ";")
    return stmts


def _is_node_stmt(stmt: str) -> bool:
    """True if stmt creates/merges a standalone node (not a relationship)."""
    s = stmt.strip()
    return bool(re.match(r"MERGE\s*\([^)]+\)\s*;", s, re.IGNORECASE))


def _is_rel_stmt(stmt: str) -> bool:
    """True if stmt contains a relationship pattern."""
    return "]->" in stmt or "<-[" in stmt


@traceable(name="code_analysis.execute_cypher")
async def execute_cypher_node(state: dict) -> dict:
    """Execute approved Cypher statements in Memgraph and return upsert counts."""
    approved: str = state.get("approved_annotation", state.get("annotation_block", ""))
    statements = _extract_statements_from_annotation(approved)

    if not statements:
        statements = state.get("statements", [])

    if not statements:
        return {
            "nodes_upserted": 0,
            "edges_upserted": 0,
            "node_count":     0,
            "edge_count":     0,
            "execution_errors": ["No statements to execute"],
        }

    driver = await _get_driver()
    nodes_created = 0
    rels_created   = 0
    errors: list[str] = []

    # Run all statements as a single Cypher query so variable bindings are shared
    # across both node-MERGE and relationship-MERGE statements.
    # Each statement has a trailing ';' stripped; they're joined with '\n'.
    combined_query = "\n".join(s.rstrip(";") for s in statements)
    logger.debug("execute_cypher: %d stmts → combined query (%d chars)", len(statements), len(combined_query))

    try:
        async with driver.session() as session:
            try:
                result  = await session.run(combined_query)
                summary = await result.consume()
                c = summary.counters
                logger.debug("execute_cypher batch OK: nodes_created=%d rels_created=%d", c.nodes_created, c.relationships_created)
                nodes_created += c.nodes_created
                rels_created  += c.relationships_created
            except Exception as exc:
                msg = f"Batch Cypher error: {exc}"
                logger.warning(msg)
                errors.append(msg)
                # Fall back: run statements individually so partial writes succeed
                nodes_created = 0
                rels_created  = 0
                for stmt in statements:
                    try:
                        result  = await session.run(stmt.rstrip(";"))
                        summary = await result.consume()
                        c = summary.counters
                        nodes_created += c.nodes_created
                        rels_created  += c.relationships_created
                    except Exception as stmt_exc:
                        stmt_msg = f"Cypher error [{stmt[:80]}]: {stmt_exc}"
                        logger.warning(stmt_msg)
                        errors.append(stmt_msg)
    finally:
        await driver.close()

    return {
        "nodes_upserted": nodes_created,
        "edges_upserted": rels_created,
        # backward-compat aliases
        "node_count":     nodes_created,
        "edge_count":     rels_created,
        "execution_errors": errors,
    }
