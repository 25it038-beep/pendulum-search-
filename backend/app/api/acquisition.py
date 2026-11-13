"""
Autonomous Multi-Source Information Acquisition API
Company: HS AI Solutions
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.acquisition.manager import acquisition_manager
from app.database.connection import db

router = APIRouter(prefix="/api/acquisition", tags=["Information Acquisition"])

class TriggerRequest(BaseModel):
    connector: str
    limit: int = 10

class IndexNowSubmission(BaseModel):
    host: str
    urlList: List[str]
    key: Optional[str] = None

@router.get("/sources")
async def list_sources():
    """List all registered acquisition sources and their crawl status."""
    sources = await db.get_sources()
    return {
        "total_sources": len(sources),
        "sources": sources,
        "manager_stats": acquisition_manager._stats
    }

@router.post("/trigger")
async def trigger_connector(payload: TriggerRequest):
    """Trigger an acquisition connector on demand."""
    res = await acquisition_manager.run_connector(payload.connector, limit=payload.limit)
    return res

@router.post("/indexnow")
async def receive_indexnow(payload: IndexNowSubmission):
    """Receive publisher submission via IndexNow protocol."""
    conn = acquisition_manager.connectors.get("indexnow")
    if not conn:
        raise HTTPException(status_code=500, detail="IndexNow connector not registered")
    
    count = conn.receive_submission(payload.host, payload.urlList, payload.key)
    return {
        "status": "success",
        "enqueued_urls": count,
        "host": payload.host
    }
