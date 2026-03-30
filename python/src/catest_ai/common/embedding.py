"""Embedding model client — calls the inference service (Ollama-compatible API)."""

from __future__ import annotations

import logging

import httpx

from catest_ai.common.config import settings

logger = logging.getLogger(__name__)


async def embed_text(text: str) -> list[float]:
    """Generate embedding vector for a single text string."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.inference_url}/api/embed",
            json={"model": settings.embed_model_name, "input": text},
        )
        resp.raise_for_status()
        data = resp.json()
        # Ollama returns {"embeddings": [[...]]}
        return data["embeddings"][0]


async def embed_batch(texts: list[str]) -> list[list[float]]:
    """Generate embedding vectors for a batch of texts."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.inference_url}/api/embed",
            json={"model": settings.embed_model_name, "input": texts},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["embeddings"]
