"""
Tests for Pendulum Media Providers, Geospatial Search & AI Overview
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.providers.video import video_search_provider
from app.providers.image import image_search_provider
from app.providers.map import geocoding_provider, map_search_provider
from app.providers.instant_answer import instant_answer_provider


@pytest.mark.asyncio
async def test_instant_answer_provider():
    res = await instant_answer_provider.search("Python programming", limit=3)
    assert isinstance(res, list)
    if res:
        item = res[0]
        assert item.url
        assert item.title
        assert "DuckDuckGo" in item.source_attribution or "DuckDuckGo" in item.source_provider


@pytest.mark.asyncio
async def test_video_search_provider():
    videos = await video_search_provider.search("Quantum Computing", limit=4)
    assert isinstance(videos, list)
    if videos:
        v = videos[0]
        assert "url" in v
        assert "title" in v
        assert "embed_url" in v
        assert v.get("media_type") in ("youtube", "html5")


@pytest.mark.asyncio
async def test_image_search_provider():
    images = await image_search_provider.search("galaxy", limit=4)
    assert isinstance(images, list)
    if images:
        img = images[0]
        assert "url" in img
        assert "thumbnail_url" in img
        assert "license" in img
        assert "source" in img


@pytest.mark.asyncio
async def test_map_search_provider():
    places = await geocoding_provider.geocode("Paris", limit=2)
    assert isinstance(places, list)
    if places:
        p = places[0]
        assert "lat" in p
        assert "lon" in p
        assert "display_name" in p


@pytest.mark.asyncio
async def test_api_video_search_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/api/videos/search?q=space&limit=3")
        assert r.status_code == 200
        data = r.json()
        assert "results" in data
        assert "total" in data


@pytest.mark.asyncio
async def test_api_image_search_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/api/images/search?q=ocean&limit=3")
        assert r.status_code == 200
        data = r.json()
        assert "results" in data


@pytest.mark.asyncio
async def test_api_maps_search_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/api/maps/search?q=Tokyo&limit=2")
        assert r.status_code == 200
        data = r.json()
        assert "primary" in data


@pytest.mark.asyncio
async def test_api_ai_search_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {"query": "What is photosynthesis?", "model": "auto"}
        r = await ac.post("/api/ai/search", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert "overview" in data
        assert "answer" in data["overview"]
        assert "sources" in data
        assert "relatedQuestions" in data
        assert "media" in data


@pytest.mark.asyncio
async def test_pendulum_post_search_orchestration():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {"query": "Artificial intelligence", "type": "all", "aiOverview": True}
        r = await ac.post("/api/search", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert "results" in data
        assert "additional_information" in data
        assert "execution_time_ms" in data
