"""
Unit Tests for Multi-Source Acquisition Engine & Registry
"""

import pytest
from app.database.connection import db
from app.acquisition.registry import seed_source_registry
from app.acquisition.manager import acquisition_manager
from app.acquisition.connectors.indexnow_connector import indexnow_connector

@pytest.mark.asyncio
async def test_source_registry_and_connectors():
    await db.init_db()
    await seed_source_registry()

    sources = await db.get_sources()
    assert len(sources) >= 5
    source_names = [s["source_name"] for s in sources]
    assert any("Wikimedia" in name for name in source_names)
    assert any("OpenAlex" in name for name in source_names)
    assert any("GitHub" in name for name in source_names)

def test_indexnow_submission():
    count = indexnow_connector.receive_submission(
        host="example.com",
        url_list=["https://example.com/page1", "https://example.com/page2"],
        key="test_key_123"
    )
    assert count == 2
