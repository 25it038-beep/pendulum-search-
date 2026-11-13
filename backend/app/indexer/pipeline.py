"""
Incremental Indexing Pipeline for HS SEARCH
Company: HS AI Solutions | Founder: Harshan Seliyan
"""

import asyncio
import logging
from typing import Dict, Any, Tuple, Union
from datetime import datetime, timezone
from app.database.models import DocumentRecord, DocumentMetadata, ImageItem, VideoItem, AudioItem
from app.database.connection import db
from app.indexer.vector_index import vector_index
from app.indexer.opensearch_adapter import opensearch_adapter
from app.indexer.qdrant_adapter import qdrant_adapter

logger = logging.getLogger(__name__)

class IndexingPipeline:
    def __init__(self):
        self._lock = asyncio.Lock()

    async def index_document(self, doc_data: Union[Dict[str, Any], DocumentRecord]) -> Tuple[int, str]:
        """
        Process and incrementally index a discovered document.
        Accepts either a dict or a DocumentRecord instance.
        Returns: (doc_id, action) where action is 'created', 'updated', or 'unchanged'
        """
        if isinstance(doc_data, DocumentRecord):
            doc = doc_data
        else:
            meta = doc_data.get("metadata")
            if isinstance(meta, dict):
                meta_obj = DocumentMetadata(**meta)
            elif isinstance(meta, DocumentMetadata):
                meta_obj = meta
            else:
                meta_obj = DocumentMetadata(
                    title=doc_data.get("title", ""),
                    description=doc_data.get("snippet", ""),
                    category=doc_data.get("category", "general"),
                    category_label=doc_data.get("category_label", "General Web"),
                    language=doc_data.get("language", "en"),
                    content_type=doc_data.get("content_type", "text/html"),
                    author=doc_data.get("author")
                )

            # Images, videos, audios conversion
            images_list = []
            for img in doc_data.get("images", []):
                if isinstance(img, ImageItem):
                    images_list.append(img)
                elif isinstance(img, dict):
                    images_list.append(ImageItem(**img))

            videos_list = []
            for vid in doc_data.get("videos", []):
                if isinstance(vid, VideoItem):
                    videos_list.append(vid)
                elif isinstance(vid, dict):
                    videos_list.append(VideoItem(**vid))

            audios_list = []
            for aud in doc_data.get("audios", []):
                if isinstance(aud, AudioItem):
                    audios_list.append(aud)
                elif isinstance(aud, dict):
                    audios_list.append(AudioItem(**aud))

            doc = DocumentRecord(
                url=doc_data["url"],
                domain=doc_data["domain"],
                title=doc_data.get("title", ""),
                snippet=doc_data.get("snippet", ""),
                content_text=doc_data.get("content_text", ""),
                content_hash=doc_data.get("content_hash", ""),
                simhash=doc_data.get("simhash"),
                status_code=doc_data.get("status_code", 200),
                published_at=doc_data.get("published_at"),
                last_modified_header=doc_data.get("last_modified_header"),
                metadata=meta_obj,
                images=images_list,
                videos=videos_list,
                audios=audios_list,
                outlinks=doc_data.get("outlinks", []),
                quality_score=doc_data.get("quality_score", 0.5),
                credibility_score=doc_data.get("credibility_score", 0.5),
                inlink_count=doc_data.get("inlink_count", 0),
                is_live=doc_data.get("is_live", False),
                source_type=doc_data.get("source_type", "HTMLCrawler")
            )

        async with self._lock:
            # 1. Database upsert & versioning
            doc_id, action = await db.upsert_document(doc)

            if action in ("created", "updated"):
                # 2. Update Vector Semantic Index with multilingual representation
                full_text_representation = f"{doc.title}. {doc.snippet}. {doc.content_text[:1200]}"
                vector_index.add_or_update(doc_id, full_text_representation)
                vector_index.save()

                # 3. OpenSearch (if connected)
                if opensearch_adapter._is_connected:
                    opensearch_adapter.index_document(doc_id, doc.model_dump())

                # 4. Qdrant (if connected)
                if qdrant_adapter._is_connected:
                    q_vec = vector_index.encoder.encode(full_text_representation).tolist()
                    qdrant_adapter.upsert_vector(
                        doc_id=doc_id,
                        vector=q_vec,
                        payload={"url": doc.url, "domain": doc.domain, "title": doc.title}
                    )

                # 5. Log activity
                await db.log_event(
                    event_type="index" if action == "created" else "change",
                    message=f"Document {action}: {doc.title[:60]} ({doc.url})",
                    url=doc.url,
                    details={"doc_id": doc_id, "action": action, "domain": doc.domain}
                )

        return doc_id, action

indexing_pipeline = IndexingPipeline()
