"""
HS SEARCH - Intelligent Adaptive Crawl Scheduler & HTTP Conditional GET Engine
Company: HS AI Solutions | Founder: Harshan Seliyan

Prioritizes crawling using:
- Observed update frequency
- Content quality score
- Relevance & freshness
- User search demand (queries & discovery gaps)
- Source reliability & credibility
- Historical change frequency & ETag/Last-Modified tracking
"""

import time
import logging
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timezone, timedelta
from app.database.connection import db

logger = logging.getLogger(__name__)

class AdaptiveScheduler:
    def __init__(self):
        # In-memory fast cache for conditional headers: url -> (etag, last_modified, last_checked)
        self._header_cache: Dict[str, Tuple[Optional[str], Optional[str], float]] = {}
        # Domain change frequency tracking: domain -> {"crawls": int, "changes": int, "interval": int}
        self._domain_stats: Dict[str, Dict[str, Any]] = {}
        # Search demand tracking: domain -> query count
        self._domain_demand: Dict[str, int] = {}

    async def store_headers(self, url: str, etag: Optional[str], last_modified: Optional[str]):
        """Store ETag and Last-Modified headers for conditional validation."""
        self._header_cache[url] = (etag, last_modified, time.time())

    async def get_conditional_headers(self, url: str) -> Tuple[Optional[str], Optional[str]]:
        """Retrieve stored ETag and Last-Modified headers for a URL."""
        if url in self._header_cache:
            etag, lm, _ = self._header_cache[url]
            return etag, lm

        # Fallback to database check
        try:
            async with db.get_connection() as conn:
                cursor = await conn.execute(
                    "SELECT last_modified_header, metadata_json FROM documents WHERE url = ? LIMIT 1",
                    (url,)
                )
                row = await cursor.fetchone()
                if row:
                    lm = row["last_modified_header"]
                    etag = None
                    try:
                        import json
                        meta = json.loads(row["metadata_json"] or "{}")
                        etag = meta.get("etag")
                    except Exception:
                        pass
                    self._header_cache[url] = (etag, lm, time.time())
                    return etag, lm
        except Exception:
            pass

        return None, None

    async def record_crawl_result(self, url: str, was_changed: bool, domain: Optional[str] = None):
        """Update domain change statistics to adaptively calibrate crawl intervals."""
        if not domain:
            import urllib.parse
            domain = urllib.parse.urlparse(url).netloc.lower()

        stats = self._domain_stats.setdefault(domain, {"crawls": 0, "changes": 0, "interval_sec": 3600})
        stats["crawls"] += 1
        if was_changed:
            stats["changes"] += 1

        stats["interval_sec"] = self.calculate_crawl_interval(
            domain=domain,
            changes_count=stats["changes"],
            total_crawls=stats["crawls"]
        )

    def calculate_crawl_interval(self, domain: str, changes_count: int, total_crawls: int) -> int:
        """
        Calculates realistic crawl intervals:
        - Rapidly updating news/feeds: 60s - 300s
        - Frequent updates: 15m - 1h
        - Regular websites: 6h - 24h
        - Static documents/archives: 7 days - 30 days
        """
        if total_crawls <= 1:
            return 3600 # Default 1 hour

        change_ratio = changes_count / max(1, total_crawls)

        if change_ratio > 0.6:
            return 300 # 5 minutes
        elif change_ratio > 0.3:
            return 1800 # 30 minutes
        elif change_ratio > 0.1:
            return 14400 # 4 hours
        elif change_ratio > 0.02:
            return 86400 # 24 hours
        else:
            return 604800 # 7 days

    def compute_priority(
        self,
        url: str,
        domain: str,
        depth: int = 0,
        content_quality: float = 0.5,
        credibility_score: float = 0.5,
        is_live: bool = False,
        search_demand: int = 0
    ) -> int:
        """
        Multi-factor priority score from 1 (highest priority) to 10 (lowest priority).
        Prioritizes by freshness demand, reliability, search queries, and shallow depth.
        """
        # Baseline priority
        prio = 5.0

        # Depth penalty (shallow pages crawled first)
        prio += min(3.0, depth * 0.8)

        # Quality and credibility bonus
        if credibility_score > 0.8:
            prio -= 1.0
        if content_quality > 0.8:
            prio -= 0.5

        # Search demand bonus (frequently queried domains prioritized)
        if search_demand > 5:
            prio -= 1.5
        elif search_demand > 0:
            prio -= 0.5

        # Breaking news / Live stream bonus
        if is_live:
            prio = 1.0

        return max(1, min(10, int(round(prio))))

adaptive_scheduler = AdaptiveScheduler()
