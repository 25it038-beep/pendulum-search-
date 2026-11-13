"""
Semantic Vector Index & Dense Retrieval Engine for HS SEARCH
Company: HS AI Solutions | Founder: Harshan Seliyan

Language-aware, deterministic high-speed multilingual dense text embedder.
Projects lexical, morphological subwords, Unicode script n-grams,
and cross-lingual concept anchors into a normalized 256-D semantic space.
"""

import numpy as np
import os
import re
import math
from typing import List, Tuple, Dict, Any, Optional
from pathlib import Path
from app.config import settings
from app.nlp.language import multilingual_engine, CROSS_LINGUAL_CONCEPTS

class VectorEncoder:
    """
    Multilingual semantic embedder with cross-language conceptual alignment.
    Supports English, Tamil, Hindi, Telugu, Malayalam, Kannada, Bengali, Arabic,
    Chinese, Japanese, Korean, French, German, Spanish, Portuguese, Russian, etc.
    """
    def __init__(self, dimension: int = settings.VECTOR_DIMENSION):
        self.dimension = dimension
        # Predefined stable pseudo-random projection matrix
        np.random.seed(42)
        self.projection_matrix = np.random.randn(15013, self.dimension).astype(np.float32)

    def _hash_token(self, token: str) -> int:
        h = 0
        for char in token:
            h = (h * 31 + ord(char)) % 15013
        return h

    def encode(self, text: str) -> np.ndarray:
        if not text:
            return np.zeros(self.dimension, dtype=np.float32)

        text_lower = text.lower()
        cleaned = re.sub(r"[^\w\s]", " ", text_lower)
        tokens = cleaned.split()
        if not tokens:
            return np.zeros(self.dimension, dtype=np.float32)

        vec = np.zeros(self.dimension, dtype=np.float32)

        # 1. Word token embeddings with position weighting
        for i, token in enumerate(tokens[:120]):
            h = self._hash_token(token)
            pos_weight = 1.0 + (1.5 if i < 10 else (1.0 if i < 50 else 0.7))
            vec += self.projection_matrix[h] * pos_weight

        # 2. Subword 2-gram and 3-gram embeddings (crucial for agglutinative/indic/cjk languages)
        for token in tokens[:50]:
            if len(token) >= 2:
                for j in range(len(token) - 1):
                    bi = token[j:j+2]
                    h_bi = self._hash_token(f"bi_{bi}")
                    vec += self.projection_matrix[h_bi] * 0.35
            if len(token) >= 3:
                for j in range(len(token) - 2):
                    tri = token[j:j+3]
                    h_tri = self._hash_token(f"tri_{tri}")
                    vec += self.projection_matrix[h_tri] * 0.40

        # 3. Cross-lingual Conceptual Anchor Bridge
        # If text contains any known concept term across any language, inject concept anchor
        for concept_name, lang_dict in CROSS_LINGUAL_CONCEPTS.items():
            for lang, term in lang_dict.items():
                if term.lower() in text_lower:
                    h_concept = self._hash_token(f"concept_{concept_name}")
                    # Anchor boost for cross-lingual alignment
                    vec += self.projection_matrix[h_concept] * 6.0
                    break

        # L2 Normalize
        norm = np.linalg.norm(vec)
        if norm > 1e-9:
            vec /= norm
        return vec

class VectorIndex:
    """
    In-memory and persisted dense vector index for incremental semantic search.
    """
    def __init__(self, store_path: Path = settings.VECTOR_STORE_PATH):
        self.store_path = store_path
        self.encoder = VectorEncoder(settings.VECTOR_DIMENSION)
        self.doc_ids: List[int] = []
        self.vectors: Optional[np.ndarray] = None
        self.id_to_index: Dict[int, int] = {}
        self.load()

    def add_or_update(self, doc_id: int, text: str):
        vec = self.encoder.encode(text)

        if doc_id in self.id_to_index:
            idx = self.id_to_index[doc_id]
            self.vectors[idx] = vec
        else:
            if self.vectors is None or len(self.doc_ids) == 0:
                self.vectors = np.expand_dims(vec, axis=0)
                self.doc_ids = [doc_id]
                self.id_to_index[doc_id] = 0
            else:
                self.vectors = np.vstack([self.vectors, vec])
                new_idx = len(self.doc_ids)
                self.doc_ids.append(doc_id)
                self.id_to_index[doc_id] = new_idx

    def search(self, query: str, top_k: int = 50) -> List[Tuple[int, float]]:
        """
        Cosine similarity search with query vector.
        Returns list of (doc_id, similarity_score).
        """
        if self.vectors is None or len(self.doc_ids) == 0:
            return []

        q_vec = self.encoder.encode(query)
        # Cosine similarity because vectors are normalized
        scores = np.dot(self.vectors, q_vec)

        # Get top-k indices
        top_k = min(top_k, len(self.doc_ids))
        if top_k <= 0:
            return []

        top_indices = np.argpartition(scores, -top_k)[-top_k:]
        # Sort top indices descending
        sorted_top_indices = top_indices[np.argsort(-scores[top_indices])]

        results = []
        for idx in sorted_top_indices:
            score = float(scores[idx])
            if score > 0.05: # Minimum semantic relevance threshold
                results.append((self.doc_ids[idx], score))

        return results

    def save(self):
        """Persist vector index to storage."""
        if self.vectors is not None and len(self.doc_ids) > 0:
            try:
                self.store_path.parent.mkdir(parents=True, exist_ok=True)
                np.savez_compressed(
                    self.store_path,
                    doc_ids=np.array(self.doc_ids, dtype=np.int64),
                    vectors=self.vectors
                )
            except Exception:
                pass

    def load(self):
        """Load vector index from storage if present."""
        if self.store_path.exists():
            try:
                data = np.load(self.store_path)
                self.doc_ids = data["doc_ids"].tolist()
                self.vectors = data["vectors"]
                self.id_to_index = {doc_id: idx for idx, doc_id in enumerate(self.doc_ids)}
            except Exception:
                self.doc_ids = []
                self.vectors = None
                self.id_to_index = {}

vector_index = VectorIndex()
dense_embedder = VectorEncoder()
