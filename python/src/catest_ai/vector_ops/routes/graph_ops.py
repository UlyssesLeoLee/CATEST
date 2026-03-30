"""Memgraph graph operations — ROPE_CS bridge for graph visualization.

Provides node/edge CRUD and Cypher query execution for the
Bevy force-directed graph layout in ROPE_CS.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

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

    return VectorPoint(
        id=str(record.get("id", record.get("elementId", ""))),
        vector=vector if isinstance(vector, list) else [],
        label=label,
        display_name=props.get("name", props.get("source_text", str(record.get("id", ""))[:40])),
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
            records = await result.data()

            for record in records:
                # Process nodes
                for key in ("n", "m"):
                    if key in record and record[key] is not None:
                        node_data = record[key]
                        node_id = str(node_data.get("id", node_data.get("elementId", "")))
                        if node_id not in nodes:
                            # Convert to dict-compatible format
                            node_dict = {
                                "id": node_id,
                                "labels": list(node_data.labels) if hasattr(node_data, "labels") else [],
                                "properties": dict(node_data) if hasattr(node_data, "items") else {},
                            }
                            nodes[node_id] = _node_to_point(node_dict, req.include_vectors)

                # Process edges
                if "r" in record and record["r"] is not None:
                    rel = record["r"]
                    edges.append(GraphEdge(
                        id=str(getattr(rel, "element_id", id(rel))),
                        source_id=str(getattr(rel, "start_node", {}).get("elementId", "")),
                        target_id=str(getattr(rel, "end_node", {}).get("elementId", "")),
                        edge_type=rel.type if hasattr(rel, "type") else "",
                        weight=dict(rel).get("weight", 1.0) if hasattr(rel, "__iter__") else 1.0,
                        properties=dict(rel) if hasattr(rel, "items") else {},
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
