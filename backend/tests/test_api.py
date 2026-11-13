"""
Integration Tests for HS SEARCH FastAPI Endpoints
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["engine"] == "HS SEARCH"
    assert data["company"] == "HS AI Solutions"
    assert data["founder"] == "Harshan Seliyan"

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_search_endpoint():
    response = client.get("/api/search?q=artificial+intelligence&mode=general")
    assert response.status_code == 200
    data = response.json()
    assert "query" in data
    assert "total_results" in data
    assert "results" in data

def test_suggestions_endpoint():
    response = client.get("/api/suggestions?q=art")
    assert response.status_code == 200
    assert "suggestions" in response.json()

def test_live_feeds_endpoint():
    response = client.get("/api/live/feeds")
    assert response.status_code == 200
    data = response.json()
    assert data["subsystem"] == "HS Live"
    assert "feeds" in data

def test_crawler_status_endpoint():
    response = client.get("/api/crawler/status")
    assert response.status_code == 200
    data = response.json()
    assert "is_running" in data
    assert "queue_size" in data

def test_monitor_metrics_endpoint():
    response = client.get("/api/monitor/metrics")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "metrics" in data

def test_pendulum_frontend_served():
    # Test GET /pendulum
    response = client.get("/pendulum")
    assert response.status_code == 200
    assert "Pendulum Search" in response.text
    assert "PENDULUM" in response.text
    assert "HS" in response.text
    assert 'id="searchForm"' in response.text
    assert 'id="query"' in response.text
    assert 'id="suggestions"' in response.text
    assert 'id="results"' in response.text

    # Test GET / with Accept: text/html
    html_resp = client.get("/", headers={"accept": "text/html,application/xhtml+xml"})
    assert html_resp.status_code == 200
    assert "Pendulum Search" in html_resp.text

def test_pendulum_search_post_endpoint():
    # Test POST /api/search with Pendulum frontend contract
    payload = {
        "query": "artificial intelligence",
        "type": "All",
        "aiOverview": True,
        "safeSearch": "moderate",
        "limit": 5
    }
    response = client.post("/api/search", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["engine"] == "Pendulum Search"
    assert "results" in data
    assert "total" in data
    assert "answer" in data
    if data["results"]:
        first = data["results"][0]
        assert "title" in first
        assert "url" in first
        assert "snippet" in first
        assert "source" in first
