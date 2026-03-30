"""Node: rule-based QA checks (numbers, punctuation, formatting)."""

from __future__ import annotations

import re

from langsmith import traceable

from catest_ai.common.schemas import NoteItem, NoteType


@traceable(name="qa_check")
async def qa_check_node(state: dict) -> dict:
    """Run deterministic QA rules — no LLM needed."""
    source = state["source_text"]
    target = state["target_text"]
    notes: list[NoteItem] = list(state.get("notes", []))
    qa_issues: list[str] = []

    # 1. Number consistency
    src_numbers = set(re.findall(r"\d+(?:\.\d+)?", source))
    tgt_numbers = set(re.findall(r"\d+(?:\.\d+)?", target))
    missing = src_numbers - tgt_numbers
    if missing:
        issue = f"Numbers missing in target: {', '.join(sorted(missing))}"
        qa_issues.append(issue)
        notes.append(NoteItem(type=NoteType.QA, content=issue, score=0.9))

    # 2. Leading/trailing whitespace mismatch
    if source.startswith(" ") != target.startswith(" "):
        issue = "Leading whitespace mismatch"
        qa_issues.append(issue)
        notes.append(NoteItem(type=NoteType.QA, content=issue, score=0.5))

    if source.endswith(" ") != target.endswith(" "):
        issue = "Trailing whitespace mismatch"
        qa_issues.append(issue)
        notes.append(NoteItem(type=NoteType.QA, content=issue, score=0.5))

    # 3. Placeholder/variable consistency (e.g. {name}, %s, $var)
    src_placeholders = set(re.findall(r"\{[^}]+\}|%[sd]|\$\w+", source))
    tgt_placeholders = set(re.findall(r"\{[^}]+\}|%[sd]|\$\w+", target))
    if src_placeholders != tgt_placeholders:
        missing_ph = src_placeholders - tgt_placeholders
        extra_ph = tgt_placeholders - src_placeholders
        parts = []
        if missing_ph:
            parts.append(f"missing: {', '.join(sorted(missing_ph))}")
        if extra_ph:
            parts.append(f"extra: {', '.join(sorted(extra_ph))}")
        issue = f"Placeholder mismatch — {'; '.join(parts)}"
        qa_issues.append(issue)
        notes.append(NoteItem(type=NoteType.QA, content=issue, score=0.95))

    # 4. Empty target
    if not target.strip():
        issue = "Target text is empty"
        qa_issues.append(issue)
        notes.append(NoteItem(type=NoteType.QA, content=issue, score=1.0))

    # 5. Punctuation ending consistency (period, question mark, exclamation)
    src_end = source.rstrip()[-1:] if source.strip() else ""
    tgt_end = target.rstrip()[-1:] if target.strip() else ""
    terminal_punct = {".", "?", "!", "。", "？", "！"}
    if src_end in terminal_punct and tgt_end not in terminal_punct:
        issue = f"Source ends with '{src_end}' but target does not end with terminal punctuation"
        qa_issues.append(issue)
        notes.append(NoteItem(type=NoteType.QA, content=issue, score=0.6))

    return {"notes": notes, "qa_issues": qa_issues}
