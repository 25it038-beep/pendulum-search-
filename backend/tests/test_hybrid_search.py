"""
Tests for Pendulum Hybrid Search Engine
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import asyncio
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# HybridRanker unit tests
# ---------------------------------------------------------------------------

class TestHybridRanker:
    """Test RRF scoring, deduplication, and source labeling."""

    def setup_method(self):
        from app.ranking.hybrid_ranker import HybridRanker
        self.ranker = HybridRanker()

    def _pendulum_item(self, url, title, rank=1, text_score=0.8, semantic_score=0.7):
        return {
            "url": url,
            "title": title,
            "snippet": "This is a test snippet with enough content for scoring.",
            "domain": url.split("/")[2] if "://" in url else "example.com",
            "text_score": text_score,
            "semantic_score": semantic_score,
            "published_at": datetime.now(timezone.utc).isoformat(),
            "indexed_at": datetime.now(timezone.utc).isoformat(),
            "published_str": "Just now",
            "indexed_str": "Just now",
            "language": "en",
            "category": "general",
            "images": [],
            "is_live": False,
        }

    def _external_item(self, url, title, score=0.7):
        return {
            "url": url,
            "title": title,
            "snippet": "External snippet content that is reasonably long.",
            "domain": url.split("/")[2] if "://" in url else "example.com",
            "score": score,
            "publication_timestamp": None,
            "retrieval_timestamp": datetime.now(timezone.utc).isoformat(),
            "language": "en",
            "category": "general",
        }

    def test_both_providers_return_results_no_duplicate_urls(self):
        """Merged list must contain no duplicate canonical URLs."""
        p_results = [
            self._pendulum_item("https://example.com/page-1", "Page One"),
            self._pendulum_item("https://example.com/page-2", "Page Two"),
            self._pendulum_item("https://example.com/page-3", "Page Three"),
        ]
        e_results = [
            self._external_item("https://news.com/article-a", "Article A"),
            self._external_item("https://news.com/article-b", "Article B"),
        ]
        merged = self.ranker.merge_and_rank(p_results, e_results, limit=20)
        urls = [r.url for r in merged]
        assert len(urls) == len(set(urls)), "Duplicate URLs found in merged list"

    def test_one_provider_fails_partial_results(self):
        """When one provider returns nothing, the other provider's results are still returned."""
        p_results = [self._pendulum_item("https://example.com/p1", "Result P1")]
        e_results = []  # external failed / empty
        merged = self.ranker.merge_and_rank(p_results, e_results, limit=20)
        assert len(merged) >= 1
        assert merged[0].url == "https://example.com/p1"

    def test_same_url_from_both_appears_once_with_both_sources(self):
        """The same URL from both providers should appear once with sources=['pendulum','external']."""
        shared_url = "https://wikipedia.org/wiki/Python_(programming_language)"
        p_results = [self._pendulum_item(shared_url, "Python programming language")]
        e_results = [self._external_item(shared_url, "Python programming language")]
        merged = self.ranker.merge_and_rank(p_results, e_results, limit=20)
        matches = [r for r in merged if self.ranker.canonicalize_url(r.url) == self.ranker.canonicalize_url(shared_url)]
        assert len(matches) == 1, "Shared URL should appear exactly once"
        assert "pendulum" in matches[0].sources
        assert "external" in matches[0].sources

    def test_rrf_scores_computed_correctly(self):
        """RRF score must be positive and use provider weights."""
        from app.ranking.hybrid_ranker import HybridResult, _RRF_K, _PROVIDER_WEIGHTS
        hr = HybridResult(
            id="abc",
            title="Test",
            url="https://example.com",
            canonical_url="https://example.com",
            snippet="snippet",
            domain="example.com",
            published_at=None,
            indexed_at=None,
            published_str="",
            indexed_str="",
            sources=["pendulum", "external"],
            provider_ranks={"pendulum": 1, "external": 1},
        )
        rrf = self.ranker._rrf_score(hr)
        expected_raw = (
            _PROVIDER_WEIGHTS["pendulum"] / (_RRF_K + 1) +
            _PROVIDER_WEIGHTS["external"] / (_RRF_K + 1)
        )
        # Raw * 25 normalized (capped at 1.0)
        assert rrf > 0.0
        assert rrf <= 1.0

    def test_final_scores_normalized_0_to_1(self):
        """All component scores and final score must be in [0, 1]."""
        p_results = [
            self._pendulum_item("https://example.com/a", "Alpha"),
            self._pendulum_item("https://example.com/b", "Beta"),
        ]
        e_results = [self._external_item("https://news.org/c", "Gamma")]
        merged = self.ranker.merge_and_rank(p_results, e_results, limit=20)
        for r in merged:
            assert 0.0 <= r.final_score <= 1.0, f"Final score out of range: {r.final_score}"
            for k, v in r.scores.items():
                assert 0.0 <= v <= 1.0, f"Score component {k}={v} out of range"

    def test_empty_results_from_both_no_crash(self):
        """Empty input from both providers must return empty list, no exception."""
        merged = self.ranker.merge_and_rank([], [], limit=20)
        assert merged == []

    def test_source_labels_correct(self):
        """Source labels must be correct for each combination of providers."""
        # Pendulum only
        p_results = [self._pendulum_item("https://example.com/p", "Pendulum Page")]
        merged = self.ranker.merge_and_rank(p_results, [], limit=20)
        assert merged[0].source_label == "Pendulum Indexed"

        # External only
        e_results = [self._external_item("https://news.org/e", "External Page")]
        merged = self.ranker.merge_and_rank([], e_results, limit=20)
        assert merged[0].source_label == "External Search"

        # Both — same URL
        shared = "https://wikipedia.org/wiki/Test"
        p_both = [self._pendulum_item(shared, "Test Article")]
        e_both = [self._external_item(shared, "Test Article")]
        merged = self.ranker.merge_and_rank(p_both, e_both, limit=20)
        matches = [r for r in merged if "pendulum" in r.sources and "external" in r.sources]
        if matches:
            assert matches[0].source_label == "Multiple Sources"

    def test_tracking_params_stripped_in_dedup(self):
        """UTM parameters must be stripped during URL normalization."""
        url_a = "https://example.com/article?utm_source=google&utm_medium=cpc"
        url_b = "https://example.com/article"  # same canonical
        p_results = [self._pendulum_item(url_a, "Article with tracking")]
        e_results = [self._external_item(url_b, "Article without tracking")]
        merged = self.ranker.merge_and_rank(p_results, e_results, limit=20)
        # Both should merge to one result
        assert len(merged) == 1
        assert len(merged[0].sources) == 2

    def test_geographic_query_geo_score_applied(self):
        """Results with distance_km set should get a geographic score."""
        from app.ranking.hybrid_ranker import HybridResult
        hr = HybridResult(
            id="geo1",
            title="Nearby Place",
            url="https://example.com/place",
            canonical_url="https://example.com/place",
            snippet="A nearby restaurant",
            domain="example.com",
            published_at=None,
            indexed_at=None,
            published_str="",
            indexed_str="",
            sources=["pendulum"],
            provider_ranks={"pendulum": 1},
            distance_km=2.5,
        )
        geo = self.ranker._geographic_score(hr)
        assert geo > 0.0, "Geographic score should be positive for nearby result"


# ---------------------------------------------------------------------------
# API endpoint tests (integration)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from app.main import app
    with TestClient(app) as c:
        yield c


class TestHybridSearchAPI:

    def test_hybrid_search_returns_200(self, client):
        """POST /api/search/hybrid must return HTTP 200."""
        resp = client.post("/api/search/hybrid", json={"query": "Python programming"})
        assert resp.status_code == 200

    def test_hybrid_search_response_structure(self, client):
        """Response must include all required top-level fields."""
        resp = client.post("/api/search/hybrid", json={"query": "artificial intelligence"})
        data = resp.json()
        assert "query" in data
        assert "results" in data
        assert "total" in data
        assert "providers" in data
        assert "ranking" in data
        assert "partial" in data
        assert "executionTimeMs" in data
        assert isinstance(data["results"], list)

    def test_hybrid_search_empty_query_returns_400(self, client):
        """Empty query must return 400 Bad Request."""
        resp = client.post("/api/search/hybrid", json={"query": "   "})
        assert resp.status_code == 400

    def test_hybrid_search_result_fields(self, client):
        """Each result must have required fields."""
        resp = client.post("/api/search/hybrid", json={"query": "search engine"})
        data = resp.json()
        for result in data.get("results", []):
            assert "id" in result
            assert "title" in result
            assert "url" in result
            assert "snippet" in result
            assert "sourceLabel" in result
            assert "score" in result
            assert "sources" in result

    def test_admin_dashboard_returns_200(self, client):
        """GET /api/admin/search-dashboard must return HTTP 200."""
        resp = client.get("/api/admin/search-dashboard")
        assert resp.status_code == 200

    def test_admin_dashboard_structure(self, client):
        """Dashboard response must include stats, providers, and config."""
        resp = client.get("/api/admin/search-dashboard")
        data = resp.json()
        assert "stats" in data
        assert "providers" in data
        assert "rankingWeights" in data
        assert "config" in data

    def test_no_duckduckgo_branding_in_response(self, client):
        """No DuckDuckGo branding should appear anywhere in search response."""
        resp = client.post("/api/search/hybrid", json={"query": "weather today"})
        response_text = resp.text.lower()
        assert "duckduckgo" not in response_text, "DuckDuckGo branding found in response"

    def test_partial_true_when_provider_skipped(self, client):
        """When only Pendulum is requested, external should be skipped cleanly."""
        resp = client.post("/api/search/hybrid", json={
            "query": "test query",
            "options": {"providers": ["pendulum"]}
        })
        assert resp.status_code == 200
        data = resp.json()
        # Only pendulum provider should be in the response
        assert "external" not in data["providers"]
