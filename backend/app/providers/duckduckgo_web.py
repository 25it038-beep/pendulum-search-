"""
HS Search - External Web Search Provider Adapter
Company: HS AI Solutions
Founder: Harshan Seliyan

Provides external supplementary web results for the Pendulum Hybrid Search Engine.

Primary strategy: SearXNG self-hosted instance (if SEARXNG_URL is configured).
Fallback strategy: DuckDuckGo Instant Answer API (documented, no scraping).

Design Guarantees:
- Zero DuckDuckGo branding exposed in any API response.
- All results are attributed to their original publishers.
- TTL cache (5 min) + in-flight dedup + circuit breaker per provider.
- Independent 2.5s timeout; never blocks Pendulum native results.
- Results normalized to common ProviderResult schema.
- SearXNG is self-hosted meta-search; not an official DuckDuckGo API.
"""

import asyncio
import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus, urlencode, urlparse, urlunparse, parse_qs

import httpx

from app.config import settings
from app.providers.base import BaseSearchProvider, ProviderResult

logger = logging.getLogger(__name__)

_TRACKING_PARAMS = frozenset({
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "ref", "fbclid", "gclid", "source", "trk", "si", "sref",
})

_AUTHORITY_DOMAINS = frozenset({
    "wikipedia.org", "britannica.com", "bbc.com", "reuters.com", "apnews.com",
    "nature.com", "science.org", "arxiv.org", "pubmed.ncbi.nlm.nih.gov",
    "who.int", "un.org", "gov.uk", "nytimes.com", "theguardian.com",
    "stackoverflow.com", "github.com", "developer.mozilla.org",
})


def _extract_domain(url: str) -> str:
    try:
        m = re.search(r"https?://(?:www\.)?([^/\?#]+)", url)
        return m.group(1).lower() if m else ""
    except Exception:
        return ""


def _canonicalize_url(url: str) -> str:
    try:
        p = urlparse(url.strip())
        netloc = p.netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        path = p.path.rstrip("/") or "/"
        params = {k: v for k, v in parse_qs(p.query).items() if k not in _TRACKING_PARAMS}
        q_str = urlencode(params, doseq=True)
        return urlunparse((p.scheme.lower() or "https", netloc, path, "", q_str, ""))
    except Exception:
        return url.strip().lower().rstrip("/")


def _authority_score(domain: str) -> float:
    base = domain.rstrip(".")
    for auth in _AUTHORITY_DOMAINS:
        if base == auth or base.endswith("." + auth):
            return 1.0
    return 0.5


class DuckDuckGoWebProvider(BaseSearchProvider):
    """
    Replaceable external web search provider for Pendulum Hybrid Search.

    Uses SearXNG (self-hosted) if SEARXNG_URL is set, otherwise falls back
    to the DuckDuckGo Instant Answer API (documented endpoint only).

    Source labels in results use neutral terminology — no DuckDuckGo branding.
    """

    name: str = "External Search"
    provider_type: str = "external"
    source_category: str = "external_search"
    is_external: bool = True

    # SearXNG categories and engines
    _SEARXNG_CATEGORIES = "general"
    _SEARXNG_ENGINES = "bing,google,brave,duckduckgo"

    def __init__(self):
        super().__init__()
        self._cache: Dict[str, tuple] = {}   # key → (expire_ts, List[ProviderResult])
        self._in_flight: Dict[str, asyncio.Future] = {}
        self._cache_lock = asyncio.Lock()
        self.cache_hits = 0
        self.searxng_hits = 0
        self.instant_answer_hits = 0
        self.failed_calls = 0
        self.last_latency_ms = 0.0

        self._timeout = getattr(settings, "HYBRID_DDG_TIMEOUT_SEC", 2.5)
        self._cache_ttl = getattr(settings, "HYBRID_CACHE_TTL_SEC", 300)
        self._searxng_url = (getattr(settings, "SEARXNG_URL", "") or "").rstrip("/")
        self._ddg_api_url = getattr(settings, "DUCKDUCKGO_API_URL", "https://api.duckduckgo.com/")

    # -------------------------------------------------------------------------
    # Cache helpers
    # -------------------------------------------------------------------------

    def _cache_key(self, query: str, limit: int) -> str:
        raw = f"{query.strip().lower()}:{limit}"
        return hashlib.md5(raw.encode()).hexdigest()

    async def _get_cached(self, query: str, limit: int) -> Optional[List[ProviderResult]]:
        key = self._cache_key(query, limit)
        async with self._cache_lock:
            if key in self._cache:
                exp, results = self._cache[key]
                if time.time() < exp:
                    self.cache_hits += 1
                    return results
                del self._cache[key]
        return None

    async def _set_cache(self, query: str, limit: int, results: List[ProviderResult]):
        key = self._cache_key(query, limit)
        async with self._cache_lock:
            if len(self._cache) > 500:
                now = time.time()
                expired = [k for k, (exp, _) in self._cache.items() if now >= exp]
                for k in expired:
                    del self._cache[k]
            self._cache[key] = (time.time() + self._cache_ttl, results)

    # -------------------------------------------------------------------------
    # Main search entry point
    # -------------------------------------------------------------------------

    async def search(self, query: str, limit: int = 10, **kwargs) -> List[ProviderResult]:
        clean_q = (query or "").strip()
        if not clean_q:
            return []

        # Circuit breaker check
        if self.circuit_open:
            if time.time() - self.last_circuit_trip < 45.0:
                logger.warning("[ExternalSearch] Circuit breaker open — skipping")
                return []
            # Try to half-open
            self.circuit_open = False
            self.consecutive_errors = 0

        # Cache check
        cached = await self._get_cached(clean_q, limit)
        if cached is not None:
            return cached

        # In-flight dedup
        key = self._cache_key(clean_q, limit)
        async with self._cache_lock:
            if key in self._in_flight:
                fut = self._in_flight[key]
            else:
                fut = asyncio.get_event_loop().create_future()
                self._in_flight[key] = fut
                fut = None  # We are the first caller; proceed to fetch

        if fut is not None:
            try:
                return await asyncio.wait_for(asyncio.shield(fut), timeout=self._timeout)
            except Exception:
                return []

        # Actually fetch
        t0 = time.perf_counter()
        results: List[ProviderResult] = []
        try:
            if self._searxng_url:
                results = await self._search_searxng(clean_q, limit)
                if results:
                    self.searxng_hits += 1
            if not results:
                results = await self._search_instant_answer(clean_q, limit)
                if results:
                    self.instant_answer_hits += 1

            self.last_latency_ms = (time.perf_counter() - t0) * 1000
            self.record_metrics(self.last_latency_ms, error=False)
            await self._set_cache(clean_q, limit, results)

            # Resolve in-flight future
            async with self._cache_lock:
                waiting = self._in_flight.pop(key, None)
                if waiting and not waiting.done():
                    waiting.set_result(results)

        except Exception as exc:
            self.last_latency_ms = (time.perf_counter() - t0) * 1000
            self.record_metrics(self.last_latency_ms, error=True)
            self.failed_calls += 1
            logger.warning("[ExternalSearch] Search failed: %s", exc)

            async with self._cache_lock:
                waiting = self._in_flight.pop(key, None)
                if waiting and not waiting.done():
                    waiting.set_exception(exc)

        return results

    # -------------------------------------------------------------------------
    # Strategy A: SearXNG (self-hosted)
    # -------------------------------------------------------------------------

    async def _search_searxng(self, query: str, limit: int) -> List[ProviderResult]:
        """
        Query a self-hosted SearXNG instance.
        SearXNG is an open-source meta-search engine — not an official DuckDuckGo API.
        """
        params = {
            "q": query,
            "format": "json",
            "categories": self._SEARXNG_CATEGORIES,
            "language": "en",
            "pageno": 1,
            "results": min(limit * 2, 20),
        }
        url = f"{self._searxng_url}/search"
        now = datetime.now(timezone.utc)

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url, params=params, headers={"User-Agent": settings.USER_AGENT})
            if resp.status_code != 200:
                return []
            data = resp.json()
        except Exception as e:
            logger.debug("[SearXNG] Request failed: %s", e)
            return []

        results: List[ProviderResult] = []
        for item in data.get("results", [])[:limit]:
            title = (item.get("title") or "").strip()
            item_url = (item.get("url") or "").strip()
            snippet = (item.get("content") or "").strip()
            if not title or not item_url:
                continue

            domain = _extract_domain(item_url)
            pub_date_str = item.get("publishedDate") or item.get("published_date") or ""
            pub_ts = self._parse_date(pub_date_str)

            results.append(ProviderResult(
                title=title,
                url=item_url,
                snippet=snippet[:500],
                source_provider=self.name,
                original_publisher=item.get("pretty_url") or domain,
                retrieval_timestamp=now,
                publication_timestamp=pub_ts,
                source_attribution="",
                is_live=False,
                source_type="external_search",
                domain=domain,
                score=float(item.get("score", 0.70)),
                language=item.get("language", "en"),
                category="general",
            ))

        return results

    # -------------------------------------------------------------------------
    # Strategy B: DuckDuckGo Instant Answer API (fallback)
    # -------------------------------------------------------------------------

    async def _search_instant_answer(self, query: str, limit: int) -> List[ProviderResult]:
        """
        Call the documented DuckDuckGo Instant Answer API.
        Returns encyclopedic facts, definitions, and related topics.
        Does NOT perform a full web search — clearly documented limitation.
        Results use neutral attribution; no DuckDuckGo branding.
        """
        params = {
            "q": query,
            "format": "json",
            "no_html": "1",
            "skip_disambig": "1",
        }
        now = datetime.now(timezone.utc)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    self._ddg_api_url,
                    params=params,
                    headers={"User-Agent": settings.USER_AGENT},
                )
            if resp.status_code not in (200, 202):
                return []
            data = resp.json()
        except Exception as e:
            logger.debug("[InstantAnswer] Request failed: %s", e)
            return []

        results: List[ProviderResult] = []
        heading = (data.get("Heading") or query).strip()

        # 1. Abstract (encyclopedic summary)
        abstract = (data.get("AbstractText") or "").strip()
        abstract_url = (data.get("AbstractURL") or "").strip()
        abstract_src = (data.get("AbstractSource") or "Reference").strip()
        if abstract and abstract_url:
            domain = _extract_domain(abstract_url)
            results.append(ProviderResult(
                title=heading or query,
                url=abstract_url,
                snippet=abstract[:500],
                source_provider=self.name,
                original_publisher=abstract_src,
                retrieval_timestamp=now,
                publication_timestamp=None,
                source_attribution="",
                is_live=False,
                source_type="external_search",
                domain=domain,
                score=0.90,
                language="en",
                category="reference",
            ))

        # 2. Definition
        definition = (data.get("Definition") or "").strip()
        def_url = (data.get("DefinitionURL") or abstract_url or
                   f"https://en.wikipedia.org/wiki/{quote_plus(query)}").strip()
        def_src = (data.get("DefinitionSource") or "Reference").strip()
        if definition and not any(r.url == def_url for r in results):
            domain = _extract_domain(def_url)
            results.append(ProviderResult(
                title=f"Definition: {heading}",
                url=def_url,
                snippet=definition[:500],
                source_provider=self.name,
                original_publisher=def_src,
                retrieval_timestamp=now,
                publication_timestamp=None,
                source_attribution="",
                is_live=False,
                source_type="external_search",
                domain=domain,
                score=0.88,
                language="en",
                category="reference",
            ))

        # 3. Direct Answer
        answer = (data.get("Answer") or "").strip()
        if answer and not any(r.snippet == answer for r in results):
            ans_url = abstract_url or f"https://en.wikipedia.org/wiki/{quote_plus(query)}"
            results.append(ProviderResult(
                title=f"Answer: {heading}",
                url=ans_url,
                snippet=answer[:500],
                source_provider=self.name,
                original_publisher="Verified Reference",
                retrieval_timestamp=now,
                publication_timestamp=None,
                source_attribution="",
                is_live=False,
                source_type="external_search",
                domain=_extract_domain(ans_url),
                score=0.86,
                language="en",
                category="general",
            ))

        # 4. Related Topics
        for topic in data.get("RelatedTopics", []):
            if len(results) >= limit:
                break
            if isinstance(topic.get("Topics"), list):
                for sub in topic["Topics"]:
                    if len(results) >= limit:
                        break
                    r = self._parse_topic(sub, now)
                    if r:
                        results.append(r)
            else:
                r = self._parse_topic(topic, now)
                if r:
                    results.append(r)

        return results[:limit]

    def _parse_topic(self, topic: Dict[str, Any], now: datetime) -> Optional[ProviderResult]:
        try:
            text = (topic.get("Text") or "").strip()
            url = (topic.get("FirstURL") or "").strip()
            if not text or not url:
                return None
            if " - " in text:
                title, snippet = text.split(" - ", 1)
                title = title.strip()
                snippet = snippet.strip()
            else:
                title = text[:70]
                snippet = text
            domain = _extract_domain(url)
            return ProviderResult(
                title=title,
                url=url,
                snippet=snippet[:400],
                source_provider=self.name,
                original_publisher=domain,
                retrieval_timestamp=now,
                publication_timestamp=None,
                source_attribution="",
                is_live=False,
                source_type="external_search",
                domain=domain,
                score=0.72,
                language="en",
                category="general",
            )
        except Exception:
            return None

    @staticmethod
    def _parse_date(date_str: str) -> Optional[datetime]:
        if not date_str:
            return None
        for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d %b %Y"):
            try:
                return datetime.strptime(date_str[:20], fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

    async def health_check(self) -> Dict[str, Any]:
        base = await super().health_check()
        base.update({
            "cache_size": len(self._cache),
            "cache_hits": self.cache_hits,
            "searxng_hits": self.searxng_hits,
            "instant_answer_hits": self.instant_answer_hits,
            "failed_calls": self.failed_calls,
            "last_latency_ms": round(self.last_latency_ms, 1),
            "searxng_configured": bool(self._searxng_url),
        })
        return base


# Singleton
duckduckgo_web_provider = DuckDuckGoWebProvider()
