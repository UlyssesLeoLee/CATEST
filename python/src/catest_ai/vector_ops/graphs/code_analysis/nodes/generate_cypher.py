"""generate_cypher node — LLM-powered Cypher generation.

Uses enriched context (import_list, class_list, function_list, code_chunk)
to build a language-specific, metadata-rich prompt before calling the LLM.

Improvements over v1:
- Language-specific prompt extensions (decorators for Python, traits for Rust, etc.)
- Uses code_chunk (safe-sized) instead of raw code_body to avoid token overflow
- Context summary header gives LLM the structural inventory upfront
- MERGE-only enforcement with idempotency rationale in prompt
"""

from __future__ import annotations

import logging
import re
from datetime import date

from langsmith import traceable

from catest_ai.common.llm import get_llm_nim

logger = logging.getLogger(__name__)

# ── Base system prompt ────────────────────────────────────────────────────────

_BASE_SYSTEM = """\
You are a code-structure graph builder. Given source code, output ONLY valid \
Cypher MERGE statements that model the code's structural entities and relationships.

RULES — follow strictly:
1. Use MERGE (never CREATE) — this makes repeated analysis idempotent.
2. Node labels: always prefix with "{prefix}_". Standard labels:
   {prefix}_Module  {prefix}_Class   {prefix}_Function  {prefix}_Method
   {prefix}_Variable  {prefix}_Interface  {prefix}_Enum  {prefix}_Import
3. Every node MUST have: `name` (identifier string), `kind` (entity type string).
4. Add when available: `language`, `file`, `line_start`, `visibility` (public/private).
5. Relationship types (use these exactly):
   CONTAINS  CALLS  IMPORTS  EXTENDS  IMPLEMENTS  USES  RETURNS
   ACCEPTS_PARAM  DECORATES  OVERRIDES  DEPENDS_ON
6. Output ONLY Cypher. No markdown fences, no prose, no comments.
7. One statement per line, each ending with a semicolon.
8. Use short variable names: mod=module, c=class, f=function, m=method, v=variable.
9. Do NOT emit duplicate statements for the same entity.

OUTPUT FORMAT:
MERGE (...);
MERGE (...)-[...]->(...);\
"""

# ── Language-specific addendums ───────────────────────────────────────────────

_LANG_ADDENDUM: dict[str, str] = {
    "python": """
PYTHON-SPECIFIC:
- Capture decorators: use DECORATES relationship from decorator to function/class.
- `__init__` is a special method: kind="constructor".
- Dataclasses/Pydantic models: treat fields as {prefix}_Variable nodes with CONTAINS.
- Module-level constants (ALL_CAPS): kind="constant".
""",
    "typescript": """
TYPESCRIPT-SPECIFIC:
- Interfaces and type aliases: use {prefix}_Interface label, kind="interface".
- Generic type parameters: skip them — focus on named entities.
- Arrow functions assigned to const: treat as {prefix}_Function, kind="arrow_function".
- Enums: {prefix}_Enum node, each member as {prefix}_Variable with CONTAINS.
- async functions: add `async: true` property.
""",
    "javascript": """
JAVASCRIPT-SPECIFIC:
- CommonJS require(): emit {prefix}_Import node for each module, IMPORTS relationship.
- Prototype methods (Foo.prototype.bar): kind="method" with CONTAINS from class.
- Arrow functions: kind="arrow_function".
""",
    "rust": """
RUST-SPECIFIC:
- struct/enum/trait: use {prefix}_Class label, kind="struct"/"enum"/"trait".
- impl blocks: model methods as {prefix}_Method with CONTAINS from the struct.
- Trait implementations: IMPLEMENTS relationship from struct to trait.
- use statements: {prefix}_Import with IMPORTS relationship.
- pub fn vs fn: set visibility="public" or visibility="private".
""",
    "go": """
GO-SPECIFIC:
- Structs: {prefix}_Class, kind="struct".
- Interfaces: {prefix}_Interface, kind="interface".
- Methods on structs (func (r *Receiver) Name()): CONTAINS from struct to method.
- Packages: {prefix}_Module per package.
- Interface satisfaction: IMPLEMENTS relationship.
""",
    "java": """
JAVA-SPECIFIC:
- Abstract classes: kind="abstract_class".
- Annotations (@Override etc.): DECORATES relationship.
- Packages: {prefix}_Module node, CONTAINS to classes.
- Generics: ignore type params, focus on class name.
- throws clauses: skip.
""",
    "cpp": """
C++-SPECIFIC:
- Namespaces: {prefix}_Module, kind="namespace".
- Templates: record template class name, ignore type params.
- Inheritance: EXTENDS relationship.
- Virtual methods: add `virtual: true` property.
- Header includes: {prefix}_Import with IMPORTS.
""",
    "csharp": """
C#-SPECIFIC:
- Namespaces: {prefix}_Module, kind="namespace".
- Properties (get/set): kind="property", CONTAINS from class.
- Interfaces (I-prefix): {prefix}_Interface.
- Attributes ([Attribute]): DECORATES relationship.
- Partial classes: merge into single node.
""",
}


def _build_system_prompt(prefix: str, lang: str) -> str:
    base = _BASE_SYSTEM.replace("{prefix}", prefix)
    addendum = _LANG_ADDENDUM.get(lang, "")
    if addendum:
        addendum = addendum.replace("{prefix}", prefix)
        return base + "\n" + addendum.strip()
    return base


def _build_context_header(state: dict) -> str:
    """Compact inventory of known entities — helps LLM avoid hallucination."""
    imports   = state.get("import_list", [])
    classes   = state.get("class_list", [])
    functions = state.get("function_list", [])
    file_name = state.get("file_name", "input")
    complexity = state.get("complexity_hint", "unknown")
    lang      = state.get("detected_language", "unknown")

    parts = [f"File: {file_name}  Language: {lang}  Complexity: {complexity}"]
    if imports:
        parts.append(f"Imports ({len(imports)}): {', '.join(imports[:15])}")
    if classes:
        parts.append(f"Classes/Types ({len(classes)}): {', '.join(classes[:15])}")
    if functions:
        parts.append(f"Functions ({len(functions)}): {', '.join(functions[:20])}")
    return "\n".join(parts)


# ── Annotation block builder ──────────────────────────────────────────────────

_ANNO_HEADER = """\
/*
 * ┌──────────────────────────────────────────────────────┐
 * │  CATEST · Code Structure Annotation                  │
 * │  Prefix: {prefix:<12s} Language: {language:<15s}│
 * │  Date:   {date:<43s}│
 * └──────────────────────────────────────────────────────┘
 *
{stmts}
 */"""


def _build_annotation(stmts: list[str], prefix: str, language: str) -> str:
    stmt_lines = "\n".join(f" * {s}" for s in stmts)
    return _ANNO_HEADER.format(
        prefix=prefix,
        language=language,
        date=str(date.today()),
        stmts=stmt_lines,
    )


def _parse_statements(raw: str) -> list[str]:
    """Extract individual MERGE/CREATE Cypher statements from raw LLM output."""
    raw = re.sub(r"```(?:cypher)?\s*", "", raw).replace("```", "")
    stmts: list[str] = []
    seen: set[str] = set()
    for line in raw.split(";"):
        line = line.strip()
        if not line:
            continue
        if line.startswith("//") and "\n" not in line:
            continue
        if re.match(r"(MERGE|CREATE|WITH|MATCH)\s", line, re.IGNORECASE):
            stmt = line + ";"
            norm = re.sub(r"\s+", " ", stmt.lower())
            if norm not in seen:
                seen.add(norm)
                stmts.append(stmt)
    return stmts


# ── Node ─────────────────────────────────────────────────────────────────────

@traceable(name="code_analysis.generate_cypher")
async def generate_cypher_node(state: dict) -> dict:
    """Call LLM to generate Cypher MERGE statements from enriched code context."""
    code_chunk: str = state.get("code_chunk") or state.get("code_body") or state.get("code", "")
    language: str   = state.get("detected_language", "unknown")
    prefix: str     = state.get("prefix", "Code")

    system = _build_system_prompt(prefix, language)
    context_header = _build_context_header(state)

    human_msg = (
        f"Structural inventory:\n{context_header}\n\n"
        f"Source code:\n```{language}\n{code_chunk}\n```\n\n"
        f"Output Cypher MERGE statements only."
    )

    try:
        llm = get_llm_nim(temperature=0.05)   # very low temp — deterministic graph facts
        response = await llm.ainvoke([
            ("system", system),
            ("human", human_msg),
        ])
        raw_cypher: str = response.content

        statements = _parse_statements(raw_cypher)
        annotation_block = _build_annotation(statements, prefix, language)

        return {
            "raw_cypher":       raw_cypher,
            "statements":       statements,
            "annotation_block": annotation_block,
        }
    except Exception as exc:
        logger.error("generate_cypher failed: %s", exc)
        return {
            "raw_cypher":       "",
            "statements":       [],
            "annotation_block": "",
            "abort_reason":     f"LLM call failed: {exc}",
        }


# Re-export helpers used by fix_cypher
__all__ = ["generate_cypher_node", "_build_annotation", "_parse_statements"]
