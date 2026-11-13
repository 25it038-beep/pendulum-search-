"""
Crawl Frontier & Politeness Scheduler for HS SEARCH
Company: HS AI Solutions
"""

import asyncio
import time
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import urllib.parse
from app.config import settings
from app.database.models import QueueItem
from app.database.connection import db

class CrawlFrontier:
    def __init__(self):
        self._domain_last_crawl: Dict[str, float] = {}
        self._domain_page_counts: Dict[str, int] = {}
        self._lock = asyncio.Lock()

    def get_domain(self, url: str) -> str:
        return urllib.parse.urlparse(url).netloc.lower()

    async def can_crawl_domain_now(self, domain: str, required_delay: float = 1.0) -> bool:
        """Check if enough time has elapsed since the last crawl for this domain."""
        async with self._lock:
            last_time = self._domain_last_crawl.get(domain, 0.0)
            now = time.time()
            if now - last_time >= required_delay:
                return True
            return False

    async def record_crawl(self, domain: str):
        """Record timestamp of crawl for domain rate-limiting."""
        async with self._lock:
            self._domain_last_crawl[domain] = time.time()
            self._domain_page_counts[domain] = self._domain_page_counts.get(domain, 0) + 1

    async def enqueue_links(self, links: List[str], current_depth: int, referrer: str) -> int:
        """Filter and schedule new discovered URLs into the database queue."""
        if current_depth >= settings.CRAWLER_MAX_DEPTH:
            return 0

        items_to_add: List[QueueItem] = []
        now = datetime.utcnow()

        for link in links:
            parsed = urllib.parse.urlparse(link)
            domain = parsed.netloc.lower()
            if not domain:
                continue

            # SSRF check: reject loopback or private hostnames
            if any(domain.startswith(blocked) for blocked in settings.BLOCKED_HOSTS):
                continue

            # Check domain page count limit
            count = self._domain_page_counts.get(domain, 0)
            if count >= settings.CRAWLER_MAX_PAGES_PER_DOMAIN:
                continue

            # Ensure domain record exists
            await db.get_or_create_domain(domain)

            # Assign priority: depth 0-1 gets higher priority (1-3), depth 2 gets 5
            prio = min(9, current_depth + 3)

            item = QueueItem(
                url=link,
                domain=domain,
                depth=current_depth + 1,
                priority=prio,
                status="pending",
                scheduled_for=now,
                discovered_at=now,
                referrer=referrer
            )
            items_to_add.append(item)

        if items_to_add:
            return await db.enqueue_urls(items_to_add)
        return 0

frontier = CrawlFrontier()
