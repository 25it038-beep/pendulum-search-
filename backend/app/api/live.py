"""
HS Live API Router
Company: HS AI Solutions
"""

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, HttpUrl
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.database.connection import db
from app.database.models import LiveFeedRecord
from app.live.rss_monitor import live_monitor
from app.indexer.pipeline import indexing_pipeline
from app.crawler.extractor import compute_simhash
import hashlib

router = APIRouter(prefix="/api/live", tags=["HS Live"])

class AddFeedRequest(BaseModel):
    name: str
    feed_url: str
    feed_type: str = "rss"
    category: str = "news"
    interval_sec: int = 30
    priority_level: str = "regular" # critical (1s), high (5s), regular (30s), adaptive

class WebhookPayload(BaseModel):
    title: str
    url: str
    content: str
    domain: Optional[str] = None
    author: Optional[str] = None
    category: str = "news"

@router.get("/feeds")
async def list_live_feeds():
    """List all configured live data streams with their actual last-checked and last-updated timestamps."""
    feeds = await db.get_active_feeds()
    return {
        "subsystem": "HS Live",
        "is_active": live_monitor.is_running,
        "total_active_feeds": len(feeds),
        "feeds": [f.model_dump() for f in feeds]
    }

@router.post("/feeds/add")
async def add_feed(payload: AddFeedRequest):
    """Add a new RSS / Atom feed to the continuous real-time monitor."""
    feed_record = LiveFeedRecord(
        name=payload.name,
        feed_url=payload.feed_url,
        feed_type=payload.feed_type,
        category=payload.category,
        interval_sec=payload.interval_sec,
        priority_level=payload.priority_level,
        is_active=True
    )
    feed_id = await db.add_or_update_feed(feed_record)
    return {"status": "success", "feed_id": feed_id, "name": payload.name}

@router.get("/stream")
async def get_live_stream():
    """Get recent real-time stream of documents indexed by HS Live."""
    events = live_monitor.get_recent_live_events()
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "count": len(events),
        "events": events
    }

@router.post("/webhook")
async def receive_webhook(payload: WebhookPayload):
    """
    Event-driven ingestion endpoint. Immediately indexes breaking updates pushed via webhook.
    """
    import urllib.parse
    domain = payload.domain or urllib.parse.urlparse(payload.url).netloc.lower()
    content_hash = hashlib.sha256((payload.title + payload.content).encode("utf-8")).hexdigest()
    simhash = compute_simhash(payload.content)

    doc_data = {
        "url": payload.url,
        "domain": domain,
        "title": payload.title,
        "snippet": payload.content[:240],
        "content_text": payload.content,
        "content_hash": content_hash,
        "simhash": simhash,
        "published_at": datetime.utcnow(),
        "is_live": True,
        "source_type": "webhook",
        "quality_score": 0.90,
        "credibility_score": 0.85
    }

    doc_id, action = await indexing_pipeline.index_document(doc_data)
    return {
        "status": "indexed",
        "doc_id": doc_id,
        "action": action,
        "title": payload.title,
        "received_at": datetime.utcnow().isoformat()
    }
