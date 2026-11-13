"""
Knowledge Graph API Router
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

from fastapi import APIRouter, HTTPException, Query
from app.knowledge.graph import knowledge_graph

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge Graph"])

@router.get("/entity/{name}")
async def get_entity(name: str):
    """Retrieve full entity card with relationships and provenance."""
    card = await knowledge_graph.get_entity_card(name)
    if not card:
        raise HTTPException(status_code=404, detail=f"Entity '{name}' not found in knowledge graph.")
    return card

@router.get("/search")
async def search_entities(q: str = Query(..., min_length=1)):
    """Search knowledge graph entities."""
    matches = await knowledge_graph.search_graph(q)
    return {"query": q, "count": len(matches), "entities": matches}
