"""
HS Search - External Web Search Provider Adapter
Company: HS AI Solutions
Founder: Harshan Seliyan

Provides primary DuckDuckGo web search results enhanced by Pendulum Hybrid Search Engine.

Primary strategy: SearXNG self-hosted instance querying DuckDuckGo engine (if SEARXNG_URL is configured).
Fallback strategy: DuckDuckGo Instant Answer API (documented, no scraping).

Design Guarantees:
- Explicitly attributes primary retrieval to DuckDuckGo and enhancement to Pendulum.
- All results remain attributed to their original publishers.
- TTL cache (5 min) + in-flight dedup + circuit breaker per provider.
- Independent 2.5s timeout; never blocks Pendulum native results.
- Results normalized to common ProviderResult schema.
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

_AD_OR_TRACKING_HOST_RE = re.compile(
    r"(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google|taboola\.com|outbrain\.com)",
    re.IGNORECASE,
)
_MEDIA_ONLY_EXT_RE = re.compile(
    r"\.(jpe?g|png|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav)(\?.*)?$",
    re.IGNORECASE,
)
_BLOCKED_HOSTS = frozenset({"localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"})

INSTANT_ANSWER_LIMITATION_NOTICE = (
    "Full organic web search requires SEARXNG_URL (e.g. DuckDuckGo engine enabled) or an authorized search API key "
    "(BRAVE_SEARCH_API_KEY / SERPER_API_KEY). https://api.duckduckgo.com/ only returns Instant Answer encyclopedic "
    "abstracts/related topics, not full organic web results."
)


def _is_blocked_host(url: str) -> bool:
    try:
        p = urlparse(url.strip())
        if p.scheme.lower() not in ("http", "https"):
            return True
        host = (p.hostname or "").lower()
        if not host or "." not in host:
            return True
        if host in _BLOCKED_HOSTS or host.endswith(".local") or host.endswith(".internal"):
            return True
        if host.startswith(("169.254.", "10.", "192.168.")):
            return True
        return False
    except Exception:
        return True


def _unwrap_safe_redirect_url(raw_url: str) -> tuple[str, bool]:
    try:
        p = urlparse(raw_url.strip())
        host = (p.hostname or "").lower()
        if host.endswith("duckduckgo.com") and p.path == "/l/":
            uddg = parse_qs(p.query).get("uddg", [None])[0]
            if uddg and re.match(r"^https?://", uddg, re.IGNORECASE) and not _is_blocked_host(uddg):
                return uddg, False
            return raw_url, True
        return raw_url.strip(), False
    except Exception:
        return raw_url.strip(), False


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
    Primary DuckDuckGo web search provider for Pendulum Hybrid Search.

    Passes the exact original user query untouched (only URL-encoded + supported regional/safe params):
    1) Uses SearXNG (SEARXNG_URL, defaulting engines to `duckduckgo`), or authorized Brave/Serper API keys if configured.
    2) Uses documented DuckDuckGo Instant Answer API as `knowledge_ia` supplement when full organic web search is unavailable.

    Explicitly credits DuckDuckGo as the primary web source enhanced by Pendulum.
    """

    name: str = "DuckDuckGo"
    provider_type: str = "external"
    source_category: str = "external_search"
    is_external: bool = True

    _SEARXNG_CATEGORIES = "general"

    def __init__(self):
        super().__init__()
        self._cache: Dict[str, tuple] = {}   # key → (expire_ts, List[ProviderResult], telemetry)
        self._in_flight: Dict[str, asyncio.Future] = {}
        self._cache_lock = asyncio.Lock()
        self.cache_hits = 0
        self.searxng_hits = 0
        self.instant_answer_hits = 0
        self.failed_calls = 0
        self.last_latency_ms = 0.0
        self.last_telemetry: Dict[str, Any] = {}
        self._query_telemetry: Dict[str, Dict[str, Any]] = {}

        self._timeout = getattr(settings, "HYBRID_DDG_TIMEOUT_SEC", 2.5)
        self._cache_ttl = getattr(settings, "HYBRID_CACHE_TTL_SEC", 300)
        self._searxng_url = (getattr(settings, "SEARXNG_URL", "") or "").rstrip("/")
        self._searxng_engines = (getattr(settings, "SEARXNG_ENGINES", "") or "").strip() or "duckduckgo"
        self._brave_key = (getattr(settings, "BRAVE_SEARCH_API_KEY", "") or "").strip()
        self._serper_key = (getattr(settings, "SERPER_API_KEY", "") or "").strip()
        self._ddg_api_url = getattr(settings, "DUCKDUCKGO_API_URL", "https://api.duckduckgo.com/")

    def get_last_telemetry(self, query: Optional[str] = None) -> Dict[str, Any]:
        if query and query.strip() in self._query_telemetry:
            return self._query_telemetry[query.strip()]
        return self.last_telemetry

    def _cache_key(self, query: str, limit: int) -> str:
        raw = f"{query}:{limit}"
        return hashlib.md5(raw.encode()).hexdigest()

    async def _get_cached(self, query: str, limit: int) -> Optional[tuple[List[ProviderResult], Dict[str, Any]]]:
        key = self._cache_key(query, limit)
        async with self._cache_lock:
            if key in self._cache:
                exp, results, tel = self._cache[key]
                if time.time() < exp:
                    self.cache_hits += 1
                    return results, tel
                del self._cache[key]
        return None

    async def _set_cache(self, query: str, limit: int, results: List[ProviderResult], telemetry: Dict[str, Any]):
        key = self._cache_key(query, limit)
        async with self._cache_lock:
            if len(self._cache) > 500:
                now = time.time()
                expired = [k for k, (exp, _, _) in self._cache.items() if now >= exp]
                for k in expired:
                    del self._cache[k]
            self._cache[key] = (time.time() + self._cache_ttl, results, telemetry)

    def _parse_and_validate_organic_items(
        self,
        raw_items: List[Dict[str, Any]],
        limit: int,
    ) -> tuple[List[ProviderResult], Dict[str, Any]]:
        now = datetime.now(timezone.utc)
        parsed: List[ProviderResult] = []
        rejection_reasons: Dict[str, int] = {}
        seen_urls: set[str] = set()
        rejected_count = 0

        def reject(reason: str):
            nonlocal rejected_count
            rejected_count += 1
            rejection_reasons[reason] = rejection_reasons.get(reason, 0) + 1

        for idx, item in enumerate(raw_items):
            if len(parsed) >= limit:
                break
            raw_url = str(item.get("url") or "").strip()
            if not raw_url:
                reject("missing_url")
                continue

            candidate_url, was_bad_redir = _unwrap_safe_redirect_url(raw_url)
            if was_bad_redir:
                reject("ad_or_invalid_redirect")
                continue

            if _is_blocked_host(candidate_url):
                reject("blocked_host")
                continue

            parsed_url = urlparse(candidate_url)
            domain = (parsed_url.hostname or "").lower().removeprefix("www.")
            if _AD_OR_TRACKING_HOST_RE.search(domain) or (domain.endswith("duckduckgo.com") and parsed_url.path != "/"):
                reject("ad_or_provider_internal_url")
                continue

            if _MEDIA_ONLY_EXT_RE.search(parsed_url.path or ""):
                reject("media_file_in_web_stream")
                continue

            title = str(item.get("title") or "").strip()
            if len(title) < 2:
                reject("missing_title")
                continue

            canonical_key = _canonicalize_url(candidate_url)
            if canonical_key in seen_urls:
                reject("duplicate_url")
                continue
            seen_urls.add(canonical_key)

            original_rank = idx + 1
            snippet = str(item.get("content") or item.get("snippet") or "").strip()
            pub_date_str = item.get("publishedDate") or item.get("published_date") or ""
            pub_ts = self._parse_date(str(pub_date_str)) if pub_date_str else None
            raw_score = item.get("score")
            norm_score = (
                min(1.0, max(0.2, float(raw_score) / 10.0))
                if isinstance(raw_score, (int, float))
                else max(0.45, 0.96 - (original_rank - 1) * 0.03)
            )

            parsed.append(ProviderResult(
                title=title,
                url=candidate_url,
                snippet=snippet[:500],
                source_provider="DuckDuckGo",
                original_publisher=item.get("pretty_url") or domain,
                retrieval_timestamp=now,
                publication_timestamp=pub_ts,
                source_attribution="DuckDuckGo · Pendulum Enhanced",
                is_live=False,
                source_type="primary_web_organic",
                domain=domain,
                score=norm_score,
                language=str(item.get("language") or "en"),
                category=str(item.get("category") or "general"),
                original_rank=original_rank,
                provider_type="primary_web_search",
                result_type="web",
            ))

        return parsed, {
            "raw_organic_count": len(raw_items),
            "parsed_count": len(parsed),
            "rejected_count": rejected_count,
            "rejection_reasons": rejection_reasons,
            "genuine_web_url_count": len(parsed),
        }

    # -------------------------------------------------------------------------
    # Main search entry point
    # -------------------------------------------------------------------------

    async def search(self, query: str, limit: int = 10, **kwargs) -> List[ProviderResult]:
        exact_query = (query or "").strip()
        if not exact_query:
            return []

        if self.circuit_open:
            if time.time() - self.last_circuit_trip < 45.0:
                logger.warning("[ExternalSearch] Circuit breaker open — skipping")
                return []
            self.circuit_open = False
            self.consecutive_errors = 0

        cached = await self._get_cached(exact_query, limit)
        if cached is not None:
            results_cached, tel_cached = cached
            self.last_telemetry = tel_cached
            self._query_telemetry[exact_query] = tel_cached
            return results_cached

        key = self._cache_key(exact_query, limit)
        async with self._cache_lock:
            if key in self._in_flight:
                fut = self._in_flight[key]
            else:
                fut = asyncio.get_event_loop().create_future()
                self._in_flight[key] = fut
                fut = None

        if fut is not None:
            try:
                return await asyncio.wait_for(asyncio.shield(fut), timeout=self._timeout)
            except Exception:
                return []

        t0 = time.perf_counter()
        results: List[ProviderResult] = []
        telemetry: Dict[str, Any] = {
            "strategy_used": "instant_answer_fallback",
            "provider_query": exact_query,
            "raw_status": None,
            "content_type": None,
            "raw_organic_count": 0,
            "parsed_count": 0,
            "rejected_count": 0,
            "rejection_reasons": {},
            "genuine_web_url_count": 0,
            "has_full_organic_results": False,
            "limitation_notice": None,
            "errors": [],
        }

        try:
            if self._searxng_url and not _is_blocked_host(self._searxng_url):
                telemetry["strategy_used"] = "searxng"
                organic, org_tel = await self._search_searxng(exact_query, limit, **kwargs)
                telemetry.update(org_tel)
                if organic:
                    self.searxng_hits += 1
                    results.extend(organic)
                    telemetry["has_full_organic_results"] = True
            elif self._brave_key:
                telemetry["strategy_used"] = "brave_api"
                organic, org_tel = await self._search_brave(exact_query, limit, **kwargs)
                telemetry.update(org_tel)
                if organic:
                    results.extend(organic)
                    telemetry["has_full_organic_results"] = True
            elif self._serper_key:
                telemetry["strategy_used"] = "serper_api"
                organic, org_tel = await self._search_serper(exact_query, limit, **kwargs)
                telemetry.update(org_tel)
                if organic:
                    results.extend(organic)
                    telemetry["has_full_organic_results"] = True
            else:
                telemetry["limitation_notice"] = INSTANT_ANSWER_LIMITATION_NOTICE

            if not results:
                ia_results, ia_status, ia_ct = await self._search_instant_answer(exact_query, limit)
                if telemetry["raw_status"] is None:
                    telemetry["raw_status"] = ia_status
                if telemetry["content_type"] is None:
                    telemetry["content_type"] = ia_ct
                if ia_results:
                    self.instant_answer_hits += 1
                    results.extend(ia_results)

            self.last_latency_ms = (time.perf_counter() - t0) * 1000
            telemetry["latency_ms"] = round(self.last_latency_ms, 1)
            self.last_telemetry = telemetry
            self._query_telemetry[exact_query] = telemetry
            self.record_metrics(self.last_latency_ms, error=False)
            await self._set_cache(exact_query, limit, results, telemetry)

            async with self._cache_lock:
                waiting = self._in_flight.pop(key, None)
                if waiting and not waiting.done():
                    waiting.set_result(results)

        except Exception as exc:
            self.last_latency_ms = (time.perf_counter() - t0) * 1000
            self.record_metrics(self.last_latency_ms, error=True)
            self.failed_calls += 1
            telemetry["errors"].append(str(exc))
            self.last_telemetry = telemetry
            logger.warning("[ExternalSearch] Search failed: %s", exc)

            async with self._cache_lock:
                waiting = self._in_flight.pop(key, None)
                if waiting and not waiting.done():
                    waiting.set_exception(exc)

        return results

    # -------------------------------------------------------------------------
    # Strategy A1: SearXNG (self-hosted, exact query preserved)
    # -------------------------------------------------------------------------

    async def _search_searxng(self, query: str, limit: int, **kwargs) -> tuple[List[ProviderResult], Dict[str, Any]]:
        params: Dict[str, Any] = {
            "q": query,
            "format": "json",
            "categories": self._SEARXNG_CATEGORIES,
            "language": kwargs.get("language", "en"),
            "safesearch": "0" if kwargs.get("safeSearch") is False else "1",
            "pageno": 1,
        }
        if self._searxng_engines:
            params["engines"] = self._searxng_engines

        url = f"{self._searxng_url}/search"
        tel: Dict[str, Any] = {"raw_status": None, "content_type": None, "errors": []}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url, params=params, headers={"User-Agent": settings.USER_AGENT})
            tel["raw_status"] = resp.status_code
            tel["content_type"] = resp.headers.get("content-type")
            if resp.status_code != 200:
                tel["errors"].append(f"SearXNG HTTP {resp.status_code}")
                return [], tel
            data = resp.json()
            if data.get("unresponsive_engines"):
                tel["errors"].append(f"Unresponsive engines: {data.get('unresponsive_engines')}")
        except Exception as e:
            tel["errors"].append(f"SearXNG: {e}")
            return [], tel

        parsed, parse_tel = self._parse_and_validate_organic_items(data.get("results", []) or [], limit)
        tel.update(parse_tel)
        return parsed, tel

    # -------------------------------------------------------------------------
    # Strategy A2: Brave Search API (exact query preserved)
    # -------------------------------------------------------------------------

    async def _search_brave(self, query: str, limit: int, **kwargs) -> tuple[List[ProviderResult], Dict[str, Any]]:
        params: Dict[str, Any] = {
            "q": query,
            "count": min(limit, 20),
            "safesearch": "off" if kwargs.get("safeSearch") is False else "moderate",
        }
        tel: Dict[str, Any] = {"raw_status": None, "content_type": None, "errors": []}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    params=params,
                    headers={"X-Subscription-Token": self._brave_key, "Accept": "application/json"},
                )
            tel["raw_status"] = resp.status_code
            tel["content_type"] = resp.headers.get("content-type")
            if resp.status_code != 200:
                tel["errors"].append(f"Brave API HTTP {resp.status_code}")
                return [], tel
            data = resp.json()
        except Exception as e:
            tel["errors"].append(f"Brave API: {e}")
            return [], tel

        raw_items = [
            {
                "title": it.get("title"),
                "url": it.get("url"),
                "content": it.get("description"),
                "publishedDate": it.get("page_age") or it.get("age"),
            }
            for it in (data.get("web", {}) or {}).get("results", []) or []
        ]
        parsed, parse_tel = self._parse_and_validate_organic_items(raw_items, limit)
        tel.update(parse_tel)
        return parsed, tel

    # -------------------------------------------------------------------------
    # Strategy A3: Serper API (exact query preserved)
    # -------------------------------------------------------------------------

    async def _search_serper(self, query: str, limit: int, **kwargs) -> tuple[List[ProviderResult], Dict[str, Any]]:
        tel: Dict[str, Any] = {"raw_status": None, "content_type": None, "errors": []}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    "https://google.serper.dev/search",
                    json={"q": query, "num": min(limit, 20)},
                    headers={"X-API-KEY": self._serper_key, "Content-Type": "application/json"},
                )
            tel["raw_status"] = resp.status_code
            tel["content_type"] = resp.headers.get("content-type")
            if resp.status_code != 200:
                tel["errors"].append(f"Serper API HTTP {resp.status_code}")
                return [], tel
            data = resp.json()
        except Exception as e:
            tel["errors"].append(f"Serper API: {e}")
            return [], tel

        raw_items = [
            {
                "title": it.get("title"),
                "url": it.get("link"),
                "content": it.get("snippet"),
                "publishedDate": it.get("date"),
            }
            for it in data.get("organic", []) or []
        ]
        parsed, parse_tel = self._parse_and_validate_organic_items(raw_items, limit)
        tel.update(parse_tel)
        return parsed, tel

    # -------------------------------------------------------------------------
    # Strategy B: DuckDuckGo Instant Answer API (reference supplement ONLY)
    # -------------------------------------------------------------------------

    async def _search_instant_answer(self, query: str, limit: int) -> tuple[List[ProviderResult], Optional[int], Optional[str]]:
        """
        Call the documented DuckDuckGo Instant Answer API.
        Returns encyclopedic facts, definitions, and related topics strictly tagged `knowledge_ia`.
        Does NOT perform a full web search — clearly documented limitation.
        Results are attributed to DuckDuckGo and original publishers.
        """
        params = {
            "q": query,
            "format": "json",
            "no_html": "1",
            "skip_disambig": "1",
        }
        now = datetime.now(timezone.utc)
        raw_status: Optional[int] = None
        ct: Optional[str] = None
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    self._ddg_api_url,
                    params=params,
                    headers={"User-Agent": settings.USER_AGENT},
                )
            raw_status = resp.status_code
            ct = resp.headers.get("content-type")
            if resp.status_code not in (200, 202):
                return [], raw_status, ct
            data = resp.json()
        except Exception as e:
            logger.debug("[InstantAnswer] Request failed: %s", e)
            return [], raw_status, ct

        results: List[ProviderResult] = []
        heading = (data.get("Heading") or query).strip()

        abstract = (data.get("AbstractText") or "").strip()
        abstract_url = (data.get("AbstractURL") or "").strip()
        abstract_src = (data.get("AbstractSource") or "Reference").strip()
        if abstract and abstract_url and not _is_blocked_host(abstract_url):
            domain = _extract_domain(abstract_url)
            if not domain.endswith("duckduckgo.com"):
                results.append(ProviderResult(
                    title=heading or query,
                    url=abstract_url,
                    snippet=abstract[:500],
                    source_provider=self.name,
                    original_publisher=abstract_src,
                    retrieval_timestamp=now,
                    publication_timestamp=None,
                    source_attribution="DuckDuckGo",
                    is_live=False,
                    source_type="knowledge_ia",
                    domain=domain,
                    score=0.68,
                    language="en",
                    category="reference",
                    provider_type="external_supplement",
                    result_type="web",
                ))

        for r in data.get("Results", []) or []:
            if len(results) >= limit:
                break
            r_url = (r.get("FirstURL") or "").strip()
            txt = (r.get("Text") or "").strip()
            if not r_url or not txt or _is_blocked_host(r_url):
                continue
            dom = _extract_domain(r_url)
            if dom.endswith("duckduckgo.com"):
                continue
            results.append(ProviderResult(
                title=txt[:84] or dom,
                url=r_url,
                snippet=txt[:500],
                source_provider=self.name,
                original_publisher=dom,
                retrieval_timestamp=now,
                publication_timestamp=None,
                source_attribution="DuckDuckGo",
                is_live=False,
                source_type="knowledge_ia",
                domain=dom,
                score=0.72,
                language="en",
                category="general",
                provider_type="external_supplement",
                result_type="web",
            ))

        for topic in data.get("RelatedTopics", []) or []:
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

        return results[:limit], raw_status, ct

    def _parse_topic(self, topic: Dict[str, Any], now: datetime) -> Optional[ProviderResult]:
        try:
            text = (topic.get("Text") or "").strip()
            url = (topic.get("FirstURL") or "").strip()
            if not text or not url or _is_blocked_host(url):
                return None
            domain = _extract_domain(url)
            if domain.endswith("duckduckgo.com"):
                return None
            if " - " in text:
                title, snippet = text.split(" - ", 1)
                title = title.strip()
                snippet = snippet.strip()
            else:
                title = text[:70]
                snippet = text
            return ProviderResult(
                title=title,
                url=url,
                snippet=snippet[:400],
                source_provider=self.name,
                original_publisher=domain,
                retrieval_timestamp=now,
                publication_timestamp=None,
                source_attribution="DuckDuckGo",
                is_live=False,
                source_type="knowledge_ia",
                domain=domain,
                score=0.62,
                language="en",
                category="general",
                provider_type="external_supplement",
                result_type="web",
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
            "primary_organic_configured": bool(self._searxng_url or self._brave_key or self._serper_key),
            "last_telemetry": self.last_telemetry,
        })
        return base


# Singleton
duckduckgo_web_provider = DuckDuckGoWebProvider()
