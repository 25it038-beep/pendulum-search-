"""
HS SEARCH - Native Independent Search Provider
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import time
from typing import List, Dict, Any
from datetime import datetime
from app.providers.base import BaseSearchProvider, ProviderResult
from app.ranking.scorer import search_scorer

class HSNativeSearchProvider(BaseSearchProvider):
    """
    HS Native Search Provider: Queries our independent web crawler and neural index.
    Zero dependency on external search APIs.
    """
    name = "HS Native Index"
    provider_type = "native"
    source_category = "hs_indexed"
    is_external = False

    async def search(self, query: str, limit: int = 15, **kwargs) -> List[ProviderResult]:
        start = time.perf_counter()
        try:
            mode = kwargs.get("mode", "general")
            sort = kwargs.get("sort_by", "relevance")
            user_lat = kwargs.get("user_lat")
            user_lon = kwargs.get("user_lon")
            radius_km = kwargs.get("radius_km")
            location_name = kwargs.get("location_name")
            location_mode = kwargs.get("location_mode")
            ranking_mode = kwargs.get("ranking_mode")

            res = await search_scorer.execute_search(
                query=query,
                mode=mode,
                sort_by=sort,
                limit=limit,
                offset=0,
                user_lat=user_lat,
                user_lon=user_lon,
                radius_km=radius_km,
                location_name=location_name,
                location_mode=location_mode,
                ranking_mode=ranking_mode
            )

            results: List[ProviderResult] = []
            for item in res.get("results", []):
                # item can be dict or SearchResultItem
                r_dict = item.model_dump() if hasattr(item, "model_dump") else item
                pr = ProviderResult(
                    title=r_dict.get("title", ""),
                    url=r_dict.get("url", ""),
                    snippet=r_dict.get("snippet", ""),
                    source_provider="HS Native Index",
                    original_publisher=r_dict.get("domain", ""),
                    retrieval_timestamp=datetime.utcnow(),
                    publication_timestamp=r_dict.get("published_at"),
                    source_attribution="Independently crawled and indexed by HS MegaCrawler",
                    is_live=r_dict.get("is_live", False),
                    source_type="hs_indexed",
                    domain=r_dict.get("domain", ""),
                    score=r_dict.get("score", 0.5),
                    language=r_dict.get("language", "en"),
                    category=r_dict.get("category", "general"),
                    location=r_dict.get("location"),
                    distance_km=r_dict.get("distance_km"),
                    distance_str=r_dict.get("distance_str"),
                    images=r_dict.get("images", [])
                )
                results.append(pr)

            latency = (time.perf_counter() - start) * 1000.0
            self.record_metrics(latency, error=False)
            return results
        except Exception:
            latency = (time.perf_counter() - start) * 1000.0
            self.record_metrics(latency, error=True)
            return []
