from __future__ import annotations

import re

from langsmith import traceable

# Heuristic signatures: patterns that strongly suggest a language
_HINTS: list[tuple[str, str]] = [
    (r"\bimport\s+\w+\s+from\b|export\s+(default\s+)?(\bclass\b|\bfunction\b|\bconst\b)|:?\s*(string|number|boolean)\b", "typescript"),
    (r"\brequire\s*\(|module\.exports\s*=|const\s+\w+\s*=\s*require", "javascript"),
    (r"^\s*(def |class |import |from .* import |if __name__)", "python"),
    (r"\bfn\s+\w+\s*\(|let\s+mut\s+|impl\s+\w+|use\s+std::", "rust"),
    (r"\bfunc\s+\w+\s*\(|:=\s*|package\s+\w+|import\s+\"", "go"),
    (r"\bpublic\s+(static\s+)?class\b|\bSystem\.out\.println\b|@Override", "java"),
    (r"#include\s*<|std::|cout\s*<<|nullptr", "cpp"),
    (r"#include\s*<stdio\.h>|printf\s*\(|scanf\s*\(", "c"),
    (r"\busing\s+System;|\bnamespace\s+\w+|\bConsole\.Write", "csharp"),
]

_KNOWN = {
    "typescript", "javascript", "python", "rust", "go",
    "java", "c", "cpp", "csharp", "auto",
}


@traceable(name="code_analysis.detect_language")
async def detect_language_node(state: dict) -> dict:
    """Resolve ambiguous language hint and strip any existing annotation header."""
    language: str = state.get("language", "auto") or "auto"
    code: str = state.get("code", "")

    # Strip existing /* ... */ annotation block at top of file
    code_body = re.sub(r"^\/\*[\s\S]*?\*\/\s*", "", code).strip()

    # If user gave explicit (non-auto) known language, trust it
    if language.lower() not in ("auto", "") and language.lower() in _KNOWN:
        return {
            "detected_language": language.lower(),
            "code_body": code_body,
        }

    # Heuristic scan on code_body
    sample = code_body[:2000]
    for pattern, lang in _HINTS:
        if re.search(pattern, sample, re.MULTILINE):
            return {"detected_language": lang, "code_body": code_body}

    # Fallback: keep whatever the user gave, or "unknown"
    return {
        "detected_language": language if language != "auto" else "unknown",
        "code_body": code_body,
    }
