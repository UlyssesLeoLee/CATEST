"""LLM client wrapper with LangSmith tracing integration.

Provides two LLM backends:
- ``get_llm()``     → ChatAnthropic (Claude) — default for all internal graphs
- ``get_llm_nim()`` → ChatOpenAI-compatible (NVIDIA NIM / qwen) — legacy/fallback
"""

from __future__ import annotations

import os

from langchain_anthropic import ChatAnthropic
from langsmith import traceable

from catest_ai.common.config import settings


def init_tracing() -> None:
    """Initialize LangSmith tracing via environment variables."""
    if settings.langsmith_tracing and settings.langsmith_api_key:
        os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
        os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
        os.environ["LANGSMITH_TRACING"] = "true"


def get_llm(
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float = 0.0,
) -> ChatAnthropic:
    """Create a ChatAnthropic (Claude) instance with project defaults.

    Used by all LangGraph nodes unless an alternative backend is preferred.
    """
    return ChatAnthropic(
        model=model or settings.anthropic_model,
        max_tokens=max_tokens or settings.anthropic_max_tokens,
        temperature=temperature,
        api_key=settings.anthropic_api_key,
    )


def get_llm_nim(
    model: str | None = None,
    temperature: float = 0.1,
):
    """Create a ChatOpenAI-compatible client pointed at NVIDIA NIM (or any
    OpenAI-compatible endpoint configured via CATEST_AI_BASE_URL / _MODEL).

    Falls back gracefully to ``get_llm()`` if langchain_openai is unavailable
    or if the NIM API key is not set.
    """
    try:
        from langchain_openai import ChatOpenAI  # type: ignore[import]
    except ImportError:
        return get_llm(temperature=temperature)

    if not settings.api_key:
        return get_llm(temperature=temperature)

    base = settings.base_url.rstrip("/")
    if not base.endswith("/chat/completions"):
        url = base if base.endswith("/v1") else base + "/v1"
    else:
        url = base.rsplit("/chat/completions", 1)[0]

    return ChatOpenAI(
        model=model or settings.model,
        temperature=temperature,
        openai_api_key=settings.api_key,
        openai_api_base=url,
    )


@traceable(name="llm_invoke")
async def invoke_llm(prompt: str, system: str = "", **kwargs) -> str:
    """Quick helper: invoke LLM with a single user message."""
    llm = get_llm(**kwargs)
    messages = []
    if system:
        messages.append(("system", system))
    messages.append(("human", prompt))
    response = await llm.ainvoke(messages)
    return response.content
