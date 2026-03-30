"""Clustering operations — ROPE_CS uses this to color-code points by cluster.

Computes clusters server-side and returns cluster assignments.
ROPE_CS then maps cluster_id → color in the Bevy material system.
"""

from __future__ import annotations

import logging

import numpy as np
from fastapi import APIRouter

from catest_ai.common.qdrant_service import qdrant_service
from catest_ai.vector_ops.schemas import ClusterMethod, ClusterRequest, ClusterResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["clustering"])


@router.post("/vectors/cluster", response_model=ClusterResponse)
async def cluster_vectors(req: ClusterRequest):
    """Compute clusters on the vector collection.

    Returns cluster assignments that ROPE_CS maps to colors.
    """
    client = qdrant_service.client

    # Fetch all vectors (paginated)
    all_points = []
    offset = None
    while True:
        points, next_offset = await client.scroll(
            collection_name=req.collection,
            limit=1000,
            offset=offset,
            with_vectors=True,
            with_payload=False,
        )
        all_points.extend(points)
        if next_offset is None or len(points) < 1000:
            break
        offset = next_offset

    if len(all_points) < 2:
        return ClusterResponse(clusters={0: [str(p.id) for p in all_points]}, n_clusters=1)

    vectors = np.array([p.vector for p in all_points if p.vector], dtype=np.float32)
    ids = [str(p.id) for p in all_points if p.vector]

    labels = _run_clustering(vectors, req.method, req.n_clusters, req.min_cluster_size)

    # Build cluster map
    clusters: dict[int, list[str]] = {}
    for point_id, label in zip(ids, labels):
        clusters.setdefault(int(label), []).append(point_id)

    # Silhouette score
    silhouette = _compute_silhouette(vectors, labels) if len(set(labels)) > 1 else 0.0

    return ClusterResponse(
        clusters=clusters,
        n_clusters=len(clusters),
        silhouette_score=silhouette,
    )


def _run_clustering(
    vectors: np.ndarray,
    method: ClusterMethod,
    n_clusters: int,
    min_cluster_size: int,
) -> np.ndarray:
    """Run the selected clustering algorithm."""
    if method == ClusterMethod.KMEANS:
        return _kmeans(vectors, n_clusters)
    elif method == ClusterMethod.DBSCAN:
        return _dbscan(vectors, min_cluster_size)
    elif method == ClusterMethod.HDBSCAN:
        return _hdbscan(vectors, min_cluster_size)
    return _kmeans(vectors, n_clusters)


def _kmeans(vectors: np.ndarray, k: int) -> np.ndarray:
    """Simple K-means — always available (numpy only)."""
    n = vectors.shape[0]
    k = min(k, n)

    # Random initialization
    rng = np.random.RandomState(42)
    indices = rng.choice(n, k, replace=False)
    centroids = vectors[indices].copy()

    for _ in range(50):
        # Assign
        dists = np.linalg.norm(vectors[:, None] - centroids[None, :], axis=2)
        labels = np.argmin(dists, axis=1)
        # Update
        new_centroids = np.array([
            vectors[labels == i].mean(axis=0) if (labels == i).any() else centroids[i]
            for i in range(k)
        ])
        if np.allclose(centroids, new_centroids):
            break
        centroids = new_centroids

    return labels


def _dbscan(vectors: np.ndarray, min_samples: int) -> np.ndarray:
    try:
        from sklearn.cluster import DBSCAN

        model = DBSCAN(eps=0.5, min_samples=min_samples, metric="cosine")
        return model.fit_predict(vectors)
    except ImportError:
        logger.warning("scikit-learn not installed, falling back to kmeans")
        return _kmeans(vectors, 10)


def _hdbscan(vectors: np.ndarray, min_cluster_size: int) -> np.ndarray:
    try:
        import hdbscan

        model = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, metric="euclidean")
        return model.fit_predict(vectors)
    except ImportError:
        logger.warning("hdbscan not installed, falling back to kmeans")
        return _kmeans(vectors, 10)


def _compute_silhouette(vectors: np.ndarray, labels: np.ndarray) -> float:
    try:
        from sklearn.metrics import silhouette_score
        return float(silhouette_score(vectors, labels, metric="cosine"))
    except (ImportError, ValueError):
        return 0.0
