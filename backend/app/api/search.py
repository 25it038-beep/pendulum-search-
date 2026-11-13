"""
Search API Router for HS SEARCH
Company: HS AI Solutions
"""

from fastapi import APIRouter, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
import asyncio
import time
import httpx
from app.config import settings
from app.ranking.scorer import search_scorer
from app.ai.router import ai_router
from app.ai.gravity import gravity_agent
from app.database.connection import db
from app.providers.instant_answer import instant_answer_provider
from app.providers.video import video_search_provider
from app.providers.image import image_search_provider
from app.providers.map import map_search_provider

router = APIRouter(prefix="/api", tags=["Search"])

@router.get("/search")
async def perform_search(
    q: str = Query(..., description="Search query string"),
    mode: str = Query("general", description="Search mode: general, latest, news, tech, academic, image, video, research, realtime"),
    sort: str = Query("relevance", description="Sort by: relevance, newest, oldest, closest, best_rated"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(15, ge=1, le=50, description="Results per page"),
    ai_mode: str = Query("auto", description="AI mode: auto, july, gravity, none"),
    lat: Optional[float] = Query(None, description="User or query latitude"),
    lon: Optional[float] = Query(None, description="User or query longitude"),
    radius_km: Optional[float] = Query(None, description="Radius in kilometers"),
    location: Optional[str] = Query(None, description="Location filter (city, region, country, or 'worldwide')"),
    location_mode: Optional[str] = Query(None, description="Location mode: worldwide, near_me, city, region, country"),
    ranking_mode: Optional[str] = Query(None, description="Ranking mode: most_relevant, near_me, closest_first, best_rated, recently_updated, city_specific, country_specific, worldwide"),
    domain_filter: Optional[str] = Query(None, description="Filter by domain (e.g. site:wikipedia.org)"),
    content_type_filter: Optional[str] = Query(None, description="Filter by content type: html, pdf, video, image, api"),
    language_filter: Optional[str] = Query(None, description="Filter by language code: en, ta, hi, fr, ..."),
    category_filter: Optional[str] = Query(None, description="Filter by category: healthcare, education, news, ..."),
    freshness_filter: Optional[str] = Query(None, description="Filter by freshness: hour, day, week, month"),
    use_hybrid: bool = Query(True, description="Enable multi-source hybrid search aggregator")
):
    """
    Execute search across independent HS Search infrastructure and authorized supplemental providers.
    Combines lexical BM25, semantic vector retrieval, Global Geolocation Intelligence, and private NVIDIA AI.
    """
    offset = (page - 1) * limit

    if use_hybrid:
        from app.providers.aggregator import search_aggregator
        agg_data = await search_aggregator.aggregate_search(
            query=q,
            mode=mode,
            sort=sort,
            limit=limit,
            offset=offset,
            user_lat=lat,
            user_lon=lon,
            radius_km=radius_km,
            location_name=location,
            location_mode=location_mode,
            ranking_mode=ranking_mode,
            ai_mode=ai_mode,
            use_hybrid=True
        )
        # Fetch native geo_metadata
        native_data = await search_scorer.execute_search(
            query=q, mode=mode, sort_by=sort, limit=1, offset=0,
            user_lat=lat, user_lon=lon, radius_km=radius_km,
            location_name=location, location_mode=location_mode, ranking_mode=ranking_mode
        )
        geo_meta = native_data.get("geo_metadata")
        search_results = agg_data.get("results", [])
        total_results = agg_data.get("total_results", len(search_results))
        execution_time_ms = agg_data.get("execution_time_ms", 0)
        sources_used = agg_data.get("sources_used", ["HS Native Index"])
        provider_stats = agg_data.get("provider_stats", {})
        query_intent = agg_data.get("query_intent", "general")
        query_complexity = agg_data.get("query_complexity", "low")
        is_hybrid = True
    else:
        search_data = await search_scorer.execute_search(
            query=q,
            mode=mode,
            sort_by=sort,
            limit=limit,
            offset=offset,
            user_lat=lat,
            user_lon=lon,
            radius_km=radius_km,
            location_name=location,
            location_mode=location_mode,
            ranking_mode=ranking_mode,
            domain_filter=domain_filter,
            content_type_filter=content_type_filter,
            language_filter=language_filter,
            category_filter=category_filter,
            freshness_filter=freshness_filter
        )
        geo_meta = search_data.get("geo_metadata")
        search_results = search_data["results"]
        total_results = search_data["total_results"]
        execution_time_ms = search_data["execution_time_ms"]
        sources_used = ["HS Native Index"]
        provider_stats = {"HS Native Index": {"count": total_results, "status": "ok"}}
        query_intent = "general"
        query_complexity = "low"
        is_hybrid = False

    ai_answer = None
    if ai_mode != "none":
        try:
            ai_answer = await ai_router.generate_response_hybrid(
                query=q,
                search_results=[r.model_dump() if hasattr(r, "model_dump") else r for r in search_results],
                model_preference=ai_mode,
                mode=mode,
                geo_metadata=geo_meta,
                query_complexity=query_complexity
            )
        except Exception as e:
            ai_answer = {"error": f"AI synthesis temporarily deferred: {str(e)}"}

    return {
        "engine": "HS SEARCH",
        "company": "HS AI Solutions",
        "founder": "Harshan Seliyan",
        "query": q,
        "clean_query": q,
        "mode": mode,
        "sort": sort,
        "ranking_mode": ranking_mode or "most_relevant",
        "page": page,
        "total_results": total_results,
        "execution_time_ms": execution_time_ms,
        "geo_metadata": geo_meta,
        "applied_filters": {},
        "ai_intelligence": ai_answer,
        "sources_used": sources_used,
        "provider_stats": provider_stats,
        "query_intent": query_intent,
        "query_complexity": query_complexity,
        "is_hybrid": is_hybrid,
        "additional_information": [],
        "results": search_results
    }

@router.post("/search")
async def perform_search_post(
    req: Dict[str, Any]
):
    """
    POST search handler for Pendulum Search frontend and programmatic clients.
    Accepts: { query, type, aiOverview, safeSearch, limit, page }
    Returns: { results, answer, total, execution_time_ms, additional_information, media, ai_intelligence }
    """
    start_total = time.perf_counter()
    q = req.get("query") or req.get("q", "")
    if not q or not q.strip():
        return {
            "results": [],
            "total": 0,
            "answer": None,
            "additional_information": [],
            "media": {"videos": [], "images": [], "maps": []}
        }

    raw_type = str(req.get("type", "All")).strip().lower()
    limit = int(req.get("limit", 15))
    page = int(req.get("page", 1))
    offset = (page - 1) * limit
    ai_overview = bool(req.get("aiOverview", True))

    # --- 1. Specialized Category Handling ---
    if raw_type == "videos":
        videos = await video_search_provider.search(q, limit=limit)
        formatted_results = []
        for v in videos:
            formatted_results.append({
                "id": v["id"],
                "title": v["title"],
                "url": v["url"],
                "embed_url": v.get("embed_url"),
                "snippet": v.get("description") or f"Watch on {v.get('source')}",
                "source": v.get("publisher") or v.get("source"),
                "publishedAt": v.get("duration_str") or "HD Video",
                "thumbnail_url": v.get("thumbnail_url"),
                "media_type": v.get("media_type", "youtube"),
                "video_id": v.get("video_id"),
                "category": "video"
            })
        exec_ms = round((time.perf_counter() - start_total) * 1000.0, 1)
        return {
            "engine": "Pendulum Video Search",
            "company": "HS AI Solutions",
            "founder": "Harshan Seliyan",
            "query": q,
            "total": len(videos),
            "execution_time_ms": exec_ms,
            "type": "videos",
            "results": formatted_results,
            "videos": videos,
            "additional_information": [],
            "answer": None
        }

    if raw_type == "images":
        images = await image_search_provider.search(q, limit=limit)
        formatted_results = []
        for img in images:
            formatted_results.append({
                "id": img["id"],
                "title": img["title"],
                "url": img["url"],
                "thumbnail_url": img.get("thumbnail_url"),
                "snippet": img.get("attribution") or img.get("description"),
                "source": img.get("source"),
                "creator": img.get("creator"),
                "creator_url": img.get("creator_url"),
                "license": img.get("license"),
                "license_url": img.get("license_url"),
                "allow_download": img.get("allow_download", True),
                "width": img.get("width"),
                "height": img.get("height"),
                "publishedAt": img.get("license"),
                "category": "image"
            })
        exec_ms = round((time.perf_counter() - start_total) * 1000.0, 1)
        return {
            "engine": "Pendulum Image Search",
            "company": "HS AI Solutions",
            "founder": "Harshan Seliyan",
            "query": q,
            "total": len(images),
            "execution_time_ms": exec_ms,
            "type": "images",
            "results": formatted_results,
            "images": images,
            "additional_information": [],
            "answer": None
        }

    if raw_type == "maps":
        map_data = await map_search_provider.search(q, limit=limit)
        places = map_data.get("places", [])
        formatted_results = []
        for p in places:
            formatted_results.append({
                "id": f"map_{p.get('osm_id', p.get('name'))}",
                "title": p.get("name"),
                "url": p.get("directions_url", f"https://www.openstreetmap.org/search?query={p.get('name')}"),
                "snippet": p.get("display_name"),
                "source": "OpenStreetMap",
                "lat": p.get("lat"),
                "lon": p.get("lon"),
                "publishedAt": p.get("type", "location").title(),
                "category": "map"
            })
        exec_ms = round((time.perf_counter() - start_total) * 1000.0, 1)
        return {
            "engine": "Pendulum Maps",
            "company": "HS AI Solutions",
            "founder": "Harshan Seliyan",
            "query": q,
            "total": len(places),
            "execution_time_ms": exec_ms,
            "type": "maps",
            "results": formatted_results,
            "map_data": map_data,
            "additional_information": [],
            "answer": None
        }

    # --- 2. Universal "All" Search with Parallel Orchestration ---
    type_mode_map = {
        "all": "general",
        "news": "news",
        "shopping": "general",
        "books": "academic",
        "research": "research"
    }
    mode = type_mode_map.get(raw_type, "general")
    category_filter = "commerce" if raw_type == "shopping" else None

    # Concurrently run native index search, DuckDuckGo Instant Answers, and media preview discovery
    native_task = asyncio.create_task(search_scorer.execute_search(
        query=q,
        mode=mode,
        limit=limit,
        offset=offset,
        category_filter=category_filter
    ))
    ddg_task = asyncio.create_task(instant_answer_provider.search(query=q, limit=4))
    video_preview_task = asyncio.create_task(video_search_provider.search(query=q, limit=2))
    image_preview_task = asyncio.create_task(image_search_provider.search(query=q, limit=4))

    raw_responses = await asyncio.gather(
        native_task,
        asyncio.wait_for(ddg_task, timeout=1.8),
        asyncio.wait_for(video_preview_task, timeout=1.5),
        asyncio.wait_for(image_preview_task, timeout=1.5),
        return_exceptions=True
    )

    search_data = raw_responses[0] if isinstance(raw_responses[0], dict) else {"results": [], "total_results": 0, "execution_time_ms": 0}
    ddg_results = raw_responses[1] if isinstance(raw_responses[1], list) else []
    preview_videos = raw_responses[2] if isinstance(raw_responses[2], list) else []
    preview_images = raw_responses[3] if isinstance(raw_responses[3], list) else []

    # Format DuckDuckGo supplementary information cards
    formatted_ddg = []
    for item in ddg_results:
        formatted_ddg.append({
            "title": item.title,
            "url": item.url,
            "snippet": item.snippet,
            "source": item.original_publisher or item.domain or "DuckDuckGo",
            "domain": item.domain,
            "source_provider": item.source_provider,
            "attribution": item.source_attribution,
            "category": item.category
        })

    # Build combined evidence for July AI grounded synthesis
    ai_synthesis_results = list(search_data.get("results", []))
    for add_item in formatted_ddg:
        ai_synthesis_results.append({
            "title": add_item["title"],
            "url": add_item["url"],
            "snippet": add_item["snippet"],
            "domain": add_item["domain"],
            "source_type": "external_partner",
            "published_str": "Verified Source",
            "indexed_str": "Instant Knowledge"
        })

    # Synthesize July AI answer
    ai_answer = None
    ai_data = None
    if ai_overview:
        try:
            ai_data = await ai_router.generate_response(
                query=q,
                search_results=ai_synthesis_results,
                model_preference="auto",
                mode=mode,
                geo_metadata=search_data.get("geo_metadata")
            )
            ai_answer = ai_data.get("summary") or ai_data.get("direct_answer")
        except Exception:
            ai_answer = None

    # Format Native results
    formatted_results = []
    for item in search_data.get("results", []):
        pub_dt = item.get("published_at")
        pub_str = item.get("published_str")
        if not pub_str and pub_dt:
            try:
                pub_str = pub_dt.strftime("%b %d, %Y")
            except Exception:
                pub_str = str(pub_dt)

        formatted_results.append({
            "id": item.get("id"),
            "title": item.get("title"),
            "url": item.get("url"),
            "snippet": item.get("snippet"),
            "source": item.get("domain") or item.get("source_type", "Web"),
            "publishedAt": pub_str,
            "score": item.get("score"),
            "category": item.get("category"),
            "language": item.get("language")
        })

    exec_time_ms = round((time.perf_counter() - start_total) * 1000.0, 1)

    return {
        "engine": "Pendulum Search",
        "company": "HS AI Solutions",
        "founder": "Harshan Seliyan",
        "query": q,
        "type": "all",
        "total": search_data.get("total_results", len(formatted_results)),
        "answer": ai_answer,
        "execution_time_ms": exec_time_ms,
        "results": formatted_results,
        "additional_information": formatted_ddg,
        "ai_intelligence": ai_data,
        "media": {
            "videos": preview_videos,
            "images": preview_images
        }
    }

@router.get("/research")
async def deep_research(
    q: str = Query(..., description="Research query")
):
    """
    Execute autonomous deep research using HS GRAVITY.
    Runs multi-query decomposition, multi-source cross-referencing, and produces a structured report.
    """
    report = await gravity_agent.execute_deep_research(q)
    return {
        "engine": "HS SEARCH — GRAVITY Autonomous Research Agent",
        "company": "HS AI Solutions",
        "report": report
    }

@router.get("/suggestions")
async def get_suggestions(
    q: str = Query(..., min_length=1, description="Prefix to autocomplete")
):
    """
    Real-time search suggestions based on indexed document titles and previous search logs.
    """
    clean_prefix = q.strip().lower()
    suggestions = []

    async with db.get_connection() as conn:
        # Search document titles
        cursor = await conn.execute(
            """SELECT DISTINCT title FROM documents 
               WHERE lower(title) LIKE ? 
               ORDER BY quality_score DESC LIMIT 6""",
            (f"%{clean_prefix}%",)
        )
        for r in await cursor.fetchall():
            title = r["title"]
            if len(title) > 60:
                title = title[:60] + "..."
            if title not in suggestions:
                suggestions.append(title)

        # Search past queries
        cursor2 = await conn.execute(
            """SELECT DISTINCT query FROM search_queries
               WHERE lower(query) LIKE ?
               ORDER BY id DESC LIMIT 4""",
            (f"{clean_prefix}%",)
        )
        for r in await cursor2.fetchall():
            query_str = r["query"]
            if query_str not in suggestions and query_str != q:
                suggestions.append(query_str)

    return {"suggestions": suggestions[:8]}

@router.post("/july/chat")
async def july_chat(
    req: Dict[str, Any]
):
    """
    Direct proxy and streaming bridge to July LLM Cloud (Modal Serverless Service).
    Supports multi-turn messages, streaming SSE tokens, and grounding.
    """
    messages = req.get("messages", [])
    model = req.get("model", getattr(settings, "JULY_CLOUD_MODEL", "july-lite"))
    stream = bool(req.get("stream", False))
    max_tokens = req.get("max_tokens", 512)

    headers = {
        "Authorization": f"Bearer {getattr(settings, 'JULY_CLOUD_API_KEY', 'hs-july-cloud-key-secure')}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "max_tokens": max_tokens
    }

    if stream:
        async def event_generator():
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    async with client.stream("POST", settings.JULY_CLOUD_ENDPOINT, json=payload, headers=headers) as resp:
                        async for chunk in resp.aiter_bytes():
                            yield chunk
            except Exception as e:
                yield f"data: {{\"error\": \"{str(e)}\"}}\n\n".encode("utf-8")

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        )
    else:
        try:
            async with httpx.AsyncClient(timeout=getattr(settings, "JULY_CLOUD_TIMEOUT_SEC", 20.0)) as client:
                resp = await client.post(settings.JULY_CLOUD_ENDPOINT, json=payload, headers=headers)
                return resp.json()
        except Exception as e:
            return {"error": str(e), "choices": [{"message": {"content": "July Cloud is initializing. Please retry in a few seconds."}}]}
