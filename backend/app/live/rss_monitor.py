"""
HS Live - Real-Time RSS/Atom Continuous Monitoring Subsystem
Company: HS AI Solutions
"""

import asyncio
import feedparser
import aiohttp
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.database.connection import db
from app.database.models import LiveFeedRecord, DocumentMetadata, ImageItem
from app.indexer.pipeline import indexing_pipeline
from app.crawler.extractor import normalize_url, compute_simhash
import hashlib

logger = logging.getLogger(__name__)

class HSLiveMonitor:
    def __init__(self):
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._live_events: List[Dict[str, Any]] = []

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10),
                headers={"User-Agent": "HSSearchLiveBot/1.0 (+https://hsaisolutions.com/live)"}
            )
        return self._session

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        logger.info("Starting HS Live Monitoring Subsystem...")
        await db.log_event("live", "HS Live Subsystem started", "INFO")
        self._task = asyncio.create_task(self._monitor_loop())

    async def stop(self):
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
        if self._session and not self._session.closed:
            await self._session.close()
        logger.info("HS Live Subsystem stopped.")

    async def _monitor_loop(self):
        """Continuously polls active feeds based on individual schedule intervals."""
        while self.is_running:
            try:
                feeds = await db.get_active_feeds()
                if not feeds:
                    await asyncio.sleep(5.0)
                    continue

                now = datetime.utcnow()
                tasks = []

                for feed in feeds:
                    # Check if interval has elapsed since last check
                    last_chk = feed.last_checked_at.replace(tzinfo=None) if feed.last_checked_at else None
                    elapsed = (now - last_chk).total_seconds() if last_chk else 999999
                    interval = feed.interval_sec

                    # Priority interval overrides
                    if feed.priority_level == "critical":
                        interval = 1
                    elif feed.priority_level == "high":
                        interval = 5
                    elif feed.priority_level == "regular":
                        interval = 30

                    if elapsed >= interval:
                        tasks.append(self._check_feed(feed))

                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)

                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in HS Live monitor loop: {e}")
                await asyncio.sleep(3.0)

    async def _check_feed(self, feed: LiveFeedRecord):
        session = await self.get_session()
        try:
            async with session.get(feed.feed_url) as resp:
                if resp.status != 200:
                    await db.record_feed_check(feed.id, 0, error=f"HTTP {resp.status}")
                    return
                content = await resp.text(errors="ignore")

            # Parse with feedparser
            parsed = feedparser.parse(content)
            entries = parsed.entries or []

            new_items_indexed = 0
            for entry in entries[:15]:
                link = entry.get("link")
                title = entry.get("title", "").strip()
                if not link or not title:
                    continue

                # Published date parsing
                pub_date = None
                if entry.get("published_parsed"):
                    try:
                        pub_date = datetime(*entry.published_parsed[:6])
                    except Exception:
                        pass
                elif entry.get("updated_parsed"):
                    try:
                        pub_date = datetime(*entry.updated_parsed[:6])
                    except Exception:
                        pass

                summary = entry.get("summary", "") or entry.get("description", "")
                # Clean html tags from summary
                import re
                clean_text = re.sub(r"<[^>]+>", " ", summary).strip()
                clean_text = re.sub(r"\s+", " ", clean_text)
                if not clean_text:
                    clean_text = title

                content_hash = hashlib.sha256((title + clean_text).encode("utf-8")).hexdigest()
                simhash = compute_simhash(clean_text)

                # Images in entry
                images = []
                if "media_content" in entry:
                    for mc in entry.media_content:
                        if mc.get("url"):
                            images.append(ImageItem(src=mc["url"], alt=title))
                if "enclosures" in entry:
                    for enc in entry.enclosures:
                        if enc.get("type", "").startswith("image") and enc.get("href"):
                            images.append(ImageItem(src=enc["href"], alt=title))

                import urllib.parse
                domain = urllib.parse.urlparse(link).netloc.lower()

                doc_data = {
                    "url": link,
                    "domain": domain,
                    "title": title,
                    "snippet": clean_text[:280] + ("..." if len(clean_text) > 280 else ""),
                    "content_text": clean_text,
                    "content_hash": content_hash,
                    "simhash": simhash,
                    "published_at": pub_date or datetime.utcnow(),
                    "images": images,
                    "quality_score": 0.85,
                    "credibility_score": 0.85,
                    "is_live": True,
                    "source_type": "rss",
                    "metadata": DocumentMetadata(
                        title=title,
                        description=clean_text[:280],
                        language="en",
                        reading_time_min=1,
                        category=feed.category or "news"
                    )
                }

                doc_id, action = await indexing_pipeline.index_document(doc_data)
                if action in ("created", "updated"):
                    new_items_indexed += 1
                    self._live_events.append({
                        "id": doc_id,
                        "title": title,
                        "url": link,
                        "domain": domain,
                        "timestamp": datetime.utcnow().isoformat(),
                        "action": action,
                        "feed_name": feed.name
                    })
                    # Keep only last 50 events in memory
                    if len(self._live_events) > 50:
                        self._live_events.pop(0)

            await db.record_feed_check(feed.id, new_items_indexed)

        except Exception as e:
            logger.debug(f"Error checking live feed {feed.name} ({feed.feed_url}): {e}")
            await db.record_feed_check(feed.id, 0, error=str(e)[:150])

    def get_recent_live_events(self) -> List[Dict[str, Any]]:
        return list(reversed(self._live_events))

live_monitor = HSLiveMonitor()
