"""
Base Specialized Crawler for HS MegaCrawler
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import asyncio
import time
import json
import httpx
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from app.config import settings
from app.database.connection import db
from app.database.models import DocumentRecord, DocumentVersion, DocumentMetadata, ImageItem, VideoItem
from app.megacrawler.models import CrawlerType, CrawlerStatus, CrawlerServiceConfig, CrawlerServiceStats, FrontierTask
from app.megacrawler.frontier import frontier
from app.megacrawler.security import security_guard
from app.crawler.robots import robots_cache
from app.crawler.processors.html_processor import html_processor
from app.crawler.processors.pdf_processor import pdf_processor
from app.crawler.processors.api_dataset_processor import api_dataset_processor
from app.crawler.processors.multimedia_processor import multimedia_processor
from app.crawler.adaptive import adaptive_scheduler
from app.indexer.pipeline import indexing_pipeline
from app.knowledge.extractor import entity_extractor
from app.knowledge.graph import knowledge_graph

class BaseSpecializedCrawler:
    def __init__(self, config: CrawlerServiceConfig):
        self.config = config
        self.stats = CrawlerServiceStats(
            crawler_type=config.crawler_type,
            name=config.name,
            status=CrawlerStatus.ACTIVE if config.is_enabled else CrawlerStatus.PAUSED
        )
        self._running = False
        self._task_handle: Optional[asyncio.Task] = None
        self._client: Optional[httpx.AsyncClient] = None

    async def start(self):
        """Start the specialized crawler service worker loop."""
        if self._running:
            return
        self._running = True
        self.stats.status = CrawlerStatus.ACTIVE

        # Connection pooling and compression support
        headers = {
            "User-Agent": f"{settings.USER_AGENT} ({self.config.user_agent_suffix})",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
            "Accept-Encoding": "gzip, deflate, br"
        }

        # Attempt HTTP/2; fallback cleanly to HTTP/1.1 if not available
        try:
            self._client = httpx.AsyncClient(
                headers=headers,
                timeout=self.config.request_timeout_sec,
                follow_redirects=True,
                http2=True,
                limits=httpx.Limits(max_keepalive_connections=15, max_connections=30)
            )
        except Exception:
            self._client = httpx.AsyncClient(
                headers=headers,
                timeout=self.config.request_timeout_sec,
                follow_redirects=True,
                limits=httpx.Limits(max_keepalive_connections=15, max_connections=30)
            )

        self._task_handle = asyncio.create_task(self._worker_loop())

    async def stop(self):
        """Stop crawler worker loop."""
        self._running = False
        self.stats.status = CrawlerStatus.STOPPED
        if self._task_handle:
            self._task_handle.cancel()
        if self._client:
            await self._client.aclose()
            self._client = None

    async def pause(self):
        """Pause processing."""
        self.stats.status = CrawlerStatus.PAUSED

    async def resume(self):
        """Resume processing."""
        self.stats.status = CrawlerStatus.ACTIVE

    async def _worker_loop(self):
        """Continuously lease tasks from frontier and process with controlled concurrency."""
        worker_id = f"worker-{self.config.crawler_type.value.lower()}-local"
        await frontier.register_worker(worker_id, self.config.crawler_type)

        while self._running:
            if self.stats.status == CrawlerStatus.PAUSED:
                await asyncio.sleep(2.0)
                continue

            try:
                # 1. Update queue length stat
                self.stats.queue_length = await frontier.get_queue_length(self.config.crawler_type.value)

                # 2. Lease batch
                tasks = await frontier.lease_batch(
                    crawler_type=self.config.crawler_type.value,
                    worker_id=worker_id,
                    batch_size=self.config.concurrency_limit,
                    lease_sec=45
                )

                if not tasks:
                    await asyncio.sleep(2.0)
                    continue

                self.stats.active_workers = len(tasks)
                await frontier.update_worker_heartbeat(
                    worker_id=worker_id,
                    status="crawling",
                    current_url=tasks[0].url if tasks else None
                )

                # 3. Process concurrently up to configured limit
                process_coros = [self._process_single_task(task) for task in tasks]
                await asyncio.gather(*process_coros, return_exceptions=True)

                self.stats.active_workers = 0
                await frontier.update_worker_heartbeat(
                    worker_id=worker_id,
                    status="idle",
                    current_url=None
                )

                await asyncio.sleep(0.5)
            except asyncio.CancelledError:
                break
            except Exception:
                self.stats.failed_requests += 1
                await asyncio.sleep(2.0)

    async def _process_single_task(self, task: FrontierTask):
        """Execute single crawl task with polite rate limiting, ETag checking, and indexing."""
        url = task.url
        domain = task.domain
        t_start = time.time()

        # 1. Politeness Slot
        acquired = await security_guard.acquire_domain_slot(
            domain=domain,
            delay_sec=settings.CRAWLER_DOMAIN_DELAY_SEC,
            max_concurrency=2
        )
        if not acquired:
            # Yield task back to queue
            await frontier.fail_task(task.id, retry_delay_sec=5)
            return

        try:
            # 2. Check Robots.txt
            if self.config.respect_robots:
                allowed = await robots_cache.is_allowed(url, settings.USER_AGENT)
                if not allowed:
                    await frontier.fail_task(task.id, retry_delay_sec=86400)
                    self.stats.duplicates_rejected += 1
                    return

            # 3. Conditional GET Headers (ETag & Last-Modified)
            cached_etag, cached_lm = await adaptive_scheduler.get_conditional_headers(url)
            headers = {}
            if cached_etag:
                headers["If-None-Match"] = cached_etag
            if cached_lm:
                headers["If-Modified-Since"] = cached_lm

            # 4. HTTP Fetch
            resp = await self._client.get(url, headers=headers)
            latency_ms = (time.time() - t_start) * 1000.0

            # Update stats
            self.stats.urls_downloaded += 1
            content_bytes = len(resp.content)
            self.stats.bandwidth_kbps = round(content_bytes / 1024.0, 2)
            self.stats.avg_latency_ms = round(
                (self.stats.avg_latency_ms * 0.8) + (latency_ms * 0.2), 2
            ) if self.stats.avg_latency_ms > 0 else latency_ms

            # 5. Handle 304 Not Modified
            if resp.status_code == 304:
                await adaptive_scheduler.record_crawl_result(url, was_changed=False)
                await frontier.complete_task(task.id)
                self.stats.pages_updated += 1
                return

            if resp.status_code != 200:
                await frontier.fail_task(task.id, retry_delay_sec=120)
                self.stats.failed_requests += 1
                return

            # Check content-type
            ct = resp.headers.get("content-type", "").lower()
            is_json = "application/json" in ct
            is_pdf = "application/pdf" in ct or url.lower().endswith(".pdf")
            is_html = any(t in ct for t in ("text/html", "application/xhtml", "application/xml", "text/plain"))

            if not (is_html or is_json or is_pdf):
                await frontier.complete_task(task.id)
                return

            # 6. Extract Content & Links
            etag = resp.headers.get("etag")
            last_mod = resp.headers.get("last-modified")
            if etag or last_mod:
                await adaptive_scheduler.store_headers(url, etag, last_mod)

            parsed: Dict[str, Any] = {}
            if is_json:
                # Handle API responses and structured JSON datasets
                try:
                    data = resp.json()
                    parsed = api_dataset_processor.process(data, url, ct)
                except Exception:
                    parsed = html_processor.process(resp.text, url)
            elif is_pdf:
                # Process PDF binary stream
                try:
                    parsed = pdf_processor.process(resp.content, url)
                except Exception:
                    parsed = {
                        "url": url,
                        "domain": domain,
                        "title": f"PDF Document: {url.split('/')[-1]}",
                        "snippet": f"PDF Document from {domain} ({len(resp.content)} bytes)",
                        "content_text": f"PDF Document from {domain}",
                        "content_hash": hashlib.sha256(resp.content).hexdigest(),
                        "outlinks": [],
                        "quality_score": 0.8,
                        "published_at": None,
                        "images": [],
                        "videos": [],
                        "audios": []
                    }
            else:
                # Standard HTML/Text
                parsed = html_processor.process(resp.text, url)
                # Supplement with multimedia metadata
                mm = multimedia_processor.process(resp.text, url)
                parsed["images"] = mm.get("images", [])
                parsed["videos"] = mm.get("videos", [])
                parsed["audios"] = mm.get("audios", [])

            # 7. Index into Central HS Search Pipeline
            now = datetime.now(timezone.utc)
            meta_obj = DocumentMetadata(
                title=parsed.get("title", url),
                description=parsed.get("description", parsed.get("snippet", "")),
                category=parsed.get("category", "general"),
                category_label=parsed.get("category_label", "General Web"),
                emergent_category=parsed.get("emergent_category"),
                language=parsed.get("language", "en"),
                language_name=parsed.get("language_name", "English"),
                canonical_url=parsed.get("canonical_url", url),
                headings=parsed.get("headings", []),
                structured_data=parsed.get("structured_data", []),
                page_count=parsed.get("page_count"),
                etag=etag
            )

            import hashlib
            chash = parsed.get("content_hash") or hashlib.sha256(parsed.get("content_text", "").encode("utf-8")).hexdigest()

            doc_record = DocumentRecord(
                url=parsed.get("canonical_url", url),
                domain=domain,
                title=parsed.get("title") or url,
                snippet=parsed.get("description", parsed.get("snippet", ""))[:300],
                content_text=parsed.get("content_text", ""),
                content_hash=chash,
                simhash=parsed.get("simhash"),
                status_code=resp.status_code,
                published_at=parsed.get("published_at") or now,
                indexed_at=now,
                last_crawled_at=now,
                last_modified_header=last_mod,
                metadata=meta_obj,
                images=[ImageItem(src=img.get("src", ""), alt=img.get("alt", "")) for img in parsed.get("images", []) if isinstance(img, dict)],
                videos=[VideoItem(src=vid.get("src", ""), title=vid.get("title", "")) for vid in parsed.get("videos", []) if isinstance(vid, dict)],
                audios=[AudioItem(src=aud.get("src", ""), title=aud.get("title", "")) for aud in parsed.get("audios", []) if isinstance(aud, dict)],
                outlinks=parsed.get("outlinks", []),
                quality_score=parsed.get("quality_score", 0.5),
                credibility_score=0.85,
                source_type=self.config.crawler_type.value
            )

            doc_id, action = await indexing_pipeline.index_document(doc_record)
            if action == "unchanged":
                self.stats.duplicates_rejected += 1
            elif action == "updated":
                self.stats.pages_updated += 1
            else:
                self.stats.pages_indexed += 1

            # 8. Extract Knowledge Graph entities
            try:
                entities, relations = entity_extractor.extract_from_text(
                    text=parsed.get("content_text", ""),
                    source_url=parsed.get("url", url),
                    title=parsed.get("title", "")
                )
                for ent in entities:
                    await knowledge_graph.upsert_entity(ent)
                for rel in relations:
                    await knowledge_graph.upsert_relation(rel)
            except Exception:
                pass

            # 9. Enqueue Discovered Outlinks up to max_depth
            if task.depth < self.config.max_depth:
                outlinks = parsed.get("outlinks", [])
                for link in outlinks[:25]:
                    enqueued, _ = await frontier.enqueue_url(
                        url=link,
                        crawler_type=self.config.crawler_type.value,
                        priority=min(10, task.priority + 1),
                        depth=task.depth + 1,
                        referrer=url,
                        discovery_source="hyperlink"
                    )
                    if enqueued:
                        self.stats.urls_discovered += 1

            self.stats.last_crawl_time = now
            await frontier.complete_task(task.id)

        except Exception:
            self.stats.failed_requests += 1
            await frontier.fail_task(task.id, retry_delay_sec=60)
        finally:
            security_guard.release_domain_slot(domain)
