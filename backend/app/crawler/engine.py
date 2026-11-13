"""
Autonomous Distributed Web Crawler Engine for HS SEARCH
Company: HS AI Solutions
"""

import asyncio
import aiohttp
import logging
import urllib.parse
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from app.config import settings
from app.database.connection import db
from app.database.models import QueueItem
from app.crawler.robots import robots_manager
from app.crawler.extractor import extract_content, normalize_url
from app.crawler.frontier import frontier
from app.crawler.sitemap import sitemap_parser
from app.indexer.pipeline import indexing_pipeline

logger = logging.getLogger(__name__)

class CrawlerEngine:
    def __init__(self):
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._workers: List[asyncio.Task] = []
        self._stats = {
            "requests_total": 0,
            "requests_success": 0,
            "requests_failed": 0,
            "links_discovered": 0,
            "start_time": None
        }

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=settings.CRAWLER_REQUEST_TIMEOUT_SEC)
            connector = aiohttp.TCPConnector(limit=settings.CRAWLER_MAX_CONCURRENCY, ssl=False)
            self._session = aiohttp.ClientSession(
                timeout=timeout,
                connector=connector,
                headers={"User-Agent": settings.USER_AGENT}
            )
        return self._session

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        self._stats["start_time"] = datetime.utcnow()
        logger.info("Starting HS Autonomous Web Crawler...")
        await db.log_event("crawl", "HS Autonomous Web Crawler started", "INFO")
        self._task = asyncio.create_task(self._coordinator_loop())

    async def stop(self):
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
        for w in self._workers:
            if not w.done():
                w.cancel()
        if self._session and not self._session.closed:
            await self._session.close()
        logger.info("HS Crawler stopped.")
        await db.log_event("crawl", "HS Crawler stopped", "INFO")

    async def _coordinator_loop(self):
        """Main coordinator that pulls batches from the queue and distributes across workers."""
        while self.is_running:
            try:
                # Fetch pending items from queue
                pending_items = await db.fetch_pending_queue(limit=settings.CRAWLER_MAX_CONCURRENCY)

                if not pending_items:
                    # Queue is empty, pause briefly before checking again
                    await asyncio.sleep(2.0)
                    continue

                # Run worker tasks concurrently
                tasks = [self._process_queue_item(item) for item in pending_items]
                await asyncio.gather(*tasks, return_exceptions=True)

                await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in crawler coordinator loop: {e}")
                await asyncio.sleep(2.0)

    async def _process_queue_item(self, item: QueueItem):
        session = await self.get_session()
        domain = item.domain
        url = item.url

        try:
            # 1. Robots.txt check
            if settings.RESPECT_ROBOTS_TXT:
                allowed, crawl_delay, sitemaps = await robots_manager.can_fetch(url, session)
                if not allowed:
                    await db.update_queue_status(item.id, "disallowed")
                    await db.log_event("crawl", f"Blocked by robots.txt: {url}", "WARNING", url=url)
                    return

                # Check domain politeness rate limit
                can_crawl = await frontier.can_crawl_domain_now(domain, crawl_delay)
                if not can_crawl:
                    # Delay item: put back to pending with short wait
                    await db.update_queue_status(item.id, "pending")
                    return

                # If sitemaps discovered, parse in background
                if sitemaps:
                    asyncio.create_task(self._process_discovered_sitemaps(sitemaps, session, domain))

            # Record crawl timestamp for domain
            await frontier.record_crawl(domain)

            # 2. Fetch page content
            self._stats["requests_total"] += 1
            async with session.get(
                url,
                allow_redirects=True,
                headers={"Accept": "text/html,application/xhtml+xml"}
            ) as resp:
                status = resp.status
                content_type = resp.headers.get("Content-Type", "").lower()

                # Handle 404 / 410 / errors
                if status in (404, 410):
                    await db.update_queue_status(item.id, "unavailable")
                    await db.log_event("crawl", f"Page unavailable ({status}): {url}", "INFO", url=url)
                    return
                elif status != 200:
                    await db.update_queue_status(item.id, "failed")
                    self._stats["requests_failed"] += 1
                    return

                # Only process HTML
                if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                    await db.update_queue_status(item.id, "skipped_non_html")
                    return

                # Check body size
                html_bytes = await resp.read()
                if len(html_bytes) > settings.MAX_BODY_SIZE_BYTES:
                    await db.update_queue_status(item.id, "skipped_too_large")
                    return

                html_text = html_bytes.decode("utf-8", errors="ignore")
                last_modified = resp.headers.get("Last-Modified")

            # 3. Extract content & metadata
            extracted = extract_content(html_text, str(resp.url))
            extracted["url"] = str(resp.url)
            extracted["domain"] = domain
            extracted["status_code"] = status
            extracted["last_modified_header"] = last_modified
            extracted["source_type"] = "crawler"

            # 4. Incrementally Index Document
            doc_id, action = await indexing_pipeline.index_document(extracted)

            # 5. Discover and enqueue new outlinks
            outlinks = extracted.get("outlinks", [])
            if outlinks and item.depth < settings.CRAWLER_MAX_DEPTH:
                enqueued = await frontier.enqueue_links(outlinks, item.depth, referrer=url)
                self._stats["links_discovered"] += enqueued

            self._stats["requests_success"] += 1
            await db.update_queue_status(item.id, "completed")

        except Exception as e:
            self._stats["requests_failed"] += 1
            logger.debug(f"Crawl failure for {url}: {e}")
            await db.update_queue_status(item.id, "failed")

    async def _process_discovered_sitemaps(self, sitemaps: List[str], session: aiohttp.ClientSession, domain: str):
        for s_url in sitemaps[:3]:
            try:
                sitemap_items = await sitemap_parser.fetch_and_parse(s_url, session, max_urls=100)
                urls = [item["url"] for item in sitemap_items]
                if urls:
                    await frontier.enqueue_links(urls, current_depth=0, referrer=s_url)
            except Exception:
                pass

    async def crawl_single_url_now(self, url: str) -> Dict[str, Any]:
        """On-demand immediate crawling of a single URL."""
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        if not domain:
            raise ValueError("Invalid URL: missing domain")

        session = await self.get_session()
        async with session.get(url, allow_redirects=True) as resp:
            if resp.status != 200:
                return {"status": resp.status, "message": f"HTTP status {resp.status}"}
            html = await resp.text(errors="ignore")
            extracted = extract_content(html, str(resp.url))
            extracted["url"] = str(resp.url)
            extracted["domain"] = domain
            extracted["status_code"] = resp.status
            extracted["last_modified_header"] = resp.headers.get("Last-Modified")
            extracted["source_type"] = "admin_request"

            doc_id, action = await indexing_pipeline.index_document(extracted)
            return {
                "doc_id": doc_id,
                "action": action,
                "title": extracted["title"],
                "url": extracted["url"],
                "images_count": len(extracted["images"]),
                "outlinks_count": len(extracted["outlinks"])
            }

crawler = CrawlerEngine()
