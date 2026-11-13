"""
HS SEARCH - Administrator Inference & Provider Control Panel API
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, Optional
from app.ai.nvidia_gateway import nvidia_gateway
from app.providers.aggregator import search_aggregator

router = APIRouter(prefix="/api/admin/gateway", tags=["Admin Gateway"])

@router.get("/health")
async def gateway_health() -> Dict[str, Any]:
    """
    Administrator endpoint: Check health status across all internal AI model tiers
    and search provider circuit breakers. Credentials are never exposed.
    """
    ai_health = await nvidia_gateway.health_check()
    provider_health = search_aggregator.get_provider_health()

    return {
        "status": "operational",
        "company": "HS AI Solutions",
        "engine": "HS Search Hybrid Infrastructure",
        "ai_inference": ai_health,
        "search_providers": provider_health,
        "total_aggregations": search_aggregator.total_aggregations
    }

@router.get("/stats")
async def gateway_stats() -> Dict[str, Any]:
    """
    Administrator endpoint: Detailed token metrics, latency percentiles,
    and estimated inference cost across Fast, Quality, and Reasoning tiers.
    """
    stats_data = nvidia_gateway.get_usage_stats()
    
    # Calculate estimated cost based on standard model catalog rates
    # ($0.0001 per 1K tokens for fast, $0.0007 per 1K tokens for reasoning)
    fast_tokens = stats_data["stats"]["fast"]["total_tokens"]
    reasoning_tokens = stats_data["stats"]["reasoning"]["total_tokens"]
    quality_tokens = stats_data["stats"]["quality"]["total_tokens"]

    est_cost = (fast_tokens * 0.0000001) + (reasoning_tokens * 0.0000007) + (quality_tokens * 0.0000008)

    return {
        "telemetry": stats_data,
        "estimated_compute_cost_usd": round(est_cost, 6),
        "circuit_status": stats_data["circuit_status"]
    }

@router.post("/test-inference")
async def test_inference(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    Administrator test probe: Execute internal inference test prompt across any model tier.
    """
    tier = payload.get("tier", "fast")
    prompt = payload.get("prompt", "What is HS Search? Provide a one sentence definition.")

    messages = [
        {"role": "system", "content": "You are the internal intelligence engine for HS Search by HS AI Solutions."},
        {"role": "user", "content": prompt}
    ]

    import time
    start = time.perf_counter()
    output = await nvidia_gateway.complete(messages, tier=tier, max_tokens=150)
    latency_ms = round((time.perf_counter() - start) * 1000.0, 1)

    return {
        "tier": tier,
        "model": nvidia_gateway._resolve_model(tier),
        "prompt": prompt,
        "response": output,
        "latency_ms": latency_ms,
        "status": "success" if output else "failed"
    }
