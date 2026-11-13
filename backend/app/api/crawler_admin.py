"""
Crawler Administration & Discovery Engine API
Company: HS AI Solutions
"""

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, HttpUrl
from typing import List, Dict, Any, Optional
from app.crawler.engine import crawler
from app.crawler.frontier import frontier
from app.database.connection import db
from app.database.models import QueueItem
from datetime import datetime
import urllib.parse

router = APIRouter(prefix="/api/crawler", tags=["Crawler Admin"])

class SeedRequest(BaseModel):
    urls: List[str]
    priority: int = 3
    depth: int = 0

class CrawlNowRequest(BaseModel):
    url: str

@router.get("/status")
async def get_crawler_status():
    """Retrieve operational state and real-time statistics of the crawler."""
    metrics = await db.get_metrics()
    return {
        "is_running": crawler.is_running,
        "stats": crawler._stats,
        "queue_size": metrics["queue_size"],
        "indexed_webpages": metrics["indexed_webpages"],
        "total_domains": metrics["total_discovered_domains"]
    }

@router.post("/start")
async def start_crawler():
    """Start the autonomous web crawler background loop."""
    await crawler.start()
    return {"status": "started", "message": "Autonomous web crawler is now running."}

@router.post("/stop")
async def stop_crawler():
    """Stop the autonomous web crawler."""
    await crawler.stop()
    return {"status": "stopped", "message": "Autonomous web crawler has been stopped."}

@router.post("/seed")
async def seed_crawler(payload: SeedRequest):
    """
    Enqueue seed URLs or domains to start discovery and crawling.
    """
    valid_items: List[QueueItem] = []
    now = datetime.utcnow()

    for url in payload.urls:
        parsed = urllib.parse.urlparse(url)
        if not parsed.scheme:
            url = "https://" + url
            parsed = urllib.parse.urlparse(url)

        domain = parsed.netloc.lower()
        if not domain:
            continue

        await db.get_or_create_domain(domain)
        valid_items.append(QueueItem(
            url=url,
            domain=domain,
            depth=payload.depth,
            priority=payload.priority,
            status="pending",
            scheduled_for=now,
            discovered_at=now,
            referrer="seed_injection"
        ))

    if valid_items:
        added = await db.enqueue_urls(valid_items)
        # Ensure crawler is started if stopped
        if not crawler.is_running:
            await crawler.start()
        return {"status": "success", "added_to_queue": added, "urls": [i.url for i in valid_items]}
    else:
        raise HTTPException(status_code=400, detail="No valid URLs provided in seed request.")

@router.post("/crawl-now")
async def crawl_url_now(payload: CrawlNowRequest):
    """Immediately crawl, extract, and index a specific URL on demand."""
    try:
        result = await crawler.crawl_single_url_now(payload.url)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to crawl URL: {str(e)}")

@router.get("/queue")
async def inspect_queue(limit: int = 50):
    """View top items currently scheduled in the crawl queue."""
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            """SELECT * FROM crawl_queue 
               ORDER BY priority ASC, scheduled_for ASC 
               LIMIT ?""",
            (limit,)
        )
        rows = [dict(r) for r in await cursor.fetchall()]
    return {"queue_length": len(rows), "items": rows}
