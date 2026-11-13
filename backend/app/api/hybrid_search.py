"""
Pendulum Hybrid Search API
Company: HS AI Solutions
Founder: Harshan Seliyan

POST /api/search/hybrid  — Full hybrid search (Pendulum native + external)
GET  /api/admin/search-dashboard — Provider health & ranking statistics
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from app.config import settings
from app.ranking.scorer import search_scorer
from app.providers.duckduckgo_web import duckduckgo_web_provider
from app.ranking.hybrid_ranker import hybrid_ranker, hybrid_ranker_stats

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Hybrid Search"])

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class HybridSearchOptions(BaseModel):
    providers: List[str] = Field(default=["pendulum", "external"],
                                 description="Providers to query")
    sort: str = Field(default="relevance",
                      description="relevance | freshness | authority")
    safeSearch: bool = Field(default=True)
    limit: int = Field(default=20, ge=1, le=50)
    enableRerank: bool = Field(default=False,
                               description="July AI reranking (slower but higher quality)")


class HybridSearchRequest(BaseModel):
    query: str
    location: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    options: HybridSearchOptions = Field(default_factory=HybridSearchOptions)
    page: int = Field(default=1, ge=1)


class ProviderStatus(BaseModel):
    status: str           # ok | error | timeout | skipped
    count: int
    latencyMs: float
    error: Optional[str] = None


class HybridSearchResponse(BaseModel):
    query: str
    cleanQuery: str
    results: List[Dict[str, Any]]
    total: int
    providers: Dict[str, ProviderStatus]
    ranking: Dict[str, Any]
    partial: bool
    executionTimeMs: float
    page: int
    limit: int


# ---------------------------------------------------------------------------
# Hybrid search endpoint
# ---------------------------------------------------------------------------

@router.post("/api/search/hybrid", response_model=HybridSearchResponse)
async def hybrid_search(
    req: HybridSearchRequest,
    background_tasks: BackgroundTasks,
):
    """
    Execute a full hybrid search:
      - Pendulum native index (BM25 + semantic + geo scoring)
      - External search provider (SearXNG or Instant Answer API)
    Results are merged, deduplicated, and ranked using RRF + 7-component scoring.
    """
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    query = req.query.strip()
    opts = req.options
    offset = (req.page - 1) * opts.limit
    t_start = time.perf_counter()

    enable_pendulum = "pendulum" in opts.providers
    enable_external = "external" in opts.providers

    provider_status: Dict[str, ProviderStatus] = {}
    pendulum_results_raw: List[Dict] = []
    external_results_raw: List[Dict] = []

    # -------------------------------------------------------------------------
    # Concurrent provider execution
    # -------------------------------------------------------------------------

    async def run_pendulum():
        t0 = time.perf_counter()
        try:
            data = await asyncio.wait_for(
                search_scorer.execute_search(
                    query=query,
                    mode="general",
                    sort_by="relevance",
                    limit=opts.limit * 2,   # over-fetch for better dedup
                    offset=0,
                    user_lat=req.lat,
                    user_lon=req.lon,
                    location_name=req.location,
                ),
                timeout=getattr(settings, "HYBRID_PENDULUM_TIMEOUT_SEC", 4.0),
            )
            items = data.get("results", [])
            # Normalize SearchResultItem dicts
            normalized = []
            for it in items:
                if hasattr(it, "model_dump"):
                    normalized.append(it.model_dump())
                elif isinstance(it, dict):
                    normalized.append(it)
            lat_ms = (time.perf_counter() - t0) * 1000
            hybrid_ranker_stats.record_latency("pendulum", lat_ms)
            return normalized, lat_ms, None
        except asyncio.TimeoutError:
            lat_ms = (time.perf_counter() - t0) * 1000
            hybrid_ranker_stats.record_error("pendulum")
            return [], lat_ms, "timeout"
        except Exception as exc:
            lat_ms = (time.perf_counter() - t0) * 1000
            hybrid_ranker_stats.record_error("pendulum")
            logger.warning("[HybridSearch] Pendulum error: %s", exc)
            return [], lat_ms, str(exc)

    async def run_external():
        t0 = time.perf_counter()
        try:
            provider_results = await asyncio.wait_for(
                duckduckgo_web_provider.search(query, limit=opts.limit),
                timeout=getattr(settings, "HYBRID_DDG_TIMEOUT_SEC", 2.5),
            )
            # Convert ProviderResult objects → dicts
            normalized = []
            for r in provider_results:
                if hasattr(r, "__dict__"):
                    d = r.__dict__.copy()
                    d["url"] = getattr(r, "url", "")
                    d["title"] = getattr(r, "title", "")
                    d["snippet"] = getattr(r, "snippet", "")
                    d["domain"] = getattr(r, "domain", "")
                    d["score"] = getattr(r, "score", 0.5)
                    pub_ts = getattr(r, "publication_timestamp", None)
                    d["publication_timestamp"] = pub_ts.isoformat() if pub_ts else None
                    ret_ts = getattr(r, "retrieval_timestamp", None)
                    d["retrieval_timestamp"] = ret_ts.isoformat() if ret_ts else None
                    normalized.append(d)
                elif isinstance(r, dict):
                    normalized.append(r)
            lat_ms = (time.perf_counter() - t0) * 1000
            hybrid_ranker_stats.record_latency("external", lat_ms)
            return normalized, lat_ms, None
        except asyncio.TimeoutError:
            lat_ms = (time.perf_counter() - t0) * 1000
            hybrid_ranker_stats.record_error("external")
            return [], lat_ms, "timeout"
        except Exception as exc:
            lat_ms = (time.perf_counter() - t0) * 1000
            hybrid_ranker_stats.record_error("external")
            logger.warning("[HybridSearch] External error: %s", exc)
            return [], lat_ms, str(exc)

    # Build coroutines
    coroutines = []
    coro_labels = []
    if enable_pendulum:
        coroutines.append(run_pendulum())
        coro_labels.append("pendulum")
    if enable_external:
        coroutines.append(run_external())
        coro_labels.append("external")

    results_raw = await asyncio.gather(*coroutines, return_exceptions=True)

    # Unpack results
    p_lat = e_lat = 0.0
    p_err = e_err = None

    for label, res in zip(coro_labels, results_raw):
        if isinstance(res, Exception):
            if label == "pendulum":
                p_err = str(res)
                hybrid_ranker_stats.record_error("pendulum")
            else:
                e_err = str(res)
                hybrid_ranker_stats.record_error("external")
        else:
            items, latency, error = res
            if label == "pendulum":
                pendulum_results_raw = items
                p_lat = latency
                p_err = error
            else:
                external_results_raw = items
                e_lat = latency
                e_err = error

    # Build provider status
    if enable_pendulum:
        provider_status["pendulum"] = ProviderStatus(
            status="error" if p_err else "ok",
            count=len(pendulum_results_raw),
            latencyMs=round(p_lat, 1),
            error=p_err,
        )
    if enable_external:
        provider_status["external"] = ProviderStatus(
            status="error" if e_err else "ok",
            count=len(external_results_raw),
            latencyMs=round(e_lat, 1),
            error=e_err,
        )

    partial = bool(
        (enable_pendulum and p_err) or
        (enable_external and e_err)
    )

    # -------------------------------------------------------------------------
    # Merge, deduplicate, rank
    # -------------------------------------------------------------------------
    merged = hybrid_ranker.merge_and_rank(
        pendulum_results=pendulum_results_raw,
        external_results=external_results_raw,
        user_lat=req.lat,
        user_lon=req.lon,
        limit=opts.limit * 2,   # merge full set, paginate after
    )

    # -------------------------------------------------------------------------
    # Optional July AI reranking (top candidates)
    # -------------------------------------------------------------------------
    if opts.enableRerank and merged:
        rerank_top_n = getattr(settings, "HYBRID_RERANK_TOP_N", 10)
        try:
            merged = await _july_rerank(query, merged, top_n=rerank_top_n)
        except Exception as exc:
            logger.warning("[HybridSearch] July reranking failed: %s", exc)

    # Paginate
    total = len(merged)
    page_results = merged[offset: offset + opts.limit]

    execution_ms = round((time.perf_counter() - t_start) * 1000, 1)

    # Schedule autonomous index expansion in background
    new_external_urls = [
        r.url for r in page_results if "external" in r.sources and "pendulum" not in r.sources
    ]
    if new_external_urls:
        background_tasks.add_task(_expand_index, new_external_urls, query)

    return HybridSearchResponse(
        query=query,
        cleanQuery=query,
        results=[r.to_dict() for r in page_results],
        total=total,
        providers=provider_status,
        ranking={
            "algorithm": "RRF+WeightedScore",
            "version": "1.0",
            "weights": hybrid_ranker.weights,
            "pendulumWeight": getattr(settings, "PENDULUM_PROVIDER_WEIGHT", 1.20),
            "externalWeight": getattr(settings, "DDG_PROVIDER_WEIGHT", 1.00),
        },
        partial=partial,
        executionTimeMs=execution_ms,
        page=req.page,
        limit=opts.limit,
    )


# ---------------------------------------------------------------------------
# Admin dashboard
# ---------------------------------------------------------------------------

@router.get("/api/admin/search-dashboard")
async def search_dashboard():
    """
    Aggregated stats for the Pendulum Hybrid Search Engine.
    Returns provider health, deduplication rates, and ranking metrics.
    """
    provider_health = {}
    try:
        provider_health["pendulum"] = {
            "healthy": True,
            "type": "native",
            "description": "Pendulum independent crawler & index",
        }
    except Exception:
        pass

    try:
        ext_health = await duckduckgo_web_provider.health_check()
        provider_health["external"] = {
            "healthy": not duckduckgo_web_provider.circuit_open,
            "circuitOpen": duckduckgo_web_provider.circuit_open,
            "cacheHits": ext_health.get("cache_hits", 0),
            "cacheSize": ext_health.get("cache_size", 0),
            "searxngConfigured": ext_health.get("searxng_configured", False),
            "lastLatencyMs": ext_health.get("last_latency_ms", 0),
            "failedCalls": ext_health.get("failed_calls", 0),
            "type": "external",
            "description": "External supplementary search (SearXNG / Instant Answer API)",
        }
    except Exception as exc:
        provider_health["external"] = {"healthy": False, "error": str(exc)}

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "stats": hybrid_ranker_stats.to_dict(),
        "providers": provider_health,
        "rankingWeights": hybrid_ranker.weights,
        "config": {
            "pendulumWeight": getattr(settings, "PENDULUM_PROVIDER_WEIGHT", 1.20),
            "externalWeight": getattr(settings, "DDG_PROVIDER_WEIGHT", 1.00),
            "pendulumTimeoutSec": getattr(settings, "HYBRID_PENDULUM_TIMEOUT_SEC", 4.0),
            "externalTimeoutSec": getattr(settings, "HYBRID_DDG_TIMEOUT_SEC", 2.5),
            "cacheTtlSec": getattr(settings, "HYBRID_CACHE_TTL_SEC", 300),
            "searxngUrl": getattr(settings, "SEARXNG_URL", "") or "(not configured)",
        },
    }


# ---------------------------------------------------------------------------
# Background task helpers
# ---------------------------------------------------------------------------

async def _expand_index(urls: List[str], query: str):
    """Enqueue external URLs for Pendulum's autonomous index expansion."""
    try:
        from app.database.connection import db
        from app.database.models import QueueItem
        import urllib.parse

        now = datetime.utcnow()
        items = []
        for url in urls[:8]:  # cap at 8 per query
            parsed = urllib.parse.urlparse(url)
            domain = parsed.netloc.lower()
            if not domain:
                continue
            await db.get_or_create_domain(domain)
            items.append(QueueItem(
                url=url, domain=domain, depth=0, priority=3,
                status="pending", scheduled_for=now, discovered_at=now,
                referrer=f"hybrid_expansion:{query[:30]}",
            ))
        if items:
            await db.enqueue_urls(items)
    except Exception:
        pass


async def _july_rerank(query: str, results: List, top_n: int = 10) -> List:
    """
    Optional July AI reranking of top candidates.
    Sends result titles + snippets to July for relevance re-ordering.
    Falls back to original ranking if July is unavailable or slow.
    """
    try:
        import httpx
        candidates = results[:top_n]
        rest = results[top_n:]

        payload_items = [
            {"rank": i + 1, "id": r.id, "title": r.title, "snippet": r.snippet[:200]}
            for i, r in enumerate(candidates)
        ]
        prompt = (
            f'Rerank the following {len(candidates)} search results for the query: "{query}"\n\n'
            f"Return ONLY a JSON array of result IDs in order from most to least relevant.\n"
            f"Results:\n"
            + "\n".join(f'{i["rank"]}. [{i["id"]}] {i["title"]} — {i["snippet"]}' for i in payload_items)
        )

        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                settings.JULY_CLOUD_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {settings.JULY_CLOUD_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.JULY_CLOUD_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "max_tokens": 200,
                },
            )
        if resp.status_code != 200:
            return results

        content = resp.json()["choices"][0]["message"]["content"].strip()
        # Parse JSON array of IDs
        import json, re
        match = re.search(r"\[.*?\]", content, re.DOTALL)
        if not match:
            return results
        id_list = json.loads(match.group())
        id_map = {r.id: r for r in candidates}
        reranked = [id_map[rid] for rid in id_list if rid in id_map]
        # Append any candidates not mentioned
        reranked_ids = set(id_list)
        for r in candidates:
            if r.id not in reranked_ids:
                reranked.append(r)
        return reranked + rest

    except Exception as exc:
        logger.debug("[HybridSearch] July rerank skipped: %s", exc)
        return results
