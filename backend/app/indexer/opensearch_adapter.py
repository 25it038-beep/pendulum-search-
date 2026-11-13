"""
OpenSearch Cluster Adapter for HS SEARCH
Company: HS AI Solutions
"""

import logging
from typing import Dict, Any, List, Optional
from app.config import settings

logger = logging.getLogger(__name__)

class OpenSearchAdapter:
    def __init__(self, url: str = settings.OPENSEARCH_URL):
        self.url = url
        self.client = None
        self.index_name = "hs_search_documents"
        self._is_connected = False

    def connect(self) -> bool:
        if not settings.USE_OPENSEARCH:
            return False
        try:
            from opensearchpy import OpenSearch
            self.client = OpenSearch([self.url], timeout=1)
            # Ping
            if self.client.ping():
                self._is_connected = True
                self._ensure_index()
                logger.info(f"Connected to OpenSearch cluster at {self.url}")
                return True
        except Exception as e:
            logger.debug(f"OpenSearch not available: {e}. Using native FTS5 engine.")
            self._is_connected = False
        return False

    def _ensure_index(self):
        if not self._is_connected or not self.client:
            return
        if not self.client.indices.exists(index=self.index_name):
            mapping = {
                "settings": {
                    "number_of_shards": 1,
                    "number_of_replicas": 0,
                    "analysis": {
                        "analyzer": {
                            "hs_analyzer": {
                                "type": "standard",
                                "stopwords": "_english_"
                            }
                        }
                    }
                },
                "mappings": {
                    "properties": {
                        "url": {"type": "keyword"},
                        "domain": {"type": "keyword"},
                        "title": {"type": "text", "boost": 2.5, "analyzer": "hs_analyzer"},
                        "snippet": {"type": "text", "boost": 1.5, "analyzer": "hs_analyzer"},
                        "content_text": {"type": "text", "analyzer": "hs_analyzer"},
                        "category": {"type": "keyword"},
                        "published_at": {"type": "date"},
                        "indexed_at": {"type": "date"},
                        "quality_score": {"type": "float"}
                    }
                }
            }
            self.client.indices.create(index=self.index_name, body=mapping)

    def index_document(self, doc_id: int, doc_dict: Dict[str, Any]) -> bool:
        if not self._is_connected or not self.client:
            return False
        try:
            body = {
                "url": doc_dict.get("url"),
                "domain": doc_dict.get("domain"),
                "title": doc_dict.get("title"),
                "snippet": doc_dict.get("snippet"),
                "content_text": doc_dict.get("content_text", "")[:20000],
                "category": doc_dict.get("metadata", {}).get("category", "general"),
                "published_at": doc_dict.get("published_at"),
                "indexed_at": doc_dict.get("indexed_at"),
                "quality_score": doc_dict.get("quality_score", 0.5)
            }
            self.client.index(index=self.index_name, id=str(doc_id), body=body, refresh=True)
            return True
        except Exception as e:
            logger.debug(f"OpenSearch index failed: {e}")
            return False

    def search(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        if not self._is_connected or not self.client:
            return []
        try:
            body = {
                "query": {
                    "multi_match": {
                        "query": query,
                        "fields": ["title^3", "snippet^2", "content_text"],
                        "fuzziness": "AUTO"
                    }
                },
                "size": limit
            }
            res = self.client.search(index=self.index_name, body=body)
            hits = res.get("hits", {}).get("hits", [])
            return [{"id": int(h["_id"]), "score": h["_score"]} for h in hits]
        except Exception:
            return []

opensearch_adapter = OpenSearchAdapter()
