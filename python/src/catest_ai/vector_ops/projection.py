"""Dimensionality reduction for 3D visualization in ROPE_CS.

Converts high-dimensional vectors (384-dim) to 3D coordinates
that Bevy can render as point cloud or force-directed graph.

Supports UMAP, t-SNE, and PCA as projection methods.
Falls back gracefully if optional dependencies are missing.
"""

from __future__ import annotations

import logging
from typing import Literal

import numpy as np

logger = logging.getLogger(__name__)


def project_to_3d(
    vectors: list[list[float]],
    method: Literal["umap", "tsne", "pca"] = "pca",
    **kwargs,
) -> list[list[float]]:
    """Project high-dimensional vectors to 3D coordinates.

    Returns list of [x, y, z] coordinates normalized to [-1, 1] range
    for convenient Bevy scene placement.
    """
    if not vectors:
        return []

    arr = np.array(vectors, dtype=np.float32)

    if arr.shape[0] == 1:
        return [[0.0, 0.0, 0.0]]

    if arr.shape[1] <= 3:
        # Already low-dimensional
        result = arr
        if arr.shape[1] < 3:
            result = np.pad(arr, ((0, 0), (0, 3 - arr.shape[1])))
        return _normalize(result).tolist()

    if method == "umap":
        coords = _project_umap(arr, **kwargs)
    elif method == "tsne":
        coords = _project_tsne(arr, **kwargs)
    else:
        coords = _project_pca(arr)

    return _normalize(coords).tolist()


def compute_magnitudes(vectors: list[list[float]]) -> list[float]:
    """Compute L2 norms — useful for ROPE_CS to scale point size."""
    arr = np.array(vectors, dtype=np.float32)
    return np.linalg.norm(arr, axis=1).tolist()


def compute_dimension_meta(vectors: list[list[float]]) -> list[dict]:
    """Compute per-dimension statistics for ROPE_CS axis labels."""
    arr = np.array(vectors, dtype=np.float32)
    meta = []

    # PCA for variance contribution
    try:
        centered = arr - arr.mean(axis=0)
        cov = np.cov(centered.T)
        eigenvalues = np.linalg.eigvalsh(cov)
        eigenvalues = np.sort(eigenvalues)[::-1]
        total_var = eigenvalues.sum()
        variance_ratios = eigenvalues / total_var if total_var > 0 else eigenvalues
    except Exception:
        variance_ratios = np.zeros(arr.shape[1])

    for i in range(min(arr.shape[1], len(variance_ratios))):
        col = arr[:, i]
        meta.append({
            "index": i,
            "name": f"dim_{i}",
            "variance_contribution": float(variance_ratios[i]) if i < len(variance_ratios) else 0.0,
            "value_range": (float(col.min()), float(col.max())),
        })

    return meta


# ─── Projection Implementations ───


def _project_pca(arr: np.ndarray) -> np.ndarray:
    """PCA to 3D — fast, deterministic, always available."""
    centered = arr - arr.mean(axis=0)
    cov = np.cov(centered.T)

    eigenvalues, eigenvectors = np.linalg.eigh(cov)
    # Take top 3 components
    idx = np.argsort(eigenvalues)[::-1][:3]
    components = eigenvectors[:, idx]

    return centered @ components


def _project_umap(arr: np.ndarray, **kwargs) -> np.ndarray:
    """UMAP to 3D — best for preserving local structure."""
    try:
        import umap

        reducer = umap.UMAP(
            n_components=3,
            n_neighbors=kwargs.get("n_neighbors", 15),
            min_dist=kwargs.get("min_dist", 0.1),
            metric="cosine",
            random_state=42,
        )
        return reducer.fit_transform(arr)
    except ImportError:
        logger.warning("umap-learn not installed, falling back to PCA")
        return _project_pca(arr)


def _project_tsne(arr: np.ndarray, **kwargs) -> np.ndarray:
    """t-SNE to 3D — best for cluster visualization."""
    try:
        from sklearn.manifold import TSNE

        reducer = TSNE(
            n_components=3,
            perplexity=min(30, len(arr) - 1),
            random_state=42,
        )
        return reducer.fit_transform(arr)
    except ImportError:
        logger.warning("scikit-learn not installed, falling back to PCA")
        return _project_pca(arr)


def _normalize(coords: np.ndarray) -> np.ndarray:
    """Normalize coordinates to [-1, 1] range for Bevy scene."""
    for dim in range(coords.shape[1]):
        col = coords[:, dim]
        mn, mx = col.min(), col.max()
        rng = mx - mn
        if rng > 0:
            coords[:, dim] = 2.0 * (col - mn) / rng - 1.0
        else:
            coords[:, dim] = 0.0
    return coords
