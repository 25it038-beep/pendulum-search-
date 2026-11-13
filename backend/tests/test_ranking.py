"""
Unit Tests for Search Ranking Algorithm & Modes
"""

import pytest
from datetime import datetime, timedelta
from app.ranking.scorer import search_scorer

def test_freshness_decay():
    now = datetime.utcnow()
    brand_new = now - timedelta(minutes=10)
    one_day_old = now - timedelta(days=1)
    month_old = now - timedelta(days=30)

    score_new = search_scorer.compute_freshness_score(brand_new, now)
    score_day = search_scorer.compute_freshness_score(one_day_old, now)
    score_month = search_scorer.compute_freshness_score(month_old, now)

    assert score_new > score_day
    assert score_day > score_month
    assert score_new > 0.95

def test_snippet_highlighting():
    text = "Artificial intelligence research has advanced dramatically with large language models and autonomous agents."
    snippet = search_scorer.highlight_snippet(text, "autonomous agents")
    assert "autonomous agents" in snippet.lower()

@pytest.mark.asyncio
async def test_search_execution():
    res = await search_scorer.execute_search(query="search engine", mode="general", limit=5)
    assert "results" in res
    assert "total_results" in res
    assert "execution_time_ms" in res
