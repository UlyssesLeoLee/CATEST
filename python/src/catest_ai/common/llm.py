"""LLM client wrapper with LangSmith tracing integration."""

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
    """Create a ChatAnthropic instance with project defaults."""
    return ChatAnthropic(
        model=model or settings.anthropic_model,
        max_tokens=max_tokens or settings.anthropic_max_tokens,
        temperature=temperature,
        api_key=settings.anthropic_api_key,
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
