"""
HS MegaCrawler Ecosystem Manager
Coordinates the 15 Specialized Crawlers, Autonomous Discovery Engine,
Self-Optimization Analyzer, Frontier Seeding, and Telemetry Aggregation.
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

from app.config import settings
from app.database.connection import db
from app.megacrawler.models import CrawlerType, CrawlerStatus, CrawlerServiceStats
from app.megacrawler.frontier import frontier
from app.megacrawler.discovery_engine import discovery_engine
from app.megacrawler.optimizer import crawler_optimizer
from app.megacrawler.storage import object_storage
from app.megacrawler.crawlers.specialized import (
    WebCrawler, NewsCrawler, ResearchCrawler, TechCrawler,
    CodeCrawler, DocCrawler, GovCrawler, ScienceCrawler,
    LiveCrawler, ImageCrawler, VideoCrawler, DiscoveryCrawler,
    RefreshCrawler, DeepCrawler, ApiCrawler,
    HTMLCrawler, JavaScriptCrawler, PDFCrawler, DocumentCrawler,
    ImageMetadataCrawler, VideoMetadataCrawler, AudioMetadataCrawler,
    APIDataCrawler, RSSCrawler, SitemapCrawler, DatasetCrawler,
    DeepDiscoveryCrawler
)

class MegaCrawlerEcosystem:
    def __init__(self):
        # 13 Universal Resource-Based Worker Fleet + 15 Specialized Domain Crawlers
        self.crawlers: Dict[str, Any] = {
            # 13 Universal Resource-Based Worker Fleet
            "HTMLCrawler": HTMLCrawler(),
            "JavaScriptCrawler": JavaScriptCrawler(),
            "PDFCrawler": PDFCrawler(),
            "DocumentCrawler": DocumentCrawler(),
            "ImageMetadataCrawler": ImageMetadataCrawler(),
            "VideoMetadataCrawler": VideoMetadataCrawler(),
            "AudioMetadataCrawler": AudioMetadataCrawler(),
            "APIDataCrawler": APIDataCrawler(),
            "RSSCrawler": RSSCrawler(),
            "SitemapCrawler": SitemapCrawler(),
            "DatasetCrawler": DatasetCrawler(),
            "DeepDiscoveryCrawler": DeepDiscoveryCrawler(),
            "RefreshCrawler": RefreshCrawler(),

            # 15 Domain & Category Specialized Crawlers
            CrawlerType.WEB.value: WebCrawler(),
            CrawlerType.NEWS.value: NewsCrawler(),
            CrawlerType.RESEARCH.value: ResearchCrawler(),
            CrawlerType.TECH.value: TechCrawler(),
            CrawlerType.CODE.value: CodeCrawler(),
            CrawlerType.DOC.value: DocCrawler(),
            CrawlerType.GOV.value: GovCrawler(),
            CrawlerType.SCIENCE.value: ScienceCrawler(),
            CrawlerType.LIVE.value: LiveCrawler(),
            CrawlerType.IMAGE.value: ImageCrawler(),
            CrawlerType.VIDEO.value: VideoCrawler(),
            CrawlerType.DISCOVERY.value: DiscoveryCrawler(),
            CrawlerType.REFRESH.value: RefreshCrawler(),
            CrawlerType.DEEP.value: DeepCrawler(),
            CrawlerType.API.value: ApiCrawler(),
        }
        self.resource_crawlers: Dict[str, Any] = {
            k: v for k, v in self.crawlers.items() if not k.startswith("HS-")
        }
        self._running = False
        self._telemetry_task: Optional[asyncio.Task] = None

    async def initialize(self):
        """Initialize frontier and seed initial URLs for all 15 specialized crawlers."""
        await frontier.initialize()
        await self._seed_initial_frontier()
        await discovery_engine.start()
        await crawler_optimizer.start()

    async def _seed_initial_frontier(self):
        """Seed verified high-authority entry points into the distributed frontier."""
        seed_targets = [
            # 1. Web
            ("https://en.wikipedia.org/wiki/Portal:Contents", CrawlerType.WEB.value, 5),
            ("https://www.w3.org/", CrawlerType.WEB.value, 5),
            # 2. News
            ("https://feeds.bbci.co.uk/news/rss.xml", CrawlerType.NEWS.value, 2),
            ("https://news.ycombinator.com/rss", CrawlerType.NEWS.value, 2),
            # 3. Research
            ("https://rss.arxiv.org/rss/cs.AI", CrawlerType.RESEARCH.value, 3),
            ("https://api.openalex.org/works?per-page=10", CrawlerType.RESEARCH.value, 3),
            # 4. Tech
            ("https://techcrunch.com/feed/", CrawlerType.TECH.value, 3),
            ("https://arstechnica.com/feed/", CrawlerType.TECH.value, 3),
            # 5. Code
            ("https://github.com/trending", CrawlerType.CODE.value, 4),
            ("https://docs.python.org/3/library/index.html", CrawlerType.CODE.value, 4),
            # 6. Docs
            ("https://developer.mozilla.org/en-US/docs/Web", CrawlerType.DOC.value, 4),
            ("https://fastapi.tiangolo.com/tutorial/", CrawlerType.DOC.value, 4),
            # 7. Gov
            ("https://data.gov/", CrawlerType.GOV.value, 4),
            ("https://www.gov.uk/", CrawlerType.GOV.value, 4),
            # 8. Science
            ("https://sciencedaily.com/rss/all.xml", CrawlerType.SCIENCE.value, 3),
            ("https://ocw.mit.edu/", CrawlerType.SCIENCE.value, 3),
            # 9. Live
            ("https://news.ycombinator.com/newest", CrawlerType.LIVE.value, 1),
            # 10. Image
            ("https://commons.wikimedia.org/wiki/Featured_pictures", CrawlerType.IMAGE.value, 6),
            # 11. Video
            ("https://www.ted.com/talks", CrawlerType.VIDEO.value, 6),
            # 12. Discovery
            ("https://commoncrawl.org/the-data/get-started/", CrawlerType.DISCOVERY.value, 5),
            # 13. Refresh (Conditional validation on indexed pages)
            ("https://en.wikipedia.org/wiki/Artificial_intelligence", CrawlerType.REFRESH.value, 3),
            # 14. Deep (Multi-level subtree crawler)
            ("https://en.wikipedia.org/wiki/Quantum_computing", CrawlerType.DEEP.value, 4),
            # 15. API (Authorized public open endpoints)
            ("https://api.openalex.org/works?per-page=5", CrawlerType.API.value, 3),
        ]

        for url, crawler_type, prio in seed_targets:
            try:
                await frontier.enqueue_url(
                    url=url,
                    crawler_type=crawler_type,
                    priority=prio,
                    depth=0
                )
            except Exception:
                pass

    async def start_all(self):
        """Start all 15 specialized crawlers."""
        if self._running:
            return
        self._running = True
        for crawler in self.crawlers.values():
            await crawler.start()
        self._telemetry_task = asyncio.create_task(self._telemetry_loop())

    async def stop_all(self):
        """Stop all 15 specialized crawlers, discovery engine, and optimizer."""
        self._running = False
        if self._telemetry_task:
            self._telemetry_task.cancel()
        await discovery_engine.stop()
        await crawler_optimizer.stop()
        for crawler in self.crawlers.values():
            await crawler.stop()

    async def pause_crawler(self, crawler_type: str) -> bool:
        if crawler_type in self.crawlers:
            await self.crawlers[crawler_type].pause()
            return True
        return False

    async def resume_crawler(self, crawler_type: str) -> bool:
        if crawler_type in self.crawlers:
            await self.crawlers[crawler_type].resume()
            return True
        return False

    async def set_concurrency(self, crawler_type: str, limit: int) -> bool:
        if crawler_type in self.crawlers:
            self.crawlers[crawler_type].config.concurrency_limit = max(1, min(limit, 30))
            return True
        return False

    async def _telemetry_loop(self):
        """Periodically persist aggregated telemetry and calculate compute cost."""
        while self._running:
            try:
                await asyncio.sleep(15.0)
                now_iso = datetime.now(timezone.utc).isoformat()

                async with db.get_connection() as conn:
                    for c_type, crawler in self.crawlers.items():
                        stats = crawler.stats
                        hours = 15.0 / 3600.0
                        worker_count = max(1, stats.active_workers)
                        cost = round(worker_count * hours * settings.MEGACRAWLER_COST_PER_COMPUTE_HOUR_USD, 5)
                        stats.cost_est_usd += cost

                        await conn.execute(
                            """INSERT INTO megacrawler_metrics (
                                timestamp, crawler_type, active_workers, queue_length,
                                urls_discovered, urls_downloaded, pages_indexed, pages_updated,
                                duplicates_rejected, failed_requests, avg_latency_ms, bandwidth_kbps, cost_est_usd
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (
                                now_iso, c_type, stats.active_workers, stats.queue_length,
                                stats.urls_discovered, stats.urls_downloaded, stats.pages_indexed,
                                stats.pages_updated, stats.duplicates_rejected, stats.failed_requests,
                                stats.avg_latency_ms, stats.bandwidth_kbps, stats.cost_est_usd
                            )
                        )
                    await conn.commit()
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(15.0)

    async def get_ecosystem_overview(self) -> Dict[str, Any]:
        """Aggregate real-time metrics across all 15 crawler services."""
        total_discovered = 0
        total_downloaded = 0
        total_indexed = 0
        total_updated = 0
        total_duplicates = 0
        total_failed = 0
        total_active_workers = 0
        total_queue_length = 0
        total_cost_usd = 0.0
        crawler_details: List[Dict[str, Any]] = []

        for c_type, crawler in self.crawlers.items():
            stats = crawler.stats
            total_discovered += stats.urls_discovered
            total_downloaded += stats.urls_downloaded
            total_indexed += stats.pages_indexed
            total_updated += stats.pages_updated
            total_duplicates += stats.duplicates_rejected
            total_failed += stats.failed_requests
            total_active_workers += stats.active_workers
            total_queue_length += stats.queue_length
            total_cost_usd += stats.cost_est_usd

            crawler_details.append({
                "crawler_type": stats.crawler_type.value,
                "name": stats.name,
                "description": crawler.config.description,
                "status": stats.status.value,
                "active_workers": stats.active_workers,
                "queue_length": stats.queue_length,
                "urls_discovered": stats.urls_discovered,
                "urls_downloaded": stats.urls_downloaded,
                "pages_indexed": stats.pages_indexed,
                "pages_updated": stats.pages_updated,
                "duplicates_rejected": stats.duplicates_rejected,
                "failed_requests": stats.failed_requests,
                "avg_latency_ms": stats.avg_latency_ms,
                "bandwidth_kbps": stats.bandwidth_kbps,
                "cost_est_usd": round(stats.cost_est_usd, 4),
                "concurrency_limit": crawler.config.concurrency_limit,
                "priority": crawler.config.priority
            })

        cost_per_1000 = (
            round((total_cost_usd / total_indexed) * 1000.0, 4)
            if total_indexed > 0 else 0.025
        )

        return {
            "engine": "HS MegaCrawler",
            "company": "HS AI Solutions",
            "founder": "Harshan Seliyan",
            "status": "operational" if self._running else "idle",
            "crawler_count": len(self.crawlers),
            "summary": {
                "active_workers": total_active_workers,
                "total_queue_length": total_queue_length,
                "urls_discovered": total_discovered,
                "urls_downloaded": total_downloaded,
                "pages_indexed": total_indexed,
                "pages_updated": total_updated,
                "duplicates_rejected": total_duplicates,
                "failed_requests": total_failed,
                "total_cost_est_usd": round(total_cost_usd, 4),
                "cost_per_1000_pages_usd": cost_per_1000
            },
            "discovery_engine": discovery_engine.get_discovery_stats(),
            "storage": object_storage.get_storage_stats(),
            "self_optimization": crawler_optimizer.get_optimization_report(),
            "crawlers": crawler_details
        }

megacrawler_ecosystem = MegaCrawlerEcosystem()
