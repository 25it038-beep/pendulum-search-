"""
Unit Tests for HS Knowledge Graph Engine & Relationships
"""

import pytest
from app.database.connection import db
from app.knowledge.graph import knowledge_graph
from app.knowledge.extractor import entity_extractor

@pytest.mark.asyncio
async def test_knowledge_graph_seeding_and_retrieval():
    await db.init_db()
    await knowledge_graph.init_seed_graph()

    # Query Founder Entity
    card = await knowledge_graph.get_entity_card("Harshan Seliyan")
    assert card is not None
    assert card["name"] == "Harshan Seliyan"
    assert card["entity_type"] == "person"
    assert len(card.get("relations", [])) >= 1

    # Query Company Entity
    hs_company = await knowledge_graph.get_entity_card("HS AI Solutions")
    assert hs_company is not None

    # Query NVIDIA Entity
    nvidia_card = await knowledge_graph.get_entity_card("NVIDIA")
    assert nvidia_card is not None
    assert any(r.get("relation_type") == "PRODUCES" for r in nvidia_card.get("relations", []))

@pytest.mark.asyncio
async def test_entity_extractor():
    sample_text = "NVIDIA released Blackwell architecture for accelerating AI models."
    count = await entity_extractor.process_document_entities("GPU News", sample_text, "https://example.com/gpu")
    assert count >= 1
