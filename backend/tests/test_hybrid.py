"""
Unit and Integration Tests for HS Search Hybrid Global Engine & Private NVIDIA AI
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import pytest
from app.ai.nvidia_gateway import nvidia_gateway
from app.providers.query_router import query_router
from app.providers.aggregator import search_aggregator
from app.providers.instant import HSInstantAnswerProvider
from app.database.connection import db
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.mark.asyncio
async def test_nvidia_gateway_operational():
    """Verify private AI inference gateway is operational."""
    health = await nvidia_gateway.health_check()
    assert health["status"] == "operational"
    assert "fast" in health["tiers"]
    assert health["tiers"]["fast"]["status"] == "healthy"

@pytest.mark.asyncio
async def test_query_router_classification():
    """Verify intelligent query router correctly routes by intent."""
    r_math = query_router.classify_query_fast("25 * 40")
    assert r_math["intent"] == "live"
    assert "instant" in r_math["provider_names"]

    r_geo = query_router.classify_query_fast("Hospitals in Tambaram")
    assert r_geo["intent"] == "local"
    assert "geo" in r_geo["provider_names"]

    r_news = query_router.classify_query_fast("Breaking news today")
    assert r_news["intent"] == "news"
    assert "news" in r_news["provider_names"]

    r_research = query_router.classify_query_fast("Quantum algorithm scaling study")
    assert r_research["intent"] == "research"
    assert "research" in r_research["provider_names"]

@pytest.mark.asyncio
async def test_search_aggregator_canonical_dedup():
    """Verify aggregator canonicalizes URLs and deduplicates properly."""
    url1 = "https://www.example.com/page/?utm_source=twitter&ref=feed"
    url2 = "https://example.com/page/"
    can1 = search_aggregator.canonicalize_url(url1)
    can2 = search_aggregator.canonicalize_url(url2)
    assert can1 == can2

@pytest.mark.asyncio
async def test_instant_answer_provider():
    """Verify deterministic math computation and live clock."""
    provider = HSInstantAnswerProvider()
    results = await provider.search("50 * 8")
    assert len(results) > 0
    assert "400" in results[0].snippet
    assert results[0].source_type == "live_source"

@pytest.mark.asyncio
async def test_hybrid_search_execution():
    """Verify end-to-end hybrid search aggregation and provider metrics."""
    await db.init_db()
    res = await search_aggregator.aggregate_search("Artificial intelligence", ai_mode="none", use_hybrid=True)
    assert res["total_results"] > 0
    assert res["is_hybrid"] is True
    assert "HS Native Index" in res["sources_used"]
    first = res["results"][0]
    assert hasattr(first, "source_provider")
    assert hasattr(first, "source_category")

def test_admin_gateway_api():
    """Verify internal admin gateway health and stats endpoints."""
    r_health = client.get("/api/admin/gateway/health")
    assert r_health.status_code == 200
    assert r_health.json()["status"] == "operational"

    r_stats = client.get("/api/admin/gateway/stats")
    assert r_stats.status_code == 200
    assert "circuit_status" in r_stats.json()
