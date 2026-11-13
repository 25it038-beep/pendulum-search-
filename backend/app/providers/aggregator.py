"""
HS SEARCH - Parallel Search Aggregator
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import re
import time
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode

from app.database.models import SearchResultItem, ImageItem, VideoItem
from app.providers.base import BaseSearchProvider, ProviderResult
from app.providers.query_router import query_router
from app.ranking.scorer import search_scorer

class SearchAggregator:
    """
    Parallel Search Aggregator: Concurrently queries native and authorized supplemental providers,
    deduplicates canonical URLs, preserves legal attribution, and enforces circuit breakers.
    """

    def __init__(self):
        self.router = query_router
        self._circuit_breakers: Dict[str, Dict[str, Any]] = {}
        self.total_aggregations = 0

    def canonicalize_url(self, raw_url: str) -> str:
        """
        Normalize URL for canonical deduplication:
        - Lowercase scheme and domain
        - Strip common tracking parameters (utm_*, ref, fbclid, gclid)
        - Strip trailing slashes and default ports
        """
        try:
            parsed = urlparse(raw_url.strip())
            netloc = parsed.netloc.lower()
            if netloc.startswith("www."):
                netloc = netloc[4:]

            path = parsed.path.rstrip("/")
            if not path:
                path = "/"

            # Strip tracking query params
            query_params = parse_qs(parsed.query)
            clean_params = {
                k: v for k, v in query_params.items()
                if not (k.startswith("utm_") or k in ("ref", "fbclid", "gclid", "source", "trk"))
            }
            new_query = urlencode(clean_params, doseq=True)

            return urlunparse((parsed.scheme.lower() or "https", netloc, path, "", new_query, ""))
        except Exception:
            return raw_url.strip().lower().rstrip("/")

    async def aggregate_search(
        self,
        query: str,
        mode: str = "general",
        sort: str = "relevance",
        limit: int = 15,
        offset: int = 0,
        user_lat: Optional[float] = None,
        user_lon: Optional[float] = None,
        radius_km: Optional[float] = None,
        location_name: Optional[str] = None,
        location_mode: Optional[str] = None,
        ranking_mode: Optional[str] = None,
        ai_mode: str = "auto",
        use_hybrid: bool = True
    ) -> Dict[str, Any]:
        """
        Orchestrate parallel hybrid search execution:
        1. Classify query intent and select appropriate providers
        2. Query native index and supplemental providers concurrently
        3. Enforce strict timeouts on external calls
        4. Normalize, deduplicate, re-rank
        5. Trigger autonomous index expansion for new discovered URLs
        """
        self.total_aggregations += 1
        start_time = time.perf_counter()

        # Step 1: Intelligent Query Routing
        loc_state = {"mode": location_mode, "name": location_name, "lat": user_lat, "lon": user_lon}
        routing = await self.router.route(query, mode=mode, location_state=loc_state, use_nvidia_classify=(ai_mode in ("july", "auto")))
        provider_names = routing["provider_names"] if use_hybrid else ["native"]
        providers = self.router.get_providers(provider_names)

        # Step 2: Concurrent Execution with Timeout Isolation
        tasks = []
        provider_keys = []
        search_kwargs = {
            "mode": mode,
            "sort_by": sort,
            "user_lat": user_lat,
            "user_lon": user_lon,
            "radius_km": radius_km,
            "location_name": location_name,
            "location_mode": location_mode,
            "ranking_mode": ranking_mode
        }

        for prov in providers:
            # Skip external providers if circuit breaker is open
            if prov.is_external and prov.circuit_open:
                continue

            provider_keys.append(prov.name)
            # Native gets longer budget, external gets strict 1.5s
            budget = 4.0 if not prov.is_external else 1.5
            tasks.append(asyncio.wait_for(prov.search(query, limit=limit, **search_kwargs), timeout=budget))

        # Execute concurrently
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Step 3: Result Normalization & Metrics Collection
        merged_results: List[ProviderResult] = []
        provider_stats: Dict[str, Dict[str, Any]] = {}
        external_discovered_urls: List[str] = []

        for p_name, res in zip(provider_keys, raw_results):
            if isinstance(res, Exception):
                provider_stats[p_name] = {"count": 0, "status": "failed", "error": str(res)}
            else:
                provider_stats[p_name] = {"count": len(res), "status": "ok"}
                for item in res:
                    merged_results.append(item)
                    if item.source_type in ("external_partner", "public_dataset") and item.url:
                        external_discovered_urls.append(item.url)

        # Step 4: Canonical Deduplication & Merging
        seen_canonical: Dict[str, SearchResultItem] = {}
        final_items: List[SearchResultItem] = []
        auto_id_counter = 500000

        for r in merged_results:
            can_url = self.canonicalize_url(r.url)

            # Build SearchResultItem
            domain = r.domain or (r.url.split("/")[2] if "//" in r.url else "web")
            auto_id_counter += 1

            item = SearchResultItem(
                id=auto_id_counter,
                url=r.url,
                domain=domain,
                title=r.title,
                snippet=r.snippet,
                published_at=r.publication_timestamp,
                indexed_at=r.retrieval_timestamp,
                published_str=r.publication_timestamp.strftime("%b %d, %Y") if r.publication_timestamp else None,
                indexed_str=f"Checked {r.retrieval_timestamp.strftime('%H:%M')}",
                score=r.score,
                text_score=r.score * 0.8,
                semantic_score=r.score * 0.7,
                freshness_score=0.9 if r.is_live else 0.7,
                credibility_score=0.95 if r.source_type == "hs_indexed" else 0.85,
                category=r.category,
                category_label="Independently Indexed" if r.source_type == "hs_indexed" else "Partner Source",
                language=r.language,
                content_type="text/html",
                is_live=r.is_live,
                source_type=r.source_type,
                source_provider=r.source_provider,
                source_category=r.source_type,
                original_publisher=r.original_publisher,
                retrieval_timestamp=r.retrieval_timestamp,
                source_attribution=r.source_attribution,
                location=r.location,
                distance_km=r.distance_km,
                distance_str=r.distance_str,
                images=[ImageItem(**img) if isinstance(img, dict) else img for img in r.images[:4]]
            )

            if can_url in seen_canonical:
                # Deduplication: prefer HS Native over external partner
                existing = seen_canonical[can_url]
                if existing.source_category != "hs_indexed" and item.source_category == "hs_indexed":
                    seen_canonical[can_url] = item
            else:
                seen_canonical[can_url] = item

        # Convert back to list and rank
        final_items = list(seen_canonical.values())

        # Step 5: Hybrid Re-ranking
        # Priority: Exact match > Distance decay > HS Native credibility > Partner authority
        def sort_key(it: SearchResultItem):
            type_bonus = 0.20 if it.source_category == "hs_indexed" else (0.10 if it.source_category == "live_source" else 0.0)
            dist_bonus = (1.0 / (1.0 + (it.distance_km or 25.0) / 10.0)) * 0.30 if it.distance_km is not None else 0.0
            return (it.score + type_bonus + dist_bonus)

        final_items.sort(key=sort_key, reverse=True)

        # Slice pagination
        paginated_items = final_items[offset: offset + limit]
        execution_time_ms = round((time.perf_counter() - start_time) * 1000.0, 1)

        # Step 6: Autonomous HS Index Expansion (Background Async Task)
        if external_discovered_urls:
            asyncio.create_task(self._schedule_autonomous_expansion(external_discovered_urls, query))

        return {
            "results": paginated_items,
            "total_results": len(final_items),
            "execution_time_ms": execution_time_ms,
            "sources_used": [k for k, v in provider_stats.items() if v.get("status") == "ok" and v.get("count", 0) > 0],
            "provider_stats": provider_stats,
            "query_intent": routing.get("intent", "general"),
            "query_complexity": routing.get("complexity", "low"),
            "is_hybrid": True
        }

    async def _schedule_autonomous_expansion(self, urls: List[str], search_query: str):
        """
        Autonomous Index Expansion:
        Analyzes external provider results for URLs not yet in HS index,
        and enqueues them for independent HS crawling and indexing.
        """
        try:
            from app.database.connection import db
            from app.database.models import QueueItem
            from datetime import datetime
            import urllib.parse

            now = datetime.utcnow()
            items_to_enqueue = []

            for u in urls[:10]:
                parsed = urllib.parse.urlparse(u)
                domain = parsed.netloc.lower()
                if not domain or "duckduckgo" in domain:
                    continue

                # Register domain in HS database
                await db.get_or_create_domain(domain)

                # Add to frontier queue
                items_to_enqueue.append(QueueItem(
                    url=u,
                    domain=domain,
                    depth=0,
                    priority=3,
                    status="pending",
                    scheduled_for=now,
                    discovered_at=now,
                    referrer=f"hybrid_expansion:{search_query[:30]}"
                ))

            if items_to_enqueue:
                await db.enqueue_urls(items_to_enqueue)
        except Exception:
            pass

    def get_provider_health(self) -> Dict[str, Any]:
        """Aggregate health status across all registered search providers."""
        return {
            name: {
                "name": p.name,
                "type": p.provider_type,
                "category": p.source_category,
                "healthy": p.is_healthy,
                "circuit_open": p.circuit_open,
                "avg_latency_ms": round(p.avg_latency_ms, 1),
                "requests": p.request_count,
                "errors": p.error_count
            }
            for name, p in self.router.providers.items()
        }

# Singleton Instance
search_aggregator = SearchAggregator()
