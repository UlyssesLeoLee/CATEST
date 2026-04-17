"""validate_cypher node — structural validation of generated Cypher statements.

Rules checked:
1. Every statement must start with MERGE/CREATE/MATCH/WITH.
2. No leftover markdown fences (```).
3. CREATE is forbidden (violates idempotence — use MERGE).
4. Standalone node MERGE (no relationship arrow) must have {name: ...} property.
5. Relationship MERGE must reference at least two parenthesised variables.

Key fix: rules 4 and 5 are only applied to their respective statement shapes —
a relationship MERGE like `MERGE (a)-[:REL]->(b)` is valid without properties.
"""

from __future__ import annotations

import re

from langsmith import traceable

MAX_RETRIES = 3

_BAD_FENCE = re.compile(r"```")
_BAD_CREATE = re.compile(r"CREATE\s*\(", re.IGNORECASE)
_REQUIRED_CLAUSE = re.compile(r"^(MERGE|CREATE|WITH|MATCH)\s", re.IGNORECASE)
_PROPERTY_RE = re.compile(r'\{[^}]*\}')
_REL_ARROW = re.compile(r'(-\[|]->|<-\[)')   # relationship arrow in statement


def _is_relationship_stmt(stmt: str) -> bool:
    return bool(_REL_ARROW.search(stmt))


def _is_standalone_node_merge(stmt: str) -> bool:
    """True for  MERGE (n:Label {...})  with no relationship arrow."""
    return (
        re.match(r"MERGE\s*\(", stmt.strip(), re.IGNORECASE) is not None
        and not _is_relationship_stmt(stmt)
    )


def _check_statement(stmt: str) -> list[str]:
    errors: list[str] = []
    stripped = stmt.strip()

    # Rule 1: must start with known clause
    if not _REQUIRED_CLAUSE.match(stripped):
        errors.append(f"Does not start with MERGE/CREATE/MATCH/WITH: {stripped[:60]}")
        return errors   # other checks meaningless if clause is wrong

    # Rule 2: no markdown fences
    if _BAD_FENCE.search(stripped):
        errors.append(f"Leftover markdown fence: {stripped[:60]}")

    # Rule 3: no bare CREATE (we enforce idempotence via MERGE)
    if _BAD_CREATE.search(stripped):
        errors.append(f"Use MERGE instead of CREATE: {stripped[:60]}")

    # Rule 4: standalone node MERGE must have {name: "..."} property
    if _is_standalone_node_merge(stripped):
        props = _PROPERTY_RE.search(stripped)
        if not props:
            errors.append(f"Standalone MERGE node missing property block: {stripped[:60]}")
        elif "name" not in props.group(0):
            errors.append(f"Standalone MERGE node missing 'name' property: {stripped[:60]}")

    # Rule 5: relationship MERGE should have at least two variable references
    if _is_relationship_stmt(stripped) and re.match(r"MERGE\s", stripped, re.IGNORECASE):
        if stripped.count("(") < 2:
            errors.append(f"Relationship MERGE looks incomplete (< 2 node refs): {stripped[:60]}")

    return errors


@traceable(name="code_analysis.validate_cypher")
async def validate_cypher_node(state: dict) -> dict:
    """Validate Cypher statements structurally. Flag errors for fix_cypher loop."""
    statements: list[str] = state.get("statements", [])
    retry_count: int       = state.get("retry_count", 0)
    abort_reason: str | None = state.get("abort_reason")

    if abort_reason:
        return {"is_valid": False, "validation_errors": [abort_reason]}

    if not statements:
        return {
            "is_valid":         False,
            "validation_errors": ["No Cypher statements generated"],
            "retry_count":      retry_count,
        }

    all_errors: list[str] = []
    for stmt in statements:
        all_errors.extend(_check_statement(stmt))

    is_valid = len(all_errors) == 0
    return {
        "is_valid":          is_valid,
        "validation_errors": all_errors,
        "retry_count":       retry_count,
    }
