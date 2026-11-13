"""
HS SEARCH - Research & Academic Search Provider
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import time
from typing import List
from datetime import datetime
from app.database.connection import db
from app.providers.base import BaseSearchProvider, ProviderResult

class HSResearchProvider(BaseSearchProvider):
    """
    Research Search Provider: Specialized retrieval across academic,
    scientific research, and technical literature.
    """
    name = "HS Research Index"
    provider_type = "research"
    source_category = "public_dataset"
    is_external = False

    async def search(self, query: str, limit: int = 10, **kwargs) -> List[ProviderResult]:
        start = time.perf_counter()
        results: List[ProviderResult] = []

        try:
            clean_q = "%" + query.strip().lower() + "%"
            async with db.get_connection() as conn:
                cursor = await conn.execute(
                    """SELECT id, url, domain, title, snippet, published_at, indexed_at, category, credibility_score
                       FROM documents
                       WHERE category IN ('academic', 'science_research', 'tech', 'general')
                         AND (lower(title) LIKE ? OR lower(snippet) LIKE ?)
                       ORDER BY quality_score DESC, credibility_score DESC
                       LIMIT ?""",
                    (clean_q, clean_q, limit)
                )
                rows = await cursor.fetchall()

                for r in rows:
                    results.append(ProviderResult(
                        title=r["title"],
                        url=r["url"],
                        snippet=r["snippet"] or "",
                        source_provider="HS Research Subsystem",
                        original_publisher=r["domain"],
                        retrieval_timestamp=datetime.utcnow(),
                        publication_timestamp=datetime.fromisoformat(r["published_at"]) if r["published_at"] else None,
                        source_attribution="Indexed from verified scholarly & technical publication repositories",
                        is_live=False,
                        source_type="public_dataset",
                        domain=r["domain"],
                        score=float(r["credibility_score"] or 0.85),
                        category="academic"
                    ))

            latency = (time.perf_counter() - start) * 1000.0
            self.record_metrics(latency, error=False)
            return results
        except Exception:
            latency = (time.perf_counter() - start) * 1000.0
            self.record_metrics(latency, error=True)
            return []
