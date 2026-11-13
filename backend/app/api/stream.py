"""
HS SEARCH - Real-Time Streaming Search API (Server-Sent Events)
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import json
import asyncio
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from typing import Optional, Dict, Any

from app.providers.aggregator import search_aggregator
from app.ai.july import july_assistant
from app.ai.router import ai_router

router = APIRouter(prefix="/api", tags=["Streaming Search"])

@router.get("/search/stream")
async def stream_search(
    q: str = Query(..., description="Search query string"),
    mode: str = Query("general", description="Search mode"),
    sort: str = Query("relevance", description="Sort order"),
    ai_mode: str = Query("auto", description="AI mode: auto, july, gravity, none"),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    location: Optional[str] = Query(None),
    location_mode: Optional[str] = Query("worldwide"),
    radius_km: Optional[float] = Query(None),
    use_hybrid: bool = Query(True)
):
    """
    Real-time Fast Response Streaming Pipeline via Server-Sent Events (SSE):
    1. Query Classification (Instant)
    2. Concurrent Provider Aggregation (Native + Supplemental)
    3. Immediate First Results Stream
    4. Incremental Token Streaming from Internal AI Inference Gateway
    5. Final Summary with Sources and Telemetry
    """
    async def event_generator():
        # Step 1: Query Classification
        routing = await search_aggregator.router.route(q, mode=mode)
        yield f"event: classification\ndata: {json.dumps({'intent': routing.get('intent', 'general'), 'complexity': routing.get('complexity', 'low'), 'needs_geo': routing.get('needs_geo', False)})}\n\n"

        # Step 2: Concurrent Provider Search Aggregation
        try:
            agg_data = await search_aggregator.aggregate_search(
                query=q,
                mode=mode,
                sort=sort,
                limit=15,
                offset=0,
                user_lat=lat,
                user_lon=lon,
                radius_km=radius_km,
                location_name=location,
                location_mode=location_mode,
                ai_mode=ai_mode,
                use_hybrid=use_hybrid
            )

            # Convert SearchResultItems to serializable dicts
            serialized_results = [
                item.model_dump() if hasattr(item, "model_dump") else item
                for item in agg_data.get("results", [])
            ]

            # Step 3: Stream initial results immediately
            results_payload = {
                "results": serialized_results,
                "total_results": agg_data.get("total_results", len(serialized_results)),
                "execution_time_ms": agg_data.get("execution_time_ms", 0),
                "sources_used": agg_data.get("sources_used", []),
                "provider_stats": agg_data.get("provider_stats", {})
            }
            yield f"event: results\ndata: {json.dumps(results_payload, default=str)}\n\n"

            # Step 4: Stream AI Answer Tokens (if AI not turned off)
            if ai_mode != "none" and serialized_results:
                yield f"event: ai_start\ndata: {json.dumps({'model': 'JULY (HS AI Solutions)'})}\n\n"

                tier = "reasoning" if routing.get("complexity") == "high" or mode in ("research", "academic") else "fast"
                full_ai_tokens = []

                async for token in july_assistant.stream_answer_nvidia(q, serialized_results, tier=tier):
                    full_ai_tokens.append(token)
                    yield f"event: ai_token\ndata: {json.dumps({'token': token})}\n\n"

                # Step 5: Final Citations & AI Done
                citations = [
                    {
                        "index": idx,
                        "title": it.get("title"),
                        "url": it.get("url"),
                        "domain": it.get("domain"),
                        "source_provider": it.get("source_provider")
                    }
                    for idx, it in enumerate(serialized_results[:5], start=1)
                ]
                yield f"event: ai_done\ndata: {json.dumps({'citations': citations, 'token_count': len(full_ai_tokens)})}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

        # End of stream
        yield "event: complete\ndata: {}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
