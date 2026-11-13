"""
Unit Tests for HS AI Intelligence (JULY & GRAVITY)
"""

import pytest
from app.ai.july import july_assistant
from app.ai.gravity import gravity_agent

def test_july_intent_and_rewriting():
    intent_data = july_assistant.analyze_intent_and_rewrite("how to build an autonomous crawler in python")
    assert intent_data["intent"] == "how_to"
    assert len(intent_data["rewritten_queries"]) >= 1

def test_july_grounded_answer():
    mock_results = [
        {
            "id": 1,
            "title": "Autonomous Crawling Architecture",
            "url": "https://example.com/crawler",
            "domain": "example.com",
            "snippet": "Distributed crawlers utilize politeness schedulers and robots.txt parsers to avoid server degradation."
        }
    ]
    answer = july_assistant.generate_answer("what do distributed crawlers utilize", mock_results)
    assert answer["model"] == "JULY (Fast Assistant)"
    assert len(answer["citations"]) == 1
    assert answer["citations"][0]["url"] == "https://example.com/crawler"
    assert "[1]" in answer["summary"]

@pytest.mark.asyncio
async def test_gravity_decomposition():
    sub_queries = gravity_agent.decompose_query("compare transformers vs state space models in language modeling")
    assert len(sub_queries) >= 2
    assert any("comparison" in sq or "overview" in sq for sq in sub_queries)
