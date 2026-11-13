"""
Qdrant Vector Database Adapter for HS SEARCH
Company: HS AI Solutions
"""

import logging
from typing import List, Tuple, Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)

class QdrantAdapter:
    def __init__(self, url: str = settings.QDRANT_URL):
        self.url = url
        self.client = None
        self.collection_name = "hs_search_vectors"
        self._is_connected = False

    def connect(self) -> bool:
        if not settings.USE_QDRANT:
            return False
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.http.models import Distance, VectorParams
            self.client = QdrantClient(url=self.url, timeout=1, check_version=False)
            # Check connection
            collections = self.client.get_collections().collections
            names = [c.name for c in collections]
            if self.collection_name not in names:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=settings.VECTOR_DIMENSION, distance=Distance.COSINE)
                )
            self._is_connected = True
            logger.info(f"Connected to Qdrant at {self.url}")
            return True
        except Exception as e:
            logger.debug(f"Qdrant not available: {e}. Using native vector index.")
            self._is_connected = False
            return False

    def upsert_vector(self, doc_id: int, vector: List[float], payload: Dict[str, Any] = None) -> bool:
        if not self._is_connected or not self.client:
            return False
        try:
            from qdrant_client.http.models import PointStruct
            self.client.upsert(
                collection_name=self.collection_name,
                points=[
                    PointStruct(
                        id=doc_id,
                        vector=vector,
                        payload=payload or {}
                    )
                ]
            )
            return True
        except Exception as e:
            logger.debug(f"Qdrant upsert failed: {e}")
            return False

    def search(self, query_vector: List[float], top_k: int = 50) -> List[Tuple[int, float]]:
        if not self._is_connected or not self.client:
            return []
        try:
            hits = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                limit=top_k
            )
            return [(int(hit.id), float(hit.score)) for hit in hits]
        except Exception:
            return []

qdrant_adapter = QdrantAdapter()
