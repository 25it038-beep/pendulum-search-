"""
HS Search - Native Index Provider
Company: HS AI Solutions
Founder: Harshan Seliyan

Wraps the existing search_scorer.execute_search() and converts results to ProviderResult.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from app.providers.base import BaseSearchProvider, ProviderResult

logger = logging.getLogger(__name__)


class HSNativeSearchProvider(BaseSearchProvider):
    """
    Wraps the existing HS Native Search scorer.
    This is the primary internal search source — always returns results,
    never raises.
    """

    name: str = "HS Native Index"
    is_external: bool = False

    async def search(self, query: str, limit: int = 10, **kwargs) -> list[ProviderResult]:
        try:
            # Import here to avoid circular imports at module load time
            from app.ranking.scorer import search_scorer

            mode = kwargs.get("mode", "general")
            offset = kwargs.get("offset", 0)

            result = await search_scorer.execute_search(
                query=query,
                mode=mode,
                limit=limit,
                offset=offset,
                sort_by=kwargs.get("sort_by", "relevance"),
                user_lat=kwargs.get("user_lat"),
                user_lon=kwargs.get("user_lon"),
                radius_km=kwargs.get("radius_km"),
                location_name=kwargs.get("location_name"),
                location_mode=kwargs.get("location_mode"),
                domain_filter=kwargs.get("domain_filter"),
                content_type_filter=kwargs.get("content_type_filter"),
                language_filter=kwargs.get("language_filter"),
                category_filter=kwargs.get("category_filter"),
                freshness_filter=kwargs.get("freshness_filter"),
            )

            now = datetime.now(timezone.utc).replace(tzinfo=None)
            provider_results: list[ProviderResult] = []

            for item in result.get("results", []):
                # item is a dict (from model_dump())
                try:
                    pub_ts: Optional[datetime] = None
                    if item.get("published_at"):
                        raw_pub = item["published_at"]
                        if isinstance(raw_pub, datetime):
                            pub_ts = raw_pub
                        else:
                            try:
                                pub_ts = datetime.fromisoformat(str(raw_pub)).replace(tzinfo=None)
                            except Exception:
                                pub_ts = None

                    domain = item.get("domain", "")
                    provider_results.append(ProviderResult(
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        snippet=item.get("snippet", ""),
                        source_provider=self.name,
                        original_publisher=domain,
                        retrieval_timestamp=now,
                        publication_timestamp=pub_ts,
                        source_attribution=f"HS Search Index — {domain}",
                        is_live=bool(item.get("is_live", False)),
                        source_type=item.get("source_type", "hs_indexed"),
                        domain=domain,
                        score=float(item.get("score", 0.5)),
                        language=item.get("language", "en"),
                        location=item.get("location"),
                    ))
                except Exception:
                    continue

            return provider_results

        except Exception as exc:
            logger.warning("HSNativeSearchProvider.search failed: %s", exc, exc_info=True)
            return []

    async def health_check(self) -> dict:
        try:
            results = await self.search("technology", limit=1)
            return {
                "provider": self.name,
                "status": "ok",
                "is_external": self.is_external,
                "result_count": len(results),
            }
        except Exception as exc:
            return {
                "provider": self.name,
                "status": "error",
                "is_external": self.is_external,
                "error": str(exc),
            }
