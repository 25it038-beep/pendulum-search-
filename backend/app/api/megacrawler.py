"""
HS MegaCrawler API Endpoints
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

from fastapi import APIRouter, HTTPException, Query, Body
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from app.megacrawler.ecosystem import megacrawler_ecosystem
from app.megacrawler.models import JulyCrawlRequest, BenchmarkReport, CrawlerType
from app.megacrawler.scaling import worker_scaler
from app.megacrawler.benchmark import crawler_benchmark
from app.megacrawler.july_integration import july_gateway
from app.megacrawler.frontier import frontier
from app.megacrawler.discovery_engine import discovery_engine
from app.megacrawler.storage import object_storage
from app.megacrawler.optimizer import crawler_optimizer
from app.database.connection import db

router = APIRouter(prefix="/api/megacrawler", tags=["HS MegaCrawler Ecosystem"])

class EnqueueURLRequest(BaseModel):
    url: str
    crawler_type: str = CrawlerType.WEB.value
    priority: Optional[int] = None
    depth: int = 0
    discovery_source: str = "manual"

class IndexNowRequest(BaseModel):
    host: str
    urlList: List[str]
    key: Optional[str] = None
    keyLocation: Optional[str] = None

class JulySearchQuery(BaseModel):
    query: str
    mode: str = "fast"  # fast, deep, research, live, technical
    max_results: int = 10

@router.get("/ecosystem")
async def get_ecosystem_status() -> Dict[str, Any]:
    """Get real-time operational status, throughput, and stats across all 15 specialized crawlers."""
    return await megacrawler_ecosystem.get_ecosystem_overview()

@router.get("/workers")
async def get_active_workers() -> List[Dict[str, Any]]:
    """List distributed workers and their real-time heartbeats and memory stats."""
    await worker_scaler.prune_stale_workers()
    workers: List[Dict[str, Any]] = []
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            """SELECT worker_id, crawler_type, status, current_url, urls_processed,
                      bytes_downloaded, cpu_percent, memory_mb, registered_at, last_heartbeat
               FROM megacrawler_workers
               ORDER BY last_heartbeat DESC LIMIT 50"""
        )
        for r in await cursor.fetchall():
            workers.append({
                "worker_id": r["worker_id"],
                "crawler_type": r["crawler_type"],
                "status": r["status"],
                "current_url": r["current_url"],
                "urls_processed": r["urls_processed"],
                "bytes_downloaded": r["bytes_downloaded"],
                "cpu_percent": r["cpu_percent"],
                "memory_mb": r["memory_mb"],
                "registered_at": r["registered_at"],
                "last_heartbeat": r["last_heartbeat"]
            })
    return workers

@router.post("/control")
async def control_crawler(
    crawler_type: str = Query(..., description="Target crawler service name"),
    action: str = Query(..., description="Action: pause, resume, concurrency"),
    concurrency_limit: Optional[int] = Query(None, description="New concurrency limit (1-30)")
) -> Dict[str, Any]:
    """Pause, resume, or adjust concurrency for a specific crawler in the ecosystem."""
    if action == "pause":
        success = await megacrawler_ecosystem.pause_crawler(crawler_type)
        return {"status": "success" if success else "not_found", "action": "pause", "crawler": crawler_type}
    elif action == "resume":
        success = await megacrawler_ecosystem.resume_crawler(crawler_type)
        return {"status": "success" if success else "not_found", "action": "resume", "crawler": crawler_type}
    elif action == "concurrency" and concurrency_limit:
        success = await megacrawler_ecosystem.set_concurrency(crawler_type, concurrency_limit)
        return {"status": "success" if success else "not_found", "concurrency": concurrency_limit}
    else:
        raise HTTPException(status_code=400, detail="Invalid action or parameters")

@router.post("/request-crawl")
async def request_targeted_crawl(req: JulyCrawlRequest) -> Dict[str, Any]:
    """Controlled entrypoint for July LLM to request targeted acquisition."""
    return await july_gateway.submit_targeted_crawl(req)

@router.post("/july-search")
async def execute_july_search_endpoint(req: JulySearchQuery) -> Dict[str, Any]:
    """
    Execute unified July LLM search across 5 distinct search modes:
    fast, deep, research, live, or technical.
    Strictly verifies citations and prevents fabricated sources.
    """
    return await july_gateway.execute_july_search(
        query=req.query,
        search_mode=req.mode,
        max_results=req.max_results
    )

@router.get("/frontier")
async def get_frontier_status() -> Dict[str, Any]:
    """Inspect frontier tasks and priority queues."""
    recent_tasks = await frontier.get_recent_tasks(limit=30)
    total_queue = await frontier.get_queue_length()
    return {
        "total_pending_tasks": total_queue,
        "recent_tasks": recent_tasks
    }

@router.post("/frontier/enqueue")
async def enqueue_url_endpoint(req: EnqueueURLRequest) -> Dict[str, Any]:
    """Enqueue a new URL into the distributed frontier with intelligent priority calculation."""
    enqueued, reason = await frontier.enqueue_url(
        url=req.url,
        crawler_type=req.crawler_type,
        priority=req.priority,
        depth=req.depth,
        discovery_source=req.discovery_source
    )
    return {
        "status": "enqueued" if enqueued else "rejected",
        "url": req.url,
        "crawler_type": req.crawler_type,
        "reason": reason
    }

@router.get("/discovery")
async def get_discovery_engine_status() -> Dict[str, Any]:
    """Retrieve Autonomous Web Discovery Engine metrics and channels."""
    return discovery_engine.get_discovery_stats()

@router.post("/indexnow")
async def process_indexnow_notification(payload: IndexNowRequest) -> Dict[str, Any]:
    """Receive and process IndexNow URL submission pings from publishers."""
    return await discovery_engine.discover_from_indexnow(
        host=payload.host,
        url_list=payload.urlList,
        key=payload.key
    )

@router.get("/storage")
async def get_storage_metrics() -> Dict[str, Any]:
    """Retrieve document retention and compression metrics."""
    return object_storage.get_storage_stats()

@router.get("/optimizer")
async def get_optimizer_report() -> Dict[str, Any]:
    """Retrieve crawler self-optimization tuning analytics and history."""
    return crawler_optimizer.get_optimization_report()

@router.post("/optimizer/tune")
async def trigger_optimizer_cycle() -> Dict[str, Any]:
    """Trigger an on-demand self-optimization tuning cycle."""
    actions = await crawler_optimizer.run_optimization_cycle()
    return {
        "status": "completed",
        "actions_taken": [a.model_dump() for a in actions]
    }

@router.get("/benchmark")
async def run_benchmark(
    duration_sec: int = Query(5, ge=3, le=30, description="Benchmark sampling duration in seconds")
) -> BenchmarkReport:
    """Run an autonomous performance benchmark measuring pages/hour, latency, and cost."""
    return await crawler_benchmark.run_live_benchmark(duration_sec)

@router.get("/scaling")
async def get_scaling_telemetry() -> Dict[str, Any]:
    """Retrieve dynamic queue-based worker scaling metrics."""
    overview = await megacrawler_ecosystem.get_ecosystem_overview()
    queue_len = overview["summary"]["total_queue_length"]
    failed = overview["summary"]["failed_requests"]
    downloaded = overview["summary"]["urls_downloaded"]
    error_rate = (failed / max(1, downloaded + failed)) if (downloaded + failed) > 0 else 0.0

    return await worker_scaler.compute_target_workers(queue_len, error_rate)
