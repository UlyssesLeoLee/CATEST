"""Vector operations schemas — designed as the ROPE_CS ↔ Python bridge contract.

These models define the wire format between the Bevy ROPE_CS client and
the Python vector-ops service. Designed to be:
- Transport-agnostic (REST now, gRPC/WebSocket later)
- Batch-friendly (Bevy needs to pull thousands of points efficiently)
- Write-back capable (ROPE_CS can adjust vectors and push changes back)
- Metadata-rich (position, color, label, cluster for 3D visualization)
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ─── Enums ───


class VectorBackend(str, Enum):
    """Storage backend for vector operations."""
    QDRANT = "qdrant"
    MEMGRAPH = "memgraph"


class PointLabel(str, Enum):
    """Semantic labels for visualization grouping in ROPE_CS."""
    TM_ENTRY = "tm_entry"
    TB_TERM = "tb_term"
    RAG_DOCUMENT = "rag_document"
    CODE_SEGMENT = "code_segment"
    GRAPH_NODE = "graph_node"
    GRAPH_EDGE = "graph_edge"
    CUSTOM = "custom"


class ClusterMethod(str, Enum):
    KMEANS = "kmeans"
    DBSCAN = "dbscan"
    HDBSCAN = "hdbscan"


# ─── Core Data Models ───


class VectorPoint(BaseModel):
    """A single point in vector space — the atomic unit for ROPE_CS.

    Contains the raw vector, metadata for 3D rendering, and source info.
    ROPE_CS will map this to a Bevy Entity with Transform + Mesh.
    """
    id: str
    vector: list[float]                  # raw embedding
    # 3D position (projected from high-dim via UMAP/t-SNE, or from Bevy layout)
    position_3d: list[float] | None = None  # [x, y, z] for Bevy scene
    # Visualization metadata
    label: PointLabel = PointLabel.CUSTOM
    display_name: str = ""
    color_hex: str = "#FFFFFF"           # RGB hex for Bevy material
    cluster_id: int = -1                 # -1 = unclustered
    # Source metadata
    backend: VectorBackend = VectorBackend.QDRANT
    collection: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    # Quality / importance
    magnitude: float = 0.0              # L2 norm of vector
    quality_score: float = 0.0
    usage_count: int = 0
    created_at: datetime | None = None


class GraphEdge(BaseModel):
    """A graph edge for Memgraph visualization in ROPE_CS."""
    id: str
    source_id: str
    target_id: str
    edge_type: str = ""                 # relationship type
    weight: float = 1.0
    properties: dict[str, Any] = Field(default_factory=dict)


class DimensionMeta(BaseModel):
    """Metadata about a vector dimension — for ROPE_CS axis labels."""
    index: int
    name: str = ""                       # human-readable name if available
    variance_contribution: float = 0.0   # PCA variance explained
    value_range: tuple[float, float] = (0.0, 0.0)


# ─── Request Models ───


class VectorQueryRequest(BaseModel):
    """Query vectors from a backend for ROPE_CS visualization."""
    backend: VectorBackend = VectorBackend.QDRANT
    collection: str = "catest_rag"
    # Filter
    label_filter: list[PointLabel] | None = None
    cluster_filter: list[int] | None = None
    payload_filter: dict[str, Any] | None = None
    # Pagination (Bevy loads in chunks for large datasets)
    offset: int = 0
    limit: int = 1000
    # Include 3D projection?
    project_3d: bool = True
    projection_method: str = "umap"     # "umap" | "tsne" | "pca"


class VectorSearchRequest(BaseModel):
    """Semantic search — find neighbors of a given vector or text."""
    query_vector: list[float] | None = None
    query_text: str | None = None        # will be embedded automatically
    backend: VectorBackend = VectorBackend.QDRANT
    collection: str = "catest_rag"
    top_k: int = 20
    score_threshold: float = 0.0


class VectorWriteRequest(BaseModel):
    """Write-back: ROPE_CS adjusts a vector and pushes the change.

    Use cases:
    - Manual vector adjustment in Bevy 3D view
    - Merge two similar points by averaging vectors
    - Delete outlier points
    - Update payload metadata
    """
    id: str
    backend: VectorBackend = VectorBackend.QDRANT
    collection: str = "catest_rag"
    # What to update (all optional — only set fields are updated)
    new_vector: list[float] | None = None
    new_payload: dict[str, Any] | None = None
    delete: bool = False


class VectorBatchWriteRequest(BaseModel):
    """Batch write-back for efficiency (ROPE_CS sends batch after edit session)."""
    operations: list[VectorWriteRequest]


class ClusterRequest(BaseModel):
    """Request clustering computation on current vector set."""
    backend: VectorBackend = VectorBackend.QDRANT
    collection: str = "catest_rag"
    method: ClusterMethod = ClusterMethod.KMEANS
    n_clusters: int = 10                 # for kmeans
    min_cluster_size: int = 5            # for hdbscan/dbscan
    # Filter to subset
    label_filter: list[PointLabel] | None = None


class GraphQueryRequest(BaseModel):
    """Query Memgraph for nodes + edges (for ROPE_CS graph view)."""
    cypher: str = ""                     # raw Cypher query
    node_label: str = ""                 # filter by node label
    max_nodes: int = 500
    max_edges: int = 1000
    include_vectors: bool = False        # include stored vectors in payload


class GraphWriteRequest(BaseModel):
    """Write-back: adjust graph node properties or edge weights from ROPE_CS."""
    node_id: str | None = None
    edge_id: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    new_weight: float | None = None
    delete: bool = False


# ─── Response Models ───


class VectorQueryResponse(BaseModel):
    points: list[VectorPoint]
    total_count: int
    dimensions: int
    dimension_meta: list[DimensionMeta] | None = None


class VectorSearchResponse(BaseModel):
    results: list[VectorPoint]
    query_vector: list[float] | None = None


class VectorWriteResponse(BaseModel):
    updated: int = 0
    deleted: int = 0
    errors: list[str] = Field(default_factory=list)


class ClusterResponse(BaseModel):
    clusters: dict[int, list[str]]       # cluster_id → list of point IDs
    n_clusters: int
    silhouette_score: float = 0.0


class GraphQueryResponse(BaseModel):
    nodes: list[VectorPoint]
    edges: list[GraphEdge]
    node_count: int
    edge_count: int


class CollectionInfo(BaseModel):
    """Metadata about a vector collection — for ROPE_CS collection selector."""
    name: str
    backend: VectorBackend
    point_count: int
    dimensions: int
    distance_metric: str = "cosine"


class BackendStatus(BaseModel):
    """Health/status of a vector backend."""
    backend: VectorBackend
    connected: bool
    collections: list[CollectionInfo] = Field(default_factory=list)
