"""
Monitoring and System Metrics API for HS SEARCH
Company: HS AI Solutions
"""

from fastapi import APIRouter
from app.database.connection import db
from app.crawler.engine import crawler
from app.live.rss_monitor import live_monitor

router = APIRouter(prefix="/api/monitor", tags=["System Monitoring"])

@router.get("/metrics")
async def get_system_metrics():
    """
    Self-monitoring infrastructure metrics:
    - Discovered domains & URLs
    - Indexed webpages count
    - Modified webpages detected
    - Crawling requests/sec, Indexing ops/sec
    - Crawl queue size
    - Average search response time
    - Live feed status
    """
    db_metrics = await db.get_metrics()
    feeds = await db.get_active_feeds()

    return {
        "status": "healthy",
        "crawler_running": crawler.is_running,
        "live_monitor_running": live_monitor.is_running,
        "metrics": db_metrics,
        "live_feeds_count": len(feeds),
        "crawler_stats": crawler._stats
    }

@router.get("/logs")
async def get_system_logs(limit: int = 50):
    """Retrieve recent real-time crawler and indexer event logs."""
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            """SELECT * FROM crawler_logs 
               ORDER BY id DESC LIMIT ?""",
            (limit,)
        )
        logs = [dict(r) for r in await cursor.fetchall()]
    return {"total": len(logs), "logs": logs}
