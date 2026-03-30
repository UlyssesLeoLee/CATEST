"""Qdrant vector operations — ROPE_CS bridge for vector CRUD.

All Qdrant reads/writes go through here so ROPE_CS has a single
integration point for the vector store.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter

from catest_ai.common.config import settings
from catest_ai.common.embedding import embed_text
from catest_ai.common.qdrant_service import qdrant_service
from catest_ai.vector_ops.projection import (
    compute_dimension_meta,
    compute_magnitudes,
    project_to_3d,
)
from catest_ai.vector_ops.schemas import (
    PointLabel,
    VectorBackend,
    VectorBatchWriteRequest,
    VectorPoint,
    VectorQueryRequest,
    VectorQueryResponse,
    VectorSearchRequest,
    VectorSearchResponse,
    VectorWriteRequest,
    VectorWriteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["qdrant"])


def _payload_to_label(payload: dict[str, Any]) -> PointLabel:
    """Infer ROPE_CS label from Qdrant payload."""
    if "tm_bank" in payload or "source_text" in payload:
        return PointLabel.TM_ENTRY
    if "source_term" in payload:
        return PointLabel.TB_TERM
    if "segment_type" in payload or "language" in payload:
        return PointLabel.CODE_SEGMENT
    return PointLabel.RAG_DOCUMENT


def _payload_to_display(payload: dict[str, Any]) -> str:
    """Generate display name from payload for ROPE_CS tooltip."""
    if "source_text" in payload:
        src = payload["source_text"]
        return src[:60] + "..." if len(src) > 60 else src
    if "source_term" in payload:
        return payload["source_term"]
    return payload.get("title", payload.get("id", ""))


@router.post("/vectors/query", response_model=VectorQueryResponse)
async def query_vectors(req: VectorQueryRequest):
    """Fetch vectors from Qdrant for ROPE_CS visualization.

    Returns points with 3D projections for Bevy scene rendering.
    """
    client = qdrant_service.client

    # Scroll through collection
    points, _next_offset = await client.scroll(
        collection_name=req.collection,
        limit=req.limit,
        offset=req.offset,
        with_vectors=True,
        with_payload=True,
    )

    if not points:
        return VectorQueryResponse(points=[], total_count=0, dimensions=0)

    # Extract vectors for projection
    vectors = [p.vector for p in points if p.vector]
    dim = len(vectors[0]) if vectors else 0

    # 3D projection
    positions = project_to_3d(vectors, method=req.projection_method) if req.project_3d and vectors else [None] * len(points)
    magnitudes = compute_magnitudes(vectors) if vectors else [0.0] * len(points)
    dim_meta = compute_dimension_meta(vectors) if vectors else None

    # Build response
    result_points = []
    for i, p in enumerate(points):
        payload = p.payload or {}
        label = _payload_to_label(payload)

        # Apply filters
        if req.label_filter and label not in req.label_filter:
            continue

        result_points.append(VectorPoint(
            id=str(p.id),
            vector=p.vector if p.vector else [],
            position_3d=positions[i] if i < len(positions) else None,
            label=label,
            display_name=_payload_to_display(payload),
            backend=VectorBackend.QDRANT,
            collection=req.collection,
            payload=payload,
            magnitude=magnitudes[i] if i < len(magnitudes) else 0.0,
            quality_score=payload.get("quality_score", 0.0),
            usage_count=payload.get("usage_count", 0),
            created_at=payload.get("created_at"),
        ))

    # Get total count
    collection_info = await client.get_collection(req.collection)
    total = collection_info.points_count or 0

    return VectorQueryResponse(
        points=result_points,
        total_count=total,
        dimensions=dim,
        dimension_meta=[
            {"index": d["index"], "name": d["name"],
             "variance_contribution": d["variance_contribution"],
             "value_range": d["value_range"]}
            for d in (dim_meta[:20] if dim_meta else [])
        ],
    )


@router.post("/vectors/search", response_model=VectorSearchResponse)
async def search_vectors(req: VectorSearchRequest):
    """Semantic search — ROPE_CS 'find neighbors' feature."""
    if req.query_text and not req.query_vector:
        query_vector = await embed_text(req.query_text)
    elif req.query_vector:
        query_vector = req.query_vector
    else:
        return VectorSearchResponse(results=[], query_vector=None)

    results = await qdrant_service.search_similar(
        query_vector, top_k=req.top_k, score_threshold=req.score_threshold,
    )

    points = []
    for hit in results:
        payload = hit.payload or {}
        points.append(VectorPoint(
            id=str(hit.id),
            vector=hit.vector if hasattr(hit, "vector") and hit.vector else [],
            label=_payload_to_label(payload),
            display_name=_payload_to_display(payload),
            backend=VectorBackend.QDRANT,
            collection=req.collection,
            payload=payload,
            quality_score=payload.get("quality_score", 0.0),
        ))

    return VectorSearchResponse(results=points, query_vector=query_vector)


@router.post("/vectors/write", response_model=VectorWriteResponse)
async def write_vector(req: VectorWriteRequest):
    """Write-back: ROPE_CS pushes vector adjustments to Qdrant."""
    client = qdrant_service.client
    errors = []

    if req.delete:
        try:
            await client.delete(
                collection_name=req.collection,
                points_selector=[req.id],
            )
            return VectorWriteResponse(deleted=1)
        except Exception as e:
            return VectorWriteResponse(errors=[str(e)])

    try:
        from qdrant_client.models import PointStruct

        if req.new_vector:
            # Full upsert with new vector
            point = PointStruct(
                id=req.id,
                vector=req.new_vector,
                payload=req.new_payload or {},
            )
            await client.upsert(
                collection_name=req.collection,
                points=[point],
            )
        elif req.new_payload:
            # Payload-only update
            await client.set_payload(
                collection_name=req.collection,
                payload=req.new_payload,
                points=[req.id],
            )

        return VectorWriteResponse(updated=1)
    except Exception as e:
        return VectorWriteResponse(errors=[str(e)])


@router.post("/vectors/write-batch", response_model=VectorWriteResponse)
async def write_batch(req: VectorBatchWriteRequest):
    """Batch write-back for ROPE_CS edit sessions."""
    updated = 0
    deleted = 0
    errors = []

    for op in req.operations:
        try:
            result = await write_vector(op)
            updated += result.updated
            deleted += result.deleted
            errors.extend(result.errors)
        except Exception as e:
            errors.append(f"{op.id}: {e}")

    return VectorWriteResponse(updated=updated, deleted=deleted, errors=errors)
