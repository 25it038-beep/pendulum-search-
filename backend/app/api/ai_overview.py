"""
Pendulum Search - AI Overview API Router
Company: HS AI Solutions
Founder: Harshan Seliyan

Google-style AI Overview API powered by July AI and HS Gravity:
- POST /api/ai/search: Grounded AI overview with inline citations, source cards, related questions, and integrated media
- POST /api/ai/followup: Conversational follow-up preserving session context
- POST /api/ai/overview: Standalone AI overview generator
- GET /api/ai/sources/{id}: Detailed source inspection
- GET /api/ai/stream: Server-Sent Events (SSE) streaming answer synthesis
"""

import asyncio
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.ai.gravity import gravity_agent
from app.ai.july import july_assistant
from app.ai.router import ai_router
from app.providers.image import image_search_provider
from app.providers.instant_answer import instant_answer_provider
from app.providers.map import map_search_provider
from app.providers.video import video_search_provider
from app.ranking.scorer import search_scorer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI Overview"])

# In-memory source store for deep inspection: source_id -> metadata
_SOURCE_STORE: Dict[str, Dict[str, Any]] = {}


def _get_favicon_url(url: str) -> str:
    """Derive favicon URL from web domain."""
    try:
        domain = urlparse(url).netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return f"https://www.google.com/s2/favicons?domain={domain}&sz=32"
    except Exception:
        return "https://www.google.com/s2/favicons?domain=example.com&sz=32"


def _generate_related_questions(query: str, search_results: List[Dict[str, Any]]) -> List[str]:
    """Generate intelligent related follow-up questions tailored to search intent."""
    q_lower = query.lower().strip()
    words = [w for w in re.findall(r"\b[a-zA-Z]{3,}\b", q_lower) if w not in ("what", "how", "why", "when", "where", "does", "the", "and")]
    topic = " ".join(words[:3]).title() if words else query.title()

    questions = []
    if any(k in q_lower for k in ["how to", "tutorial", "build", "create", "make", "step"]):
        questions = [
            f"What are the prerequisites for {topic}?",
            f"What are common mistakes when implementing {topic}?",
            f"What is the best alternative to {topic}?"
        ]
    elif any(k in q_lower for k in ["vs", "compare", "difference", "better"]):
        questions = [
            f"What are the pros and cons of each option?",
            f"Which option offers better long-term performance?",
            f"What do industry benchmarks say about this comparison?"
        ]
    elif any(k in q_lower for k in ["what is", "explain", "who is", "definition"]):
        questions = [
            f"How does {topic} actually work in practice?",
            f"What is the history and background of {topic}?",
            f"What are the future developments expected for {topic}?"
        ]
    else:
        questions = [
            f"How does {topic} compare to leading alternatives?",
            f"What are the key real-world applications of {topic}?",
            f"What are the latest research breakthroughs in {topic}?"
        ]

    # Add questions from retrieved titles if available
    for it in search_results[:3]:
        t = it.get("title", "")
        if "?" in t and len(t) < 70 and t not in questions:
            questions.append(t)

    return questions[:4]


def _detect_format_type(query: str) -> str:
    """Detect appropriate structured layout based on query intent."""
    q = query.lower()
    if any(w in q for w in ["vs", "compare", "difference between", "versus"]):
        return "comparison"
    if any(w in q for w in ["how to", "steps to", "guide", "tutorial", "recipe"]):
        return "tutorial"
    if any(w in q for w in ["what is", "define", "meaning of"]):
        return "definition"
    if any(w in q for w in ["research", "study", "paper", "scientific", "quantum", "physics"]):
        return "research"
    if any(w in q for w in ["latest", "news", "today", "current", "update"]):
        return "current_events"
    return "explanation"


@router.post("/search")
async def ai_search(req: Dict[str, Any]):
    """
    Primary AI Search endpoint:
    1. Analyzes user search intent
    2. Concurrently retrieves from Pendulum Index, DuckDuckGo Instant Answers, and media catalogs
    3. Synthesizes a grounded answer with inline citations [1], [2]
    4. Attaches verified source cards, related follow-up questions, and relevant media (images, video, map)
    """
    start_time = time.perf_counter()
    q = (req.get("query") or req.get("q", "")).strip()
    if not q:
        raise HTTPException(status_code=400, detail="Search query is required")

    model_pref = req.get("model", "auto")  # auto, july, gravity
    format_type = _detect_format_type(q)

    # Parallel retrieval from multi-source search architecture
    native_task = asyncio.create_task(search_scorer.execute_search(query=q, mode="general", limit=10))
    ddg_task = asyncio.create_task(instant_answer_provider.search(query=q, limit=4))
    img_task = asyncio.create_task(image_search_provider.search(query=q, limit=4))
    video_task = asyncio.create_task(video_search_provider.search(query=q, limit=3))

    # Optional map task if query contains geographic intent
    geo_keywords = ["near", "city", "street", "hotel", "restaurant", "hospital", "where is", "map", "location", "place"]
    needs_map = any(k in q.lower() for k in geo_keywords)
    map_task = asyncio.create_task(map_search_provider.search(q, limit=3)) if needs_map else None

    raw = await asyncio.gather(native_task, ddg_task, img_task, video_task, return_exceptions=True)
    native_data = raw[0] if isinstance(raw[0], dict) else {"results": []}
    ddg_results = raw[1] if isinstance(raw[1], list) else []
    images = raw[2] if isinstance(raw[2], list) else []
    videos = raw[3] if isinstance(raw[3], list) else []

    maps = []
    if map_task:
        try:
            m_res = await map_task
            if m_res and m_res.get("places"):
                maps = m_res.get("places", [])[:3]
        except Exception:
            pass

    # Build grounded passages and deduplicated source cards
    combined_sources: List[Dict[str, Any]] = []
    seen_urls = set()
    source_idx = 1

    # 1. Native indexed results
    for it in native_data.get("results", []):
        url = it.get("url")
        if url and url not in seen_urls:
            seen_urls.add(url)
            s_id = f"src_{source_idx}"
            s_obj = {
                "id": s_id,
                "index": source_idx,
                "title": it.get("title", "Untitled Source"),
                "url": url,
                "domain": it.get("domain") or urlparse(url).netloc,
                "snippet": it.get("snippet", "")[:350],
                "favicon": _get_favicon_url(url),
                "publishedAt": it.get("published_str"),
                "sourceType": "Independently Indexed"
            }
            combined_sources.append(s_obj)
            _SOURCE_STORE[s_id] = s_obj
            source_idx += 1
            if len(combined_sources) >= 5:
                break

    # 2. DuckDuckGo Instant Answers
    for it in ddg_results:
        url = it.url
        if url and url not in seen_urls:
            seen_urls.add(url)
            s_id = f"src_{source_idx}"
            s_obj = {
                "id": s_id,
                "index": source_idx,
                "title": it.title,
                "url": url,
                "domain": it.domain or urlparse(url).netloc,
                "snippet": it.snippet[:350],
                "favicon": _get_favicon_url(url),
                "publishedAt": "Verified Knowledge",
                "sourceType": "DuckDuckGo Instant Answers"
            }
            combined_sources.append(s_obj)
            _SOURCE_STORE[s_id] = s_obj
            source_idx += 1
            if len(combined_sources) >= 8:
                break

    # Generate Grounded Synthesis via July / Gravity
    ai_resp = await ai_router.generate_response(
        query=q,
        search_results=combined_sources,
        model_preference=model_pref,
        mode="general",
        geo_metadata=native_data.get("geo_metadata")
    )

    answer_text = ai_resp.get("summary") or ai_resp.get("direct_answer") or (
        f"Based on retrieved web evidence, {q} encompasses several key concepts. "
        + (" ".join([f"{s['snippet']} [{s['index']}]" for s in combined_sources[:2]]))
    )
    key_points = ai_resp.get("key_takeaways", [])
    if not key_points and combined_sources:
        for idx, s in enumerate(combined_sources[:3], start=1):
            key_points.append(f"{s['title']}: {s['snippet'][:110]}... [{idx}]")

    confidence = "high" if len(combined_sources) >= 3 else ("medium" if combined_sources else "low")
    related_questions = _generate_related_questions(q, combined_sources)
    exec_time_ms = round((time.perf_counter() - start_time) * 1000.0, 1)

    return {
        "query": q,
        "engine": "Pendulum AI Search",
        "company": "HS AI Solutions",
        "founder": "Harshan Seliyan",
        "modelUsed": ai_resp.get("model", "JULY (Fast Assistant)"),
        "execution_time_ms": exec_time_ms,
        "overview": {
            "answer": answer_text,
            "keyPoints": key_points,
            "confidence": confidence,
            "formatType": format_type,
            "directAnswer": ai_resp.get("direct_answer")
        },
        "sources": combined_sources,
        "relatedQuestions": related_questions,
        "media": {
            "images": images[:4],
            "videos": videos[:2],
            "maps": maps[:2]
        }
    }


@router.post("/followup")
async def ai_followup(req: Dict[str, Any]):
    """
    Preserves conversational context and answers follow-up queries
    with grounded citations and multi-turn reasoning.
    """
    q = (req.get("query") or req.get("q", "")).strip()
    original_query = (req.get("originalQuery") or req.get("original_query", "")).strip()
    history = req.get("history", [])

    if not q:
        raise HTTPException(status_code=400, detail="Follow-up query is required")

    combined_context_query = f"{original_query} {q}".strip() if original_query else q
    # Retrieve fresh information for the follow-up
    res = await ai_search({"query": combined_context_query, "model": req.get("model", "auto")})
    res["originalQuery"] = original_query
    res["isFollowup"] = True
    return res


@router.post("/overview")
async def ai_overview_endpoint(req: Dict[str, Any]):
    """Alias for /api/ai/search specifically dedicated to generating the AI Overview."""
    return await ai_search(req)


@router.get("/sources/{source_id}")
async def get_source_details(source_id: str):
    """Retrieve detailed metadata and snippet for a specific cited source card."""
    if source_id in _SOURCE_STORE:
        return _SOURCE_STORE[source_id]
    raise HTTPException(status_code=404, detail=f"Source ID '{source_id}' not found in active session.")


@router.get("/stream")
async def stream_ai_answer(q: str = Query(..., min_length=1)):
    """
    Server-Sent Events (SSE) streaming endpoint:
    Streams thinking state, verified sources, and token-by-token answer synthesis.
    """
    async def event_generator():
        yield f"event: thinking\ndata: {json.dumps({'message': 'Analyzing search intent & querying web sources...'})}\n\n"
        await asyncio.sleep(0.08)

        # Retrieve
        ai_data = await ai_search({"query": q})
        overview = ai_data.get("overview", {})
        sources = ai_data.get("sources", [])
        media = ai_data.get("media", {})

        # Yield sources first
        yield f"event: sources\ndata: {json.dumps({'sources': sources, 'media': media})}\n\n"

        # Stream answer tokens progressively
        answer = overview.get("answer", "")
        words = answer.split(" ")
        chunk = []
        for i, word in enumerate(words):
            chunk.append(word)
            if len(chunk) >= 3 or i == len(words) - 1:
                yield f"event: token\ndata: {json.dumps({'token': ' ' + ' '.join(chunk)})}\n\n"
                chunk = []
                await asyncio.sleep(0.025)

        # Final completion event
        yield f"event: done\ndata: {json.dumps(ai_data)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
