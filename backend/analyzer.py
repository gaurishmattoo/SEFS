"""
SEFS Analyzer — Text extraction & semantic clustering.
Extracts text from PDF/TXT files, vectorizes with TF-IDF,
and clusters with KMeans using silhouette-score auto-tuning.
"""

import os
import re
from pathlib import Path

from PyPDF2 import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import numpy as np


# ---------------------------------------------------------------------------
# Text Extraction
# ---------------------------------------------------------------------------

def extract_text(filepath: str) -> str:
    """Extract text content from a .txt or .pdf file."""
    ext = Path(filepath).suffix.lower()
    try:
        if ext == ".txt":
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        elif ext == ".pdf":
            reader = PdfReader(filepath)
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(pages)
    except Exception as e:
        print(f"[analyzer] Error reading {filepath}: {e}")
    return ""


def _clean(text: str) -> str:
    """Basic text normalization."""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

def compute_clusters(file_map: dict[str, str]) -> dict:
    """
    Given {filepath: raw_text, ...}, cluster semantically.

    Returns:
        {
            "clusters": {
                "cluster_label": [filepath, ...],
                ...
            },
            "labels": {filepath: cluster_label, ...},
            "unclustered": [filepath, ...]   # files with empty text
        }
    """
    paths = list(file_map.keys())
    texts = [_clean(file_map[p]) for p in paths]

    # Separate files with no extractable text
    valid = [(p, t) for p, t in zip(paths, texts) if len(t) > 20]
    unclustered = [p for p, t in zip(paths, texts) if len(t) <= 20]

    if len(valid) < 2:
        # Not enough files to cluster — put everything in one group
        label = _make_label_from_texts([t for _, t in valid]) if valid else "misc"
        return {
            "clusters": {label: [p for p, _ in valid]},
            "labels": {p: label for p, _ in valid},
            "unclustered": unclustered,
        }

    v_paths = [p for p, _ in valid]
    v_texts = [t for _, t in valid]

    # TF-IDF
    vectorizer = TfidfVectorizer(
        max_features=5000,
        stop_words="english",
        min_df=1,
        max_df=0.95,
    )
    tfidf_matrix = vectorizer.fit_transform(v_texts)
    feature_names = vectorizer.get_feature_names_out()

    # Find best k via silhouette score
    # max_k must be < n_samples for silhouette_score to work
    max_k = min(len(v_paths) - 1, 8)
    best_k, best_score = 2, -1

    if len(v_paths) <= 2 or max_k < 2:
        best_k = 1
    else:
        for k in range(2, max_k + 1):
            km = KMeans(n_clusters=k, n_init=10, random_state=42)
            labels = km.fit_predict(tfidf_matrix)
            if len(set(labels)) < 2:
                continue
            score = silhouette_score(tfidf_matrix, labels)
            if score > best_score:
                best_score = score
                best_k = k

    # Final clustering
    if best_k == 1:
        label = _make_label_from_texts(v_texts)
        return {
            "clusters": {label: v_paths},
            "labels": {p: label for p in v_paths},
            "unclustered": unclustered,
        }

    km = KMeans(n_clusters=best_k, n_init=10, random_state=42)
    assignments = km.fit_predict(tfidf_matrix)

    # Generate cluster labels from top TF-IDF terms per centroid
    clusters: dict[str, list[str]] = {}
    labels_map: dict[str, str] = {}

    for cid in range(best_k):
        indices = [i for i, a in enumerate(assignments) if a == cid]
        if not indices:
            continue

        # Top terms for this cluster
        centroid = km.cluster_centers_[cid]
        top_indices = centroid.argsort()[-3:][::-1]
        top_terms = [feature_names[i] for i in top_indices]
        label = "_".join(top_terms)

        cluster_files = [v_paths[i] for i in indices]
        clusters[label] = cluster_files
        for fp in cluster_files:
            labels_map[fp] = label

    return {
        "clusters": clusters,
        "labels": labels_map,
        "unclustered": unclustered,
    }


def _make_label_from_texts(texts: list[str]) -> str:
    """Generate a simple label from a list of texts using TF-IDF top terms."""
    if not texts:
        return "misc"
    try:
        vec = TfidfVectorizer(max_features=500, stop_words="english")
        mat = vec.fit_transform(texts)
        names = vec.get_feature_names_out()
        mean = np.asarray(mat.mean(axis=0)).flatten()
        top = mean.argsort()[-3:][::-1]
        return "_".join(names[i] for i in top)
    except Exception:
        return "misc"
