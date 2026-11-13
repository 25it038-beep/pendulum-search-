"""
Pendulum Frontend & Element Verification Suite
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_all_frontend_dom_elements():
    resp = client.get("/pendulum")
    assert resp.status_code == 200
    html = resp.text

    required_elements = [
        'id="searchForm"',
        'id="query"',
        'id="clearBtn"',
        'id="voiceBtn"',
        'id="imageBtn"',
        'id="imageInput"',
        'id="suggestions"',
        'id="searchBtn"',
        'id="luckyBtn"',
        'class="shortcuts"',
        'id="resultTabs"',
        'id="resultMeta"',
        'id="aiSlot"',
        'id="resultList"',
        'id="settingsModal"',
        'id="settingsBtn"',
        'id="closeSettings"',
        'id="aiSetting"',
        'id="limitSetting"',
        'id="safeSetting"',
        'id="appsBtn"',
        'id="signinBtn"',
        'id="toast"'
    ]

    for el in required_elements:
        assert el in html, f"Missing element: {el}"

def test_suggestions_integration():
    resp = client.get("/api/suggestions?q=art")
    assert resp.status_code == 200
    data = resp.json()
    assert "suggestions" in data
    assert isinstance(data["suggestions"], list)

def test_search_categories_post():
    for tab in ["All", "News", "Research", "Images", "Videos", "Books", "Shopping"]:
        resp = client.post("/api/search", json={
            "query": "artificial intelligence",
            "type": tab,
            "aiOverview": True,
            "safeSearch": "moderate",
            "limit": 3
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["engine"] == "Pendulum Search"
        assert "total" in data
        assert "results" in data
        assert isinstance(data["results"], list)
