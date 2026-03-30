"""Shared Pydantic models — aligned with CAT industry standards.

Terminology follows ISO 12620 (term status), ISO 30042 (TBX),
and established CAT tool conventions (Trados/memoQ/Memsource).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━ Enums ━━━━━━━━━━━━━━━━━━━━━━━━━━━


class AIMode(str, Enum):
    FAST = "fast"
    FULL = "full"


class NoteType(str, Enum):
    TM_MATCH = "tm_match"
    TB_WARNING = "tb_warning"
    TB_FORBIDDEN = "tb_forbidden"
    QA = "qa"
    LLM_REVIEW = "llm_review"
    FRAGMENT_ASSEMBLY = "fragment_assembly"
    AUTO_PROPAGATION = "auto_propagation"


class CandidateStatus(str, Enum):
    AUTO_APPROVED = "auto_approved"
    PENDING_REVIEW = "pending_review"
    REJECTED = "rejected"


class TMMatchType(str, Enum):
    """TM match levels — mirrors Trados/memoQ classification."""

    ICE = "ice"              # 101% — In-Context Exact: same source + same prev/next context
    EXACT = "exact"          # 100% — identical source text after normalization
    FUZZY_HIGH = "fuzzy_high"  # 85-99% — high fuzzy
    FUZZY_MID = "fuzzy_mid"    # 70-84% — medium fuzzy
    FUZZY_LOW = "fuzzy_low"    # 50-69% — low fuzzy, usually not shown
    FRAGMENT = "fragment"    # subsegment / concordance match
    MT = "mt"                # machine translation suggestion
    NO_MATCH = "no_match"


class TermStatus(str, Enum):
    """ISO 12620 term status hierarchy — used by MultiTerm, memoQ TB, etc."""

    PREFERRED = "preferredTerm"      # Must use this translation
    ADMITTED = "admittedTerm"        # Acceptable alternative
    DEPRECATED = "deprecatedTerm"    # Should not use, soft warning
    FORBIDDEN = "forbiddenTerm"      # Must not use, hard error


class TBViolationSeverity(str, Enum):
    ERROR = "error"          # forbidden term used or preferred term missing
    WARNING = "warning"      # deprecated term used
    INFO = "info"            # admitted alternative used (not the preferred one)


class TMPenaltyType(str, Enum):
    """Penalty categories applied to TM matches (Trados-style)."""

    NONE = "none"
    MULTIPLE_TM = "multiple_tm"          # Non-primary TM bank: -1%
    AUTO_TRANSLATED = "auto_translated"  # Machine-generated entry: -5%
    AGE = "age"                          # Entry older than threshold: -1% per year
    DOMAIN_MISMATCH = "domain_mismatch"  # Different domain: -3%
    DIFFERENT_USER = "different_user"     # Unverified translator: -2%


# ━━━━━━━━━━━━━━━━━━━━━━━━ TM Data Models ━━━━━━━━━━━━━━━━━━━━━━━


class TMEntry(BaseModel):
    """A Translation Memory entry — mirrors TMX <tu> structure."""

    id: str = ""
    source_text: str
    target_text: str
    # Context for ICE matching
    prev_source: str = ""    # previous segment source text
    next_source: str = ""    # next segment source text
    # Metadata
    tm_bank: str = "default"
    domain: str = ""
    quality_score: float = 0.0
    usage_count: int = 0
    created_by: str = ""
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    is_machine_translated: bool = False
    tags: list[str] = Field(default_factory=list)


class TMMatchResult(BaseModel):
    """A single TM match returned to the caller."""

    match_type: TMMatchType
    match_score: int          # 0-101, after penalties
    raw_score: int            # 0-101, before penalties
    source_text: str          # TM entry source
    target_text: str          # TM entry target
    diff_source: str = ""     # highlighted diff between query and TM source
    penalties: list[TMPenalty] = Field(default_factory=list)
    total_penalty: int = 0
    tm_bank: str = ""
    domain: str = ""
    quality_score: float = 0.0
    is_machine_translated: bool = False
    created_at: datetime | None = None
    # For fragment matches
    matched_fragment: str = ""
    fragment_position: str = ""  # "start" | "middle" | "end"


class TMPenalty(BaseModel):
    """Individual penalty applied to a TM match."""

    type: TMPenaltyType
    value: int           # negative points (e.g. -3)
    reason: str = ""


class TMSearchContext(BaseModel):
    """Context passed to TM lookup — enables ICE matching."""

    source_text: str
    prev_source: str = ""
    next_source: str = ""
    tm_banks: list[str] = Field(default_factory=lambda: ["default"])
    primary_bank: str = "default"
    domain: str = ""
    min_fuzzy_score: int = 50
    max_results: int = 5
    enable_fragments: bool = True
    enable_ice: bool = True


# ━━━━━━━━━━━━━━━━━━━━━━━━ TB Data Models ━━━━━━━━━━━━━━━━━━━━━━━


class TermEntry(BaseModel):
    """A Terminology Base entry — follows TBX/ISO 30042 concept model.

    One concept can have multiple language sets, but here we model
    a single source→target pair (bilingual TB).
    """

    id: str = ""
    source_term: str
    target_term: str = ""
    # ISO 12620 status
    source_status: TermStatus = TermStatus.PREFERRED
    target_status: TermStatus = TermStatus.PREFERRED
    # Linguistic
    part_of_speech: str = ""     # noun, verb, adjective, etc.
    morphological_variants: list[str] = Field(default_factory=list)  # inflected forms
    # Semantic
    definition: str = ""
    usage_note: str = ""
    context_sentence: str = ""
    domain: str = ""
    subject_field: str = ""      # finer than domain
    # Administrative
    tb_name: str = "default"
    created_by: str = ""
    approved_by: str = ""
    created_at: datetime | None = None


class TBRecognitionHit(BaseModel):
    """A term recognized in source text during TB lookup."""

    term_entry: TermEntry
    # Where it was found
    source_position: tuple[int, int] = (0, 0)  # (start, end) in source text
    matched_form: str = ""       # the actual form matched (may be a variant)
    # Target check
    target_found: bool = False   # was the target term found in target text?
    target_position: tuple[int, int] = (0, 0)
    target_used_form: str = ""   # what form was actually used in target
    # Violation
    severity: TBViolationSeverity | None = None
    violation_message: str = ""


class TBCheckContext(BaseModel):
    """Context for a TB consistency check."""

    source_text: str
    target_text: str
    tb_names: list[str] = Field(default_factory=lambda: ["default"])
    domain: str = ""
    check_morphological: bool = True  # match inflected forms
    check_case_sensitive: bool = False
    source_lang: str = "en"
    target_lang: str = "zh"


# ━━━━━━━━━━━━━━━━━━━━━━━ Request Models ━━━━━━━━━━━━━━━━━━━━━━━


class AutoNoteRequest(BaseModel):
    """CAT auto-note request from frontend — full translation context."""

    source_text: str
    target_text: str
    prev_source: str = ""     # previous segment for ICE matching
    next_source: str = ""     # next segment for ICE matching
    context: dict[str, Any] = Field(default_factory=dict)
    tm_banks: list[str] = Field(default_factory=lambda: ["default"])
    tb_names: list[str] = Field(default_factory=lambda: ["default"])
    domain: str = ""
    source_lang: str = "en"
    target_lang: str = "zh"
    mode: AIMode = AIMode.FULL


class TMSuggestRequest(BaseModel):
    """Batch TM suggestion request."""

    segments: list[TranslationSegment]
    top_k: int = 5
    min_score: int = 50
    enable_fragments: bool = True


class TranslationSegment(BaseModel):
    """A segment in context — for batch TM lookup."""

    source: str
    target: str = ""
    prev_source: str = ""
    next_source: str = ""
    context: dict[str, Any] = Field(default_factory=dict)


class TBCheckRequest(BaseModel):
    """Terminology consistency check request."""

    source_text: str
    target_text: str
    tb_names: list[str] = Field(default_factory=lambda: ["default"])
    domain: str = ""
    source_lang: str = "en"
    target_lang: str = "zh"
    check_morphological: bool = True


class TBDiscoverRequest(BaseModel):
    """Terminology discovery request — from corpus text."""

    texts: list[str]                # corpus of texts to analyze
    source_lang: str = "en"
    target_lang: str = "zh"
    domain: str = ""
    min_frequency: int = 2          # minimum occurrences to consider
    existing_tb_names: list[str] = Field(default_factory=lambda: ["default"])


class QualityEvalRequest(BaseModel):
    source_text: str
    target_text: str
    context: dict[str, Any] = Field(default_factory=dict)


class TranslationPair(BaseModel):
    source: str
    target: str
    context: dict[str, Any] = Field(default_factory=dict)


# ━━━━━━━━━━━━━━━━━━━━━━ Response Models ━━━━━━━━━━━━━━━━━━━━━━━


class NoteItem(BaseModel):
    type: NoteType
    content: str
    score: float = 0.0
    severity: TBViolationSeverity | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AutoNoteResponse(BaseModel):
    notes: list[NoteItem] = Field(default_factory=list)
    quality_score: float = 0.0
    suggested_target: str | None = None
    auto_approved: bool = False
    # Detailed TM results
    tm_matches: list[TMMatchResult] = Field(default_factory=list)
    best_match_type: TMMatchType = TMMatchType.NO_MATCH
    best_match_score: int = 0
    # Detailed TB results
    tb_hits: list[TBRecognitionHit] = Field(default_factory=list)
    tb_violation_count: int = 0


class TMSuggestResponse(BaseModel):
    suggestions: list[TMMatchResult] = Field(default_factory=list)


class TBCheckResponse(BaseModel):
    hits: list[TBRecognitionHit] = Field(default_factory=list)
    violations: list[TBRecognitionHit] = Field(default_factory=list)
    passed: bool = True
    error_count: int = 0
    warning_count: int = 0


class QualityEvalResponse(BaseModel):
    overall_score: float = 0.0
    fluency: float = 0.0
    accuracy: float = 0.0
    terminology: float = 0.0
    style: float = 0.0
    explanation: str = ""


# ━━━━━━━━━━━━━━━━━━━━━━ Kafka Event Models ━━━━━━━━━━━━━━━━━━━━


class KafkaEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AINotesEvent(KafkaEvent):
    event_type: str = "AINotesGenerated"
    source_text: str
    target_text: str
    notes: list[NoteItem]
    quality_score: float
    best_match_type: str = ""
    best_match_score: int = 0
    tb_violation_count: int = 0


class TMCandidateEvent(KafkaEvent):
    event_type: str = "TmCandidateEvent"
    source_text: str
    target_text: str
    quality_score: float
    confidence: float
    tags: list[str] = Field(default_factory=list)
    domain: str = ""
    is_machine_translated: bool = False
    status: CandidateStatus = CandidateStatus.PENDING_REVIEW


class TBCandidateEvent(KafkaEvent):
    event_type: str = "TbCandidateEvent"
    source_term: str
    target_term: str | None = None
    definition: str | None = None
    part_of_speech: str = ""
    domain: str = ""
    frequency: int = 1
    confidence: float = 0.0
    suggested_status: TermStatus = TermStatus.ADMITTED
    status: CandidateStatus = CandidateStatus.PENDING_REVIEW


# ━━━━━━━━━━━━━━━━━━━ Kafka Inbound (from Rust/Arroyo) ━━━━━━━━━━━━━━━━━━━


class RagCleanedEvent(BaseModel):
    event_id: str
    cleaned_source: str
    cleaned_target: str
    word_count: int
    occurred_at: datetime


class SegmentParsedEvent(BaseModel):
    event_id: str
    snapshot_id: str
    file_id: str
    segment_count: int
    language: str
    occurred_at: datetime
