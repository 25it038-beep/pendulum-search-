"""
Unit Tests for Database, Incremental Indexing, and Vector Retrieval
"""

import pytest
import asyncio
from datetime import datetime
from app.database.connection import db
from app.indexer.pipeline import indexing_pipeline
from app.indexer.vector_index import vector_index

@pytest.mark.asyncio
async def test_indexing_and_vector_retrieval():
    await db.init_db()

    doc1 = {
        "url": "https://hsaisolutions.com/products/search",
        "domain": "hsaisolutions.com",
        "title": "HS SEARCH: Autonomous Real-Time Search Engine",
        "snippet": "HS SEARCH is an independent AI search platform engineered by HS AI Solutions.",
        "content_text": "HS SEARCH provides autonomous web crawling, semantic neural retrieval, and deep research agents.",
        "content_hash": "hash_123456",
        "published_at": datetime.utcnow(),
        "quality_score": 0.95,
        "credibility_score": 0.90
    }

    doc_id, action = await indexing_pipeline.index_document(doc1)
    assert doc_id is not None
    assert action in ("created", "updated")

    # Vector Search
    results = vector_index.search("autonomous web crawling search engine", top_k=5)
    assert len(results) > 0
    matched_ids = [r[0] for r in results]
    assert doc_id in matched_ids

    # Test modification versioning
    doc1_modified = dict(doc1)
    doc1_modified["content_text"] = "HS SEARCH modified content with new quantum architecture."
    doc1_modified["content_hash"] = "hash_999999"

    mod_id, mod_action = await indexing_pipeline.index_document(doc1_modified)
    assert mod_id == doc_id
    assert mod_action == "updated"

    # Check version history
    async with db.get_connection() as conn:
        cursor = await conn.execute("SELECT COUNT(*) as c FROM document_versions WHERE document_id = ?", (doc_id,))
        count = (await cursor.fetchone())["c"]
        assert count >= 2
