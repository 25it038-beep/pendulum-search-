"""
Autonomous Discovery Intelligence API
Company: HS AI Solutions
"""

from fastapi import APIRouter
from app.discovery.intelligence import discovery_intelligence
from app.database.connection import db

router = APIRouter(prefix="/api/discovery", tags=["Discovery Intelligence"])

@router.get("/gaps")
async def get_discovery_gaps():
    """Retrieve search queries and topics with coverage gaps identified by discovery intelligence."""
    gaps = await db.get_discovery_gaps()
    return {
        "total_gaps": len(gaps),
        "gaps": gaps
    }

@router.get("/coverage")
async def get_knowledge_coverage():
    """Retrieve global knowledge coverage breakdown across primary categories."""
    breakdown = await discovery_intelligence.get_coverage_breakdown()
    return {
        "categories": breakdown,
        "total_documents": sum(breakdown.values())
    }
