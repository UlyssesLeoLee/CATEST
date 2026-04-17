"""enrich_context node — zero-LLM structured pre-analysis.

Extracts imports, class names, function names, and a complexity hint
from the code_body using language-aware regex patterns.

This structured metadata is injected into the state so that:
  - generate_cypher gets a richer prompt (concrete names, not just raw code)
  - large files are safely chunked before hitting the LLM token limit
  - post_import_suggest can produce precise query suggestions

No LLM call here — pure pattern matching, always fast, always cheap.
"""

from __future__ import annotations

import re

from langsmith import traceable

# ── Max chars sent to LLM to avoid token overflow ────────────────────────────
_CHUNK_LIMIT = 6000   # ~1500 tokens at 4 chars/token — safe for all models

# ── Language-aware extraction patterns ───────────────────────────────────────

_PATTERNS: dict[str, dict[str, str]] = {
    "typescript": {
        "import":   r"^import\s.+from\s+['\"](.+?)['\"]",
        "class":    r"(?:^|\s)(?:export\s+)?(?:abstract\s+)?class\s+(\w+)",
        "function": r"(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+(\w+)",
    },
    "javascript": {
        "import":   r"^(?:import\s.+from\s+['\"](.+?)['\"]|const\s+\w+\s*=\s*require\s*\(['\"](.+?)['\"]\))",
        "class":    r"(?:^|\s)(?:export\s+)?class\s+(\w+)",
        "function": r"(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+(\w+)",
    },
    "python": {
        "import":   r"^(?:import\s+(\S+)|from\s+(\S+)\s+import)",
        "class":    r"^class\s+(\w+)",
        "function": r"^def\s+(\w+)",
    },
    "rust": {
        "import":   r"^use\s+([\w:]+)",
        "class":    r"(?:^|\s)(?:pub\s+)?struct\s+(\w+)|(?:^|\s)(?:pub\s+)?trait\s+(\w+)|(?:^|\s)(?:pub\s+)?enum\s+(\w+)",
        "function": r"(?:^|\s)(?:pub\s+)?(?:async\s+)?fn\s+(\w+)",
    },
    "go": {
        "import":   r'"([\w./]+)"',
        "class":    r"^type\s+(\w+)\s+struct",
        "function": r"^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(",
    },
    "java": {
        "import":   r"^import\s+([\w.]+);",
        "class":    r"(?:^|\s)(?:public\s+)?(?:abstract\s+)?class\s+(\w+)",
        "function": r"(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\(",
    },
    "cpp": {
        "import":   r"#include\s*[<\"](.+?)[>\"]",
        "class":    r"(?:^|\s)class\s+(\w+)",
        "function": r"(?:^|\s)(?:\w[\w:*&<> ]+)\s+(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{",
    },
    "c": {
        "import":   r"#include\s*[<\"](.+?)[>\"]",
        "class":    r"typedef\s+struct\s+\{[^}]*\}\s*(\w+)",
        "function": r"^(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*\{",
    },
    "csharp": {
        "import":   r"^using\s+([\w.]+);",
        "class":    r"(?:^|\s)(?:public\s+)?(?:partial\s+)?(?:abstract\s+)?class\s+(\w+)",
        "function": r"(?:public|private|protected|static|override|virtual|\s)+[\w<>\[\]?]+\s+(\w+)\s*\(",
    },
}

_DEFAULT_PATTERNS = {
    "import":   r"^(?:import|require|use|include|using)\s+(.+)",
    "class":    r"(?:^|\s)(?:class|struct|type|interface)\s+(\w+)",
    "function": r"(?:^|\s)(?:function|func|def|fn|sub|proc)\s+(\w+)",
}


def _extract(code: str, lang: str) -> tuple[list[str], list[str], list[str]]:
    """Return (imports, classes, functions) for the given language."""
    pats = _PATTERNS.get(lang, _DEFAULT_PATTERNS)
    lines = code.splitlines()
    imports, classes, functions = [], [], []
    seen_i, seen_c, seen_f = set(), set(), set()

    for line in lines:
        stripped = line.strip()

        m = re.search(pats["import"], stripped, re.IGNORECASE)
        if m:
            name = next((g for g in m.groups() if g), None)
            if name and name not in seen_i:
                seen_i.add(name)
                imports.append(name)

        m = re.search(pats["class"], stripped, re.IGNORECASE)
        if m:
            name = next((g for g in m.groups() if g), None)
            if name and name not in seen_c:
                seen_c.add(name)
                classes.append(name)

        m = re.search(pats["function"], stripped, re.IGNORECASE)
        if m:
            name = next((g for g in m.groups() if g), None)
            if name and name not in seen_f:
                seen_f.add(name)
                functions.append(name)

    return imports[:30], classes[:20], functions[:40]


def _complexity(code: str) -> str:
    lines = [l for l in code.splitlines() if l.strip()]
    n = len(lines)
    if n < 80:
        return "small"
    if n < 400:
        return "medium"
    return "large"


def _smart_chunk(code: str, limit: int = _CHUNK_LIMIT) -> str:
    """For large files, keep first chunk + key structural lines."""
    if len(code) <= limit:
        return code
    # Keep first part + try to grab class/function signatures from rest
    head = code[:limit]
    tail = code[limit:]
    sig_lines = [l for l in tail.splitlines()
                 if re.match(r"\s*(class|def|function|func|fn|struct|impl|pub\s+fn)\s+", l)]
    if sig_lines:
        appendix = "\n// ... (truncated) ...\n" + "\n".join(sig_lines[:30])
        return head + appendix
    return head + "\n// ... (truncated) ..."


@traceable(name="code_analysis.enrich_context")
async def enrich_context_node(state: dict) -> dict:
    """Extract structured metadata from code_body — no LLM, pure parsing."""
    code_body: str = state.get("code_body") or state.get("code", "")
    lang: str = state.get("detected_language", "unknown")
    file_name: str = state.get("file_name", "input")

    imports, classes, functions = _extract(code_body, lang)
    complexity = _complexity(code_body)
    chunk = _smart_chunk(code_body)

    return {
        "file_name":     file_name,
        "import_list":   imports,
        "class_list":    classes,
        "function_list": functions,
        "complexity_hint": complexity,
        "code_chunk":    chunk,
    }
