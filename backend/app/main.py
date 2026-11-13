"""
HS SEARCH - Backend Main Application
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.database.connection import db
from app.database.models import LiveFeedRecord, QueueItem
from app.crawler.engine import crawler
from app.live.rss_monitor import live_monitor
from app.indexer.opensearch_adapter import opensearch_adapter
from app.indexer.qdrant_adapter import qdrant_adapter

# Routers
from app.api.search import router as search_router
from app.api.crawler_admin import router as crawler_router
from app.api.live import router as live_router
from app.api.monitor import router as monitor_router
from app.api.websocket import router as ws_router
from app.api.knowledge import router as knowledge_router
from app.api.acquisition import router as acquisition_router
from app.api.discovery import router as discovery_router
from app.api.system import router as system_router
from app.api.megacrawler import router as megacrawler_router
from app.api.geo import router as geo_router
from app.api.stream import router as stream_router
from app.api.nvidia_admin import router as nvidia_admin_router
from app.api.media_search import router as media_search_router
from app.api.ai_overview import router as ai_overview_router
from app.api.hybrid_search import router as hybrid_search_router

# Autonomous Knowledge & Supervisor Systems
from app.knowledge.graph import knowledge_graph
from app.acquisition.registry import seed_source_registry
from app.acquisition.manager import acquisition_manager
from app.discovery.intelligence import discovery_intelligence
from app.supervisor.health_monitor import health_supervisor
from app.megacrawler.ecosystem import megacrawler_ecosystem

# Default Verified Seed Feeds
DEFAULT_FEEDS = [
    {
        "name": "Hacker News Frontpage",
        "feed_url": "https://news.ycombinator.com/rss",
        "feed_type": "rss",
        "category": "tech",
        "interval_sec": 15,
        "priority_level": "high"
    },
    {
        "name": "TechCrunch Latest",
        "feed_url": "https://techcrunch.com/feed/",
        "feed_type": "rss",
        "category": "tech",
        "interval_sec": 30,
        "priority_level": "regular"
    },
    {
        "name": "BBC News Top Stories",
        "feed_url": "https://feeds.bbci.co.uk/news/rss.xml",
        "feed_type": "rss",
        "category": "news",
        "interval_sec": 30,
        "priority_level": "regular"
    },
    {
        "name": "ArXiv Computer Science & AI",
        "feed_url": "https://rss.arxiv.org/rss/cs.AI",
        "feed_type": "rss",
        "category": "academic",
        "interval_sec": 60,
        "priority_level": "regular"
    },
    {
        "name": "MIT Technology Review",
        "feed_url": "https://www.technologyreview.com/feed/",
        "feed_type": "rss",
        "category": "tech",
        "interval_sec": 60,
        "priority_level": "regular"
    }
]

# Initial Seed URLs for Crawl Frontier
INITIAL_SEEDS = [
    "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "https://en.wikipedia.org/wiki/Search_engine",
    "https://docs.python.org/3/",
    "https://news.ycombinator.com/",
    "https://techcrunch.com/"
]

async def seed_initial_infrastructure():
    """Seed real-world feeds and initial crawl targets so the engine is immediately operational."""
    # Seed live feeds
    for f in DEFAULT_FEEDS:
        try:
            feed_obj = LiveFeedRecord(**f)
            await db.add_or_update_feed(feed_obj)
        except Exception:
            pass

    # Seed initial URLs into frontier
    now = datetime.utcnow()
    seed_items = []
    for url in INITIAL_SEEDS:
        import urllib.parse
        domain = urllib.parse.urlparse(url).netloc.lower()
        await db.get_or_create_domain(domain)
        seed_items.append(QueueItem(
            url=url,
            domain=domain,
            depth=0,
            priority=1,
            status="pending",
            scheduled_for=now,
            discovered_at=now,
            referrer="initial_seed"
        ))
    if seed_items:
        await db.enqueue_urls(seed_items)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await db.init_db()
    
    # Check adapters
    opensearch_adapter.connect()
    qdrant_adapter.connect()

    # Seed initial infrastructure & Knowledge Graph & Sources
    await seed_initial_infrastructure()
    await knowledge_graph.init_seed_graph()
    await seed_source_registry()

    # Start Autonomous Crawler and HS Live monitor
    await crawler.start()
    await live_monitor.start()

    # Start Multi-source Acquisition, Discovery Intelligence & Self-Healing Supervisor
    await acquisition_manager.start()
    await discovery_intelligence.start()
    await health_supervisor.start()

    # Start HS MegaCrawler Ecosystem
    await megacrawler_ecosystem.initialize()
    await megacrawler_ecosystem.start_all()

    yield

    # Shutdown
    await megacrawler_ecosystem.stop_all()
    await crawler.stop()
    await live_monitor.stop()
    await acquisition_manager.stop()
    await discovery_intelligence.stop()
    await health_supervisor.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=f"{settings.TAGLINE}\n\n**Company:** {settings.COMPANY} | **Founder:** {settings.FOUNDER}",
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(search_router)
app.include_router(crawler_router)
app.include_router(live_router)
app.include_router(monitor_router)
app.include_router(ws_router)
app.include_router(knowledge_router)
app.include_router(acquisition_router)
app.include_router(discovery_router)
app.include_router(system_router)
app.include_router(megacrawler_router)
app.include_router(geo_router)
app.include_router(stream_router)
app.include_router(nvidia_admin_router)
app.include_router(media_search_router)
app.include_router(ai_overview_router)
app.include_router(hybrid_search_router)

STATIC_DIR = Path(__file__).resolve().parent / "static"
PENDULUM_HTML_PATH = STATIC_DIR / "pendulum.html"

@app.get("/")
async def root(request: Request):
    accept = request.headers.get("accept", "")
    if "text/html" in accept and PENDULUM_HTML_PATH.exists():
        return FileResponse(PENDULUM_HTML_PATH, media_type="text/html")
    return {
        "engine": settings.PROJECT_NAME,
        "tagline": settings.TAGLINE,
        "company": settings.COMPANY,
        "founder": settings.FOUNDER,
        "version": settings.VERSION,
        "status": "operational",
        "documentation": "/docs",
        "frontend": "/pendulum"
    }

@app.get("/pendulum", response_class=HTMLResponse)
@app.get("/pendulum/", response_class=HTMLResponse)
async def pendulum_page():
    if PENDULUM_HTML_PATH.exists():
        return FileResponse(PENDULUM_HTML_PATH, media_type="text/html")
    return HTMLResponse("<h1>Pendulum Search - Static file not found</h1>")

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
