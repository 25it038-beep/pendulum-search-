"""
July AI Controlled Crawler Gateway & Search Engine Integration
Provides safe, rate-limited, and policy-governed crawler dispatch and search synthesis for July LLM.
Supports 5 distinct July Search Modes:
1. Fast Search (instant answer & bullet synthesis)
2. Deep Search (multi-hop traversal & in-depth coverage)
3. Research Search (academic papers, DOIs, peer citations)
4. Live Search (real-time breaking events, RSS tickers)
5. Technical Search (developer docs, GitHub repos, code syntax)
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import time
import re
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.megacrawler.models import JulyCrawlRequest, CrawlerType, JulySearchMode
from app.megacrawler.frontier import frontier
from app.megacrawler.security import security_guard
from app.database.connection import db

class JulyCrawlerGateway:
    def __init__(self):
        self._recent_requests: List[float] = []
        self._max_requests_per_minute = 15

    def _check_rate_limit(self) -> bool:
        now = time.time()
        self._recent_requests = [t for t in self._recent_requests if now - t < 60.0]
        if len(self._recent_requests) >= self._max_requests_per_minute:
            return False
        self._recent_requests.append(now)
        return True

    def map_intent_to_crawler(self, query: str, suggested_urls: Optional[List[str]] = None) -> str:
        """Route query topic to the optimal specialized crawler service."""
        q = query.lower()
        if any(w in q for w in ("paper", "arxiv", "doi", "research", "study", "journal", "abstract")):
            return CrawlerType.RESEARCH.value
        elif any(w in q for w in ("science", "biology", "physics", "chemistry", "stem", "education", "mit", "khan")):
            return CrawlerType.SCIENCE.value
        elif any(w in q for w in ("github", "repo", "npm", "pip", "package", "code", "function", "sdk")):
            return CrawlerType.CODE.value
        elif any(w in q for w in ("docs", "documentation", "api reference", "manual", "tutorial", "guide")):
            return CrawlerType.DOC.value
        elif any(w in q for w in ("breaking", "today", "news", "headlines", "latest", "live")):
            return CrawlerType.LIVE.value
        elif any(w in q for w in ("ai", "nvidia", "gpu", "chip", "quantum", "software", "tech", "hardware")):
            return CrawlerType.TECH.value
        elif any(w in q for w in ("law", "policy", "census", "dataset", "government", "agency", "statute")):
            return CrawlerType.GOV.value
        elif any(w in q for w in ("photo", "image", "diagram", "picture", "infographic", "visual")):
            return CrawlerType.IMAGE.value
        elif any(w in q for w in ("video", "stream", "talk", "conference", "youtube", "vimeo")):
            return CrawlerType.VIDEO.value
        elif any(w in q for w in ("deep", "subtree", "all pages", "traverse")):
            return CrawlerType.DEEP.value
        elif any(w in q for w in ("api", "endpoint", "openalex", "wikidata", "rest", "graphql")):
            return CrawlerType.API.value
        else:
            return CrawlerType.DISCOVERY.value

    async def submit_targeted_crawl(self, req: JulyCrawlRequest) -> Dict[str, Any]:
        """
        Controlled entrypoint for July to request targeted crawling when information is missing.
        Validates URL security, rate limits, and registers in crawl queue.
        """
        if not self._check_rate_limit():
            return {
                "status": "rate_limited",
                "message": "July crawl request quota reached (max 15/min). Request deferred."
            }

        crawler_type = req.crawler_type or self.map_intent_to_crawler(req.query, req.suggested_urls)
        priority = 2 if req.urgency == "high" else 4

        enqueued_count = 0
        rejected_count = 0
        rejection_reasons = []

        if req.suggested_urls:
            for url in req.suggested_urls[:5]:
                enqueued, reason = await frontier.enqueue_url(
                    url=url,
                    crawler_type=crawler_type,
                    priority=priority,
                    depth=0,
                    referrer="july_ai_request",
                    discovery_source="july_ai"
                )
                if enqueued:
                    enqueued_count += 1
                else:
                    rejected_count += 1
                    rejection_reasons.append(f"{url}: {reason}")

        elif req.target_domains:
            for domain in req.target_domains[:3]:
                url = f"https://{domain.strip('/')}/"
                enqueued, reason = await frontier.enqueue_url(
                    url=url,
                    crawler_type=crawler_type,
                    priority=priority,
                    depth=0,
                    referrer="july_ai_domain_request",
                    discovery_source="july_ai"
                )
                if enqueued:
                    enqueued_count += 1
                else:
                    rejected_count += 1
                    rejection_reasons.append(f"{url}: {reason}")

        else:
            async with db.get_connection() as conn:
                await conn.execute(
                    """INSERT INTO discovery_gaps (topic_or_query, category, failure_reason, discovered_at, resolved_status)
                       VALUES (?, ?, 'july_gap_fill', ?, 'investigating')
                       ON CONFLICT(topic_or_query) DO UPDATE SET search_count = search_count + 1""",
                    (req.query, crawler_type, datetime.now(timezone.utc).isoformat())
                )
                await conn.commit()

        return {
            "status": "accepted",
            "crawler_assigned": crawler_type,
            "priority": priority,
            "enqueued_urls": enqueued_count,
            "rejected_urls": rejected_count,
            "rejections": rejection_reasons,
            "query": req.query,
            "mode": req.mode or "fast",
            "policy": "Governed by HS AI Solutions Controlled Execution Guard"
        }

    async def execute_july_search(
        self,
        query: str,
        search_mode: str = "fast",
        max_results: int = 10
    ) -> Dict[str, Any]:
        """
        Unified July LLM Search Engine pipeline:
        1. Query intent understanding & rewriting
        2. Retrieval from independent HS Search index
        3. Source relevance evaluation
        4. Contradiction detection
        5. Grounded synthesis with citations [1], [2]
        """
        from app.ranking.scorer import search_scorer
        from app.ai.july import july_assistant

        t_start = time.time()

        # 1. Map mode
        scorer_mode = "general"
        if search_mode == "live":
            scorer_mode = "realtime"
        elif search_mode == "research":
            scorer_mode = "academic"
        elif search_mode == "technical":
            scorer_mode = "tech"
        elif search_mode == "deep":
            scorer_mode = "general"

        # 2. Query Intent Analysis
        intent_data = july_assistant.analyze_intent_and_rewrite(query)

        # 3. Retrieve from HS Search Index
        search_res = await search_scorer.execute_search(
            query=query,
            mode=scorer_mode,
            sort_by="relevance",
            limit=max_results,
            offset=0
        )
        results = search_res.get("results", [])

        # 4. Generate Grounded Answer strictly from results
        ans_data = await july_assistant.generate_answer_async(query, results)

        # 5. Contradiction Detection across top sources
        contradictions = []
        if len(results) >= 2:
            s1 = results[0].get("snippet", "").lower()
            s2 = results[1].get("snippet", "").lower()
            # Simple negation conflict check
            for neg in (" not ", " cannot ", " false ", " discontinued "):
                if (neg in s1 and neg not in s2) or (neg in s2 and neg not in s1):
                    contradictions.append({
                        "theme": "Potential consensus discrepancy detected",
                        "source_1": results[0].get("domain"),
                        "source_2": results[1].get("domain")
                    })
                    break

        execution_ms = round((time.time() - t_start) * 1000.0, 2)

        return {
            "engine": "HS SEARCH — July AI Intelligence",
            "company": "HS AI Solutions",
            "founder": "Harshan Seliyan",
            "query": query,
            "search_mode": search_mode,
            "intent": intent_data["intent"],
            "rewritten_queries": intent_data["rewritten_queries"],
            "execution_time_ms": execution_ms,
            "direct_answer": ans_data.get("direct_answer"),
            "summary": ans_data.get("summary"),
            "key_takeaways": ans_data.get("key_takeaways", []),
            "citations": ans_data.get("citations", []),
            "contradictions_detected": contradictions,
            "knowledge_graph_card": ans_data.get("knowledge_graph_card"),
            "retrieved_documents_count": len(results),
            "verifiable_sources": [
                {"id": r.get("id"), "url": r.get("url"), "title": r.get("title"), "domain": r.get("domain")}
                for r in results[:5]
            ]
        }

july_gateway = JulyCrawlerGateway()
