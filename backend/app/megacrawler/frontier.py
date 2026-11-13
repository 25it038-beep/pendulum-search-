"""
HS MegaCrawler Distributed URL Frontier
Supports Redis Streams and Persistent SQLite Frontier with Priority Queuing,
Lease Management, Intelligent Prioritization Scoring, Duplicate Avoidance,
and Stalled Lease Recovery.
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import asyncio
import hashlib
import json
import re
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple

from app.config import settings
from app.database.connection import db
from app.megacrawler.models import FrontierTask, WorkerInfo, CrawlerType, URLPriorityFactors
from app.megacrawler.security import security_guard

# High Authority Domain Registry for Domain Authority Scoring
HIGH_AUTHORITY_DOMAINS = {
    "wikipedia.org": 0.95,
    "w3.org": 0.95,
    "arxiv.org": 0.95,
    "github.com": 0.95,
    "python.org": 0.90,
    "mozilla.org": 0.92,
    "nature.com": 0.92,
    "bbc.co.uk": 0.90,
    "reuters.com": 0.90,
    "data.gov": 0.92,
    "gov.uk": 0.92,
    "nasa.gov": 0.90,
    "openalex.org": 0.88,
    "crossref.org": 0.88,
    "ycombinator.com": 0.85,
    "techcrunch.com": 0.82,
    "eff.org": 0.85
}

class DistributedFrontier:
    def __init__(self):
        self._redis_client = None
        self._redis_available = False
        self._seen_fingerprints: set = set()

    async def initialize(self):
        """Initialize connection to Redis Streams if enabled, else SQLite persistent queue."""
        if settings.USE_REDIS_FRONTIER:
            try:
                import redis.asyncio as aioredis
                self._redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
                await self._redis_client.ping()
                self._redis_available = True
            except Exception:
                self._redis_available = False
                self._redis_client = None

    def normalize_url(self, raw_url: str) -> str:
        """Standardize URL: lowercase host, strip fragment, remove tracking parameters."""
        try:
            parsed = urllib.parse.urlparse(raw_url.strip())
            netloc = parsed.netloc.lower()
            if not netloc:
                return raw_url

            # Filter out noisy tracking query params
            query_tuples = urllib.parse.parse_qsl(parsed.query)
            clean_query = [
                (k, v) for k, v in query_tuples
                if not k.lower().startswith(("utm_", "fbclid", "gclid", "mc_eid", "ref_", "source"))
            ]
            clean_query.sort()
            query_str = urllib.parse.urlencode(clean_query)

            # Standardize path
            path = parsed.path
            if not path:
                path = "/"

            return urllib.parse.urlunparse((
                parsed.scheme.lower(),
                netloc,
                path,
                "",
                query_str,
                ""
            ))
        except Exception:
            return raw_url

    def compute_fingerprint(self, url: str) -> str:
        """Compute SHA256 fingerprint for fast duplicate detection."""
        norm = self.normalize_url(url)
        return hashlib.sha256(norm.encode("utf-8")).hexdigest()

    def calculate_priority_score(
        self,
        url: str,
        crawler_type: str,
        depth: int = 0,
        discovery_source: str = "hyperlink"
    ) -> Tuple[int, URLPriorityFactors, float]:
        """
        Intelligent URL Prioritization Algorithm.
        Computes multi-factor score S in [0.0, 1.0] and maps to priority P in [1, 10]
        (1 = highest priority, 10 = background crawl).
        """
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        path = parsed.path.lower()

        # 1. Domain Authority Signal
        base_authority = 0.5
        for auth_domain, score in HIGH_AUTHORITY_DOMAINS.items():
            if domain == auth_domain or domain.endswith("." + auth_domain):
                base_authority = score
                break
        if domain.endswith((".edu", ".gov", ".ac.uk", ".mil")):
            base_authority = max(base_authority, 0.90)

        # 2. Source Quality Signal
        quality_score = 0.7 if parsed.scheme == "https" else 0.4
        if len(path.split("/")) <= 4:
            quality_score += 0.15

        # 3. Content Relevance Signal
        relevance_score = 0.5
        relevant_keywords = {
            "ai", "research", "paper", "news", "docs", "api", "tech", "data", "gov",
            "science", "code", "quantum", "software", "release", "breaking", "model"
        }
        path_words = set(re.findall(r"\w+", path))
        matching_words = path_words.intersection(relevant_keywords)
        if matching_words:
            relevance_score = min(1.0, 0.5 + len(matching_words) * 0.15)

        # 4. Update Frequency by Crawler Category
        freq_weights = {
            "HS-LiveCrawler": 0.95,
            "HS-NewsCrawler": 0.85,
            "HS-TechCrawler": 0.70,
            "HS-ResearchCrawler": 0.65,
            "HS-ScienceCrawler": 0.60,
            "HS-CodeCrawler": 0.55,
            "HS-DocCrawler": 0.40,
            "HS-GovCrawler": 0.45,
            "HS-DiscoveryCrawler": 0.60,
            "HS-DeepCrawler": 0.50,
            "HS-RefreshCrawler": 0.75,
            "HS-API-Crawler": 0.70
        }
        update_freq = freq_weights.get(crawler_type, 0.5)

        # 5. Freshness Signal
        freshness = 0.9 if discovery_source in ("rss_atom", "indexnow", "live") else 0.7

        # 6. User Search Demand (Baseline 0.5)
        demand = 0.6 if discovery_source in ("july_ai", "discovery_gap") else 0.5

        # 7. Historical Change Frequency
        change_freq = 0.7 if "news" in domain or "rss" in path else 0.4

        # 8. Content Uniqueness
        uniqueness = 0.8
        if any(w in path for w in ("page", "index", "category", "tag", "archive")):
            uniqueness = 0.4

        # 9. Crawl Cost (penalty for deeper levels or query parameter complexity)
        cost = min(0.9, 0.1 + (depth * 0.15) + (0.2 if parsed.query else 0.0))

        factors = URLPriorityFactors(
            content_relevance=round(relevance_score, 2),
            source_quality=round(quality_score, 2),
            domain_authority=round(base_authority, 2),
            update_frequency=round(update_freq, 2),
            freshness=round(freshness, 2),
            user_search_demand=round(demand, 2),
            historical_change_freq=round(change_freq, 2),
            content_uniqueness=round(uniqueness, 2),
            crawl_cost=round(cost, 2)
        )

        # Weighted priority calculation:
        # Score = 0.2*Rel + 0.15*Qual + 0.15*Auth + 0.15*Freq + 0.1*Fresh + 0.1*Demand + 0.05*Hist + 0.1*Uniq - 0.1*Cost
        composite_score = (
            0.20 * factors.content_relevance +
            0.15 * factors.source_quality +
            0.15 * factors.domain_authority +
            0.15 * factors.update_frequency +
            0.10 * factors.freshness +
            0.10 * factors.user_search_demand +
            0.05 * factors.historical_change_freq +
            0.10 * factors.content_uniqueness -
            0.10 * factors.crawl_cost
        )
        composite_score = max(0.05, min(0.95, composite_score))

        # Map to integer priority 1..10 (1 is highest priority)
        priority_int = max(1, min(10, round(11 - composite_score * 10)))

        return priority_int, factors, composite_score

    async def enqueue_url(
        self,
        url: str,
        crawler_type: str,
        priority: Optional[int] = None,
        depth: int = 0,
        referrer: Optional[str] = None,
        max_retries: int = 3,
        discovery_source: str = "hyperlink"
    ) -> Tuple[bool, str]:
        """
        Enqueue a URL into the distributed priority queue.
        Validates SSRF, traps, and duplicate presence.
        Calculates priority score if not explicitly set.
        """
        # 1. Normalize
        norm_url = self.normalize_url(url)
        fingerprint = self.compute_fingerprint(norm_url)

        # 2. Security validation
        safe, reason = security_guard.is_safe_url(norm_url)
        if not safe:
            return False, f"Security rejection: {reason}"

        trap, trap_reason = security_guard.is_url_trap(norm_url)
        if trap:
            return False, f"URL trap rejection: {trap_reason}"

        domain = urllib.parse.urlparse(norm_url).netloc.lower()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Compute priority score
        if priority is None:
            priority_int, factors, comp_score = self.calculate_priority_score(
                url=norm_url,
                crawler_type=crawler_type,
                depth=depth,
                discovery_source=discovery_source
            )
            priority = priority_int

        # 3. Check duplicate in memory cache & database
        if fingerprint in self._seen_fingerprints:
            return False, "Duplicate URL (cached fingerprint)"

        async with db.get_connection() as conn:
            # Check already indexed
            cursor = await conn.execute(
                "SELECT id FROM documents WHERE url = ? LIMIT 1",
                (norm_url,)
            )
            if await cursor.fetchone():
                self._seen_fingerprints.add(fingerprint)
                return False, "Already indexed in documents"

            # Check already in frontier
            cursor = await conn.execute(
                "SELECT id FROM frontier_queue WHERE fingerprint = ? OR url = ? LIMIT 1",
                (fingerprint, norm_url)
            )
            if await cursor.fetchone():
                self._seen_fingerprints.add(fingerprint)
                return False, "Already in frontier queue"

            # Insert into frontier_queue
            await conn.execute(
                """INSERT INTO frontier_queue (
                    url, domain, crawler_type, priority, depth, status,
                    fingerprint, scheduled_for, retries, max_retries, referrer, discovered_at
                ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 0, ?, ?, ?)""",
                (norm_url, domain, crawler_type, priority, depth, fingerprint, now_iso, max_retries, referrer, now_iso)
            )
            await conn.commit()

        self._seen_fingerprints.add(fingerprint)
        # Cap fingerprint set memory
        if len(self._seen_fingerprints) > 100000:
            self._seen_fingerprints.clear()

        # 4. If Redis available, publish to Redis Stream partition
        if self._redis_available and self._redis_client:
            try:
                stream_key = f"frontier:stream:{crawler_type}"
                await self._redis_client.xadd(
                    stream_key,
                    {"url": norm_url, "domain": domain, "priority": priority, "depth": depth}
                )
            except Exception:
                pass

        return True, "Enqueued successfully"

    async def enqueue_batch(
        self,
        urls: List[str],
        crawler_type: str,
        priority: Optional[int] = None,
        depth: int = 0,
        referrer: Optional[str] = None,
        discovery_source: str = "sitemap"
    ) -> int:
        """Enqueue multiple URLs in a batch, returning count of accepted URLs."""
        enqueued_count = 0
        for u in urls:
            try:
                ok, _ = await self.enqueue_url(
                    url=u,
                    crawler_type=crawler_type,
                    priority=priority,
                    depth=depth,
                    referrer=referrer,
                    discovery_source=discovery_source
                )
                if ok:
                    enqueued_count += 1
            except Exception:
                continue
        return enqueued_count

    async def lease_batch(
        self,
        crawler_type: str,
        worker_id: str,
        batch_size: int = 5,
        lease_sec: int = 60
    ) -> List[FrontierTask]:
        """
        Lease a batch of highest-priority pending tasks for a specific crawler worker.
        Locks tasks with leased_to and leased_until.
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        lease_expiry = (now + timedelta(seconds=lease_sec)).isoformat()

        leased_tasks: List[FrontierTask] = []

        async with db.get_connection() as conn:
            # 1. Recover any expired leases for this crawler type
            await conn.execute(
                """UPDATE frontier_queue 
                   SET status = 'pending', leased_to = NULL, leased_until = NULL, retries = retries + 1
                   WHERE crawler_type = ? AND status = 'leased' AND leased_until < ? AND retries < max_retries""",
                (crawler_type, now_iso)
            )

            # 2. Fetch next highest-priority pending tasks (priority 1 first, then id)
            cursor = await conn.execute(
                """SELECT id, url, domain, crawler_type, priority, depth, retries, max_retries, referrer, discovered_at
                   FROM frontier_queue
                   WHERE crawler_type = ? AND status = 'pending' AND scheduled_for <= ?
                   ORDER BY priority ASC, id ASC
                   LIMIT ?""",
                (crawler_type, now_iso, batch_size)
            )
            rows = await cursor.fetchall()
            if not rows:
                return []

            task_ids = [r["id"] for r in rows]
            placeholders = ",".join("?" for _ in task_ids)

            # 3. Mark as leased
            await conn.execute(
                f"""UPDATE frontier_queue
                    SET status = 'leased', leased_to = ?, leased_until = ?
                    WHERE id IN ({placeholders})""",
                [worker_id, lease_expiry] + task_ids
            )
            await conn.commit()

            for r in rows:
                leased_tasks.append(FrontierTask(
                    id=r["id"],
                    url=r["url"],
                    domain=r["domain"],
                    crawler_type=r["crawler_type"],
                    priority=r["priority"],
                    depth=r["depth"],
                    status="leased",
                    scheduled_for=now,
                    leased_to=worker_id,
                    leased_until=now + timedelta(seconds=lease_sec),
                    retries=r["retries"],
                    max_retries=r["max_retries"],
                    referrer=r["referrer"],
                    discovered_at=datetime.fromisoformat(r["discovered_at"]) if isinstance(r["discovered_at"], str) else now
                ))

        return leased_tasks

    async def complete_task(self, task_id: int):
        """Mark frontier task as successfully completed."""
        async with db.get_connection() as conn:
            await conn.execute(
                "UPDATE frontier_queue SET status = 'completed' WHERE id = ?",
                (task_id,)
            )
            await conn.commit()

    async def fail_task(self, task_id: int, retry_delay_sec: int = 60):
        """Handle task failure with exponential backoff or final fail."""
        now = datetime.now(timezone.utc)
        retry_time = (now + timedelta(seconds=retry_delay_sec)).isoformat()

        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT retries, max_retries FROM frontier_queue WHERE id = ?",
                (task_id,)
            )
            row = await cursor.fetchone()
            if not row:
                return

            retries = row["retries"] + 1
            max_retries = row["max_retries"]

            if retries >= max_retries:
                await conn.execute(
                    "UPDATE frontier_queue SET status = 'failed', retries = ? WHERE id = ?",
                    (retries, task_id)
                )
            else:
                await conn.execute(
                    """UPDATE frontier_queue 
                       SET status = 'pending', retries = ?, scheduled_for = ?, leased_to = NULL, leased_until = NULL 
                       WHERE id = ?""",
                    (retries, retry_time, task_id)
                )
            await conn.commit()

    async def register_worker(self, worker_id: str, crawler_type: CrawlerType):
        """Register worker in the distributed worker registry."""
        now_iso = datetime.now(timezone.utc).isoformat()
        async with db.get_connection() as conn:
            await conn.execute(
                """INSERT INTO megacrawler_workers (
                    worker_id, crawler_type, status, registered_at, last_heartbeat
                ) VALUES (?, ?, 'idle', ?, ?)
                ON CONFLICT(worker_id) DO UPDATE SET
                    crawler_type = excluded.crawler_type,
                    status = 'idle',
                    last_heartbeat = excluded.last_heartbeat""",
                (worker_id, crawler_type.value, now_iso, now_iso)
            )
            await conn.commit()

    async def update_worker_heartbeat(
        self,
        worker_id: str,
        status: str,
        current_url: Optional[str] = None,
        urls_processed: int = 0,
        bytes_downloaded: int = 0,
        cpu_percent: float = 0.0,
        memory_mb: float = 0.0
    ):
        """Update worker state and resource metrics."""
        now_iso = datetime.now(timezone.utc).isoformat()
        async with db.get_connection() as conn:
            await conn.execute(
                """UPDATE megacrawler_workers
                   SET status = ?, current_url = ?, urls_processed = urls_processed + ?,
                       bytes_downloaded = bytes_downloaded + ?, cpu_percent = ?, memory_mb = ?,
                       last_heartbeat = ?
                   WHERE worker_id = ?""",
                (status, current_url, urls_processed, bytes_downloaded, cpu_percent, memory_mb, now_iso, worker_id)
            )
            await conn.commit()

    async def get_queue_length(self, crawler_type: Optional[str] = None) -> int:
        """Get count of pending tasks in frontier."""
        async with db.get_connection() as conn:
            if crawler_type:
                cursor = await conn.execute(
                    "SELECT COUNT(*) as count FROM frontier_queue WHERE crawler_type = ? AND status = 'pending'",
                    (crawler_type,)
                )
            else:
                cursor = await conn.execute(
                    "SELECT COUNT(*) as count FROM frontier_queue WHERE status = 'pending'"
                )
            row = await cursor.fetchone()
            return row["count"] if row else 0

    async def get_recent_tasks(self, limit: int = 30) -> List[Dict[str, Any]]:
        """Get recent frontier tasks with their status and priority."""
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                """SELECT id, url, domain, crawler_type, priority, depth, status, scheduled_for, retries, referrer
                   FROM frontier_queue
                   ORDER BY id DESC LIMIT ?""",
                (limit,)
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

frontier = DistributedFrontier()
