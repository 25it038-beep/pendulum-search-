"""
HS SEARCH - Real-Time News Search Provider
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import time
from typing import List
from datetime import datetime
from app.database.connection import db
from app.providers.base import BaseSearchProvider, ProviderResult

class HSNewsProvider(BaseSearchProvider):
    """
    Real-Time News Provider: Queries breaking feeds and fresh news articles
    continuously monitored by the HS Live Subsystem.
    """
    name = "HS Live News"
    provider_type = "news"
    source_category = "live_source"
    is_external = False

    async def search(self, query: str, limit: int = 10, **kwargs) -> List[ProviderResult]:
        start = time.perf_counter()
        results: List[ProviderResult] = []

        try:
            clean_q = "%" + query.strip().lower() + "%"
            async with db.get_connection() as conn:
                cursor = await conn.execute(
                    """SELECT id, url, domain, title, snippet, published_at, indexed_at, category, credibility_score, is_live
                       FROM documents
                       WHERE (is_live = 1 OR category IN ('news', 'tech', 'general'))
                         AND (lower(title) LIKE ? OR lower(snippet) LIKE ?)
                       ORDER BY indexed_at DESC
                       LIMIT ?""",
                    (clean_q, clean_q, limit)
                )
                rows = await cursor.fetchall()

                for r in rows:
                    results.append(ProviderResult(
                        title=r["title"],
                        url=r["url"],
                        snippet=r["snippet"] or "",
                        source_provider="HS Live Feeds Subsystem",
                        original_publisher=r["domain"],
                        retrieval_timestamp=datetime.utcnow(),
                        publication_timestamp=datetime.fromisoformat(r["published_at"]) if r["published_at"] else None,
                        source_attribution="Monitored in real-time by HS Live RSS/Atom subsystem",
                        is_live=bool(r["is_live"]),
                        source_type="live_source",
                        domain=r["domain"],
                        score=float(r["credibility_score"] or 0.8),
                        category=r["category"] or "news"
                    ))

            latency = (time.perf_counter() - start) * 1000.0
            self.record_metrics(latency, error=False)
            return results
        except Exception:
            latency = (time.perf_counter() - start) * 1000.0
            self.record_metrics(latency, error=True)
            return []
