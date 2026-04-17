"""Memgraph graph operations — ROPE_CS bridge for graph visualization.

Provides node/edge CRUD and Cypher query execution for the
Bevy force-directed graph layout in ROPE_CS.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from catest_ai.common.config import settings
from catest_ai.vector_ops.schemas import (
    BackendStatus,
    CollectionInfo,
    GraphEdge,
    GraphQueryRequest,
    GraphQueryResponse,
    GraphWriteRequest,
    PointLabel,
    VectorBackend,
    VectorPoint,
    VectorWriteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["graph"])


async def _get_driver():
    """Get Neo4j/Memgraph async driver."""
    from neo4j import AsyncGraphDatabase

    driver = AsyncGraphDatabase.driver(
        settings.memgraph_uri,
        auth=(settings.memgraph_user, settings.memgraph_password)
        if settings.memgraph_user
        else None,
    )
    return driver


def _node_to_point(record: dict, include_vector: bool = False) -> VectorPoint:
    """Convert a Memgraph node to a VectorPoint for ROPE_CS."""
    props = dict(record.get("properties", {}))
    node_labels = record.get("labels", [])

    # Determine point label from Memgraph node labels
    label = PointLabel.GRAPH_NODE
    if "TranslationSegment" in node_labels:
        label = PointLabel.TM_ENTRY
    elif "Term" in node_labels or "Terminology" in node_labels:
        label = PointLabel.TB_TERM
    elif "File" in node_labels:
        label = PointLabel.CODE_SEGMENT

    vector = props.pop("vector", []) if include_vector else []

    node_id = str(record.get("id", ""))
    return VectorPoint(
        id=node_id,
        vector=vector if isinstance(vector, list) else [],
        label=label,
        display_name=props.get("name", props.get("source_text", node_id[:40])),
        backend=VectorBackend.MEMGRAPH,
        payload=props,
    )


@router.post("/graph/query", response_model=GraphQueryResponse)
async def query_graph(req: GraphQueryRequest):
    """Execute Cypher query and return nodes + edges for ROPE_CS.

    If no cypher is provided, returns nodes by label filter.
    """
    driver = await _get_driver()

    if req.cypher:
        cypher = req.cypher
    elif req.node_label:
        cypher = (
            f"MATCH (n:{req.node_label}) "
            f"OPTIONAL MATCH (n)-[r]->(m) "
            f"RETURN n, r, m LIMIT {req.max_nodes}"
        )
    else:
        cypher = (
            f"MATCH (n) "
            f"OPTIONAL MATCH (n)-[r]->(m) "
            f"RETURN n, r, m LIMIT {req.max_nodes}"
        )

    nodes: dict[str, VectorPoint] = {}
    edges: list[GraphEdge] = []

    try:
        async with driver.session() as session:
            result = await session.run(cypher)
            # IMPORTANT: Do NOT use result.data() — it converts Node objects to plain
            # property-dicts, stripping .id, .element_id, and .labels.
            # Async-iterate to keep raw neo4j.graph.Node / Relationship objects.
            async for record in result:
                # ── nodes ───────────────────────────────────────────────────
                for key in ("n", "m"):
                    node_data = record.get(key)
                    if node_data is None:
                        continue

                    # Node ID: prefer element_id (string), fallback to integer id
                    if hasattr(node_data, "element_id") and node_data.element_id:
                        node_id = str(node_data.element_id)
                    elif hasattr(node_data, "id"):
                        node_id = str(node_data.id)
                    else:
                        node_id = str(id(node_data))

                    if node_id not in nodes:
                        node_dict = {
                            "id": node_id,
                            "labels": list(node_data.labels) if hasattr(node_data, "labels") else [],
                            "properties": dict(node_data) if hasattr(node_data, "items") else {},
                        }
                        nodes[node_id] = _node_to_point(node_dict, req.include_vectors)

                # ── edges ────────────────────────────────────────────────────
                rel = record.get("r")
                if rel is not None:
                    # source / target IDs — access via .start_node / .end_node Node objects
                    sn = getattr(rel, "start_node", None)
                    if sn is not None:
                        src_id = str(sn.element_id) if (hasattr(sn, "element_id") and sn.element_id) else str(getattr(sn, "id", ""))
                    else:
                        src_id = ""

                    en = getattr(rel, "end_node", None)
                    if en is not None:
                        tgt_id = str(en.element_id) if (hasattr(en, "element_id") and en.element_id) else str(getattr(en, "id", ""))
                    else:
                        tgt_id = ""

                    rel_id = str(rel.element_id) if hasattr(rel, "element_id") else str(id(rel))
                    rel_type = rel.type if hasattr(rel, "type") else type(rel).__name__
                    rel_props = dict(rel) if hasattr(rel, "items") else {}

                    edges.append(GraphEdge(
                        id=rel_id,
                        source_id=src_id,
                        target_id=tgt_id,
                        edge_type=rel_type,
                        weight=float(rel_props.get("weight", 1.0)),
                        properties=rel_props,
                    ))
    except Exception as e:
        logger.error("Graph query failed: %s", e)
    finally:
        await driver.close()

    node_list = list(nodes.values())[:req.max_nodes]
    edge_list = edges[:req.max_edges]

    return GraphQueryResponse(
        nodes=node_list,
        edges=edge_list,
        node_count=len(node_list),
        edge_count=len(edge_list),
    )


@router.post("/graph/write", response_model=VectorWriteResponse)
async def write_graph(req: GraphWriteRequest):
    """Write-back: ROPE_CS adjusts graph properties or edge weights."""
    driver = await _get_driver()

    try:
        async with driver.session() as session:
            if req.delete:
                if req.node_id:
                    await session.run(
                        "MATCH (n) WHERE elementId(n) = $id DETACH DELETE n",
                        {"id": req.node_id},
                    )
                elif req.edge_id:
                    await session.run(
                        "MATCH ()-[r]->() WHERE elementId(r) = $id DELETE r",
                        {"id": req.edge_id},
                    )
                return VectorWriteResponse(deleted=1)

            if req.node_id and req.properties:
                set_clause = ", ".join(f"n.{k} = ${k}" for k in req.properties)
                await session.run(
                    f"MATCH (n) WHERE elementId(n) = $id SET {set_clause}",
                    {"id": req.node_id, **req.properties},
                )
                return VectorWriteResponse(updated=1)

            if req.edge_id and req.new_weight is not None:
                await session.run(
                    "MATCH ()-[r]->() WHERE elementId(r) = $id SET r.weight = $w",
                    {"id": req.edge_id, "w": req.new_weight},
                )
                return VectorWriteResponse(updated=1)

        return VectorWriteResponse()
    except Exception as e:
        return VectorWriteResponse(errors=[str(e)])
    finally:
        await driver.close()


@router.get("/backends/status", response_model=list[BackendStatus])
async def backends_status():
    """Report status of all vector/graph backends — ROPE_CS connection panel."""
    statuses = []

    # Qdrant status
    try:
        client = qdrant_service.client
        collections = await client.get_collections()
        qdrant_collections = []
        for c in collections.collections:
            info = await client.get_collection(c.name)
            qdrant_collections.append(CollectionInfo(
                name=c.name,
                backend=VectorBackend.QDRANT,
                point_count=info.points_count or 0,
                dimensions=info.config.params.vectors.size if info.config.params.vectors else 0,
                distance_metric=str(info.config.params.vectors.distance) if info.config.params.vectors else "cosine",
            ))
        statuses.append(BackendStatus(
            backend=VectorBackend.QDRANT,
            connected=True,
            collections=qdrant_collections,
        ))
    except Exception as e:
        logger.warning("Qdrant status check failed: %s", e)
        statuses.append(BackendStatus(backend=VectorBackend.QDRANT, connected=False))

    # Memgraph status
    try:
        driver = await _get_driver()
        async with driver.session() as session:
            result = await session.run("MATCH (n) RETURN count(n) as cnt")
            data = await result.single()
            node_count = data["cnt"] if data else 0
        await driver.close()

        statuses.append(BackendStatus(
            backend=VectorBackend.MEMGRAPH,
            connected=True,
            collections=[CollectionInfo(
                name="memgraph",
                backend=VectorBackend.MEMGRAPH,
                point_count=node_count,
                dimensions=0,
                distance_metric="graph",
            )],
        ))
    except Exception as e:
        logger.warning("Memgraph status check failed: %s", e)
        statuses.append(BackendStatus(backend=VectorBackend.MEMGRAPH, connected=False))

    return statuses


# Import qdrant_service at module level to use in backends_status
from catest_ai.common.qdrant_service import qdrant_service


# ── Delete displayed nodes ─────────────────────────────────────────────────────

class DeleteNodesRequest(BaseModel):
    """Delete a specific set of nodes (and their relationships) from Memgraph."""
    node_ids: list[str]  # element_id strings as returned by graph query


class DeleteNodesResponse(BaseModel):
    deleted_nodes: int
    deleted_rels: int
    errors: list[str] = []


@router.post("/graph/delete-nodes", response_model=DeleteNodesResponse)
async def delete_nodes(req: DeleteNodesRequest):
    """Delete nodes by element_id and detach all their relationships."""
    if not req.node_ids:
        return DeleteNodesResponse(deleted_nodes=0, deleted_rels=0)

    driver = await _get_driver()
    deleted_nodes = 0
    deleted_rels = 0
    errors: list[str] = []

    try:
        async with driver.session() as session:
            # Memgraph uses integer IDs internally; element_id is a string like "0","1",...
            # We try both integer matching and string matching for robustness.
            id_ints: list[int] = []
            for eid in req.node_ids:
                try:
                    id_ints.append(int(eid))
                except ValueError:
                    pass

            if id_ints:
                cypher = (
                    "MATCH (n) WHERE id(n) IN $ids "
                    "DETACH DELETE n "
                    "RETURN count(n) as cnt"
                )
                result = await session.run(cypher, ids=id_ints)
                summary = await result.consume()
                deleted_nodes = summary.counters.nodes_deleted
                deleted_rels = summary.counters.relationships_deleted
    except Exception as e:
        errors.append(str(e))
        logger.error("delete_nodes error: %s", e)
    finally:
        await driver.close()

    return DeleteNodesResponse(
        deleted_nodes=deleted_nodes,
        deleted_rels=deleted_rels,
        errors=errors,
    )
