"""
Autonomous Discovery Intelligence Module
Identifies missing information, analyzes coverage gaps, and automatically discovers new sources.
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import asyncio
import logging
from typing import List, Dict, Any
from datetime import datetime
from app.database.connection import db
from app.crawler.frontier import frontier

logger = logging.getLogger(__name__)

class DiscoveryIntelligence:
    def __init__(self):
        self.is_running = False
        self._task = None

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        self._task = asyncio.create_task(self._analysis_loop())

    async def stop(self):
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()

    async def _analysis_loop(self):
        """Continuously analyzes query logs and coverage gaps to trigger autonomous expansion."""
        while self.is_running:
            try:
                await self.audit_search_gaps()
                await asyncio.sleep(120.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Discovery intelligence error: {e}")
                await asyncio.sleep(60.0)

    async def audit_search_gaps(self) -> List[Dict[str, Any]]:
        """Identify search queries that yielded zero or insufficient results."""
        gaps_found = []
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                """SELECT query, results_count, COUNT(*) as query_frequency 
                   FROM search_queries 
                   WHERE results_count <= 2 
                   GROUP BY query 
                   ORDER BY query_frequency DESC LIMIT 15"""
            )
            rows = await cursor.fetchall()
            for r in rows:
                q = r["query"]
                await db.log_discovery_gap(q, category="general", reason="low_search_results")
                gaps_found.append({"query": q, "frequency": r["query_frequency"]})

        # Automatically enqueue candidate searches into Wikipedia or OpenAlex if gap detected
        for gap in gaps_found[:3]:
            q_term = gap["query"].replace(" ", "_")
            candidate_url = f"https://en.wikipedia.org/wiki/{q_term}"
            await frontier.enqueue_links([candidate_url], current_depth=0, referrer="discovery_gap_resolver")

        return gaps_found

    async def get_coverage_breakdown(self) -> Dict[str, int]:
        """Aggregate indexed documents across knowledge categories."""
        breakdown = {
            "News": 0,
            "Science": 0,
            "Technology": 0,
            "Academic": 0,
            "General Web": 0
        }
        async with db.get_connection() as conn:
            cursor = await conn.execute("SELECT metadata_json FROM documents LIMIT 500")
            for r in await cursor.fetchall():
                import json
                try:
                    meta = json.loads(r["metadata_json"] or "{}")
                    cat = meta.get("category", "general").lower()
                    if cat in ("news",):
                        breakdown["News"] += 1
                    elif cat in ("science",):
                        breakdown["Science"] += 1
                    elif cat in ("tech", "code"):
                        breakdown["Technology"] += 1
                    elif cat in ("academic", "encyclopedic"):
                        breakdown["Academic"] += 1
                    else:
                        breakdown["General Web"] += 1
                except Exception:
                    breakdown["General Web"] += 1
        return breakdown

discovery_intelligence = DiscoveryIntelligence()
