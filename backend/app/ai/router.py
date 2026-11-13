"""
HS AI Model Router & Orchestrator
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

from typing import Dict, Any, List
from app.ai.july import july_assistant
from app.ai.gravity import gravity_agent

class AIRouter:
    def should_use_gravity(self, query: str, mode: str) -> bool:
        """Heuristic selector for routing to Gravity deep research."""
        if mode in ("research", "academic"):
            return True
        q = query.lower().strip()
        words = q.split()
        if len(words) >= 6:
            return True
        if any(w in q for w in ["compare", "difference", "comprehensive", "deep dive", "impact of", "why does", "future of", "analysis"]):
            return True
        return False

    async def generate_response(
        self,
        query: str,
        search_results: List[Dict[str, Any]],
        model_preference: str = "auto",
        mode: str = "general",
        geo_metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Route to July or Gravity based on preference and query traits."""
        # For geographic queries, prioritize July fast assistant
        is_geo = bool(geo_metadata and geo_metadata.get("is_geo_query"))
        if not is_geo and (model_preference == "gravity" or (model_preference == "auto" and self.should_use_gravity(query, mode))):
            # Deep Research
            research_data = await gravity_agent.execute_deep_research(query)
            # Also include July instant summary for quick scanning
            july_quick = await july_assistant.generate_answer_async(query, search_results, geo_metadata=geo_metadata)
            research_data["quick_summary"] = july_quick["summary"]
            if "knowledge_graph_card" in july_quick:
                research_data["knowledge_graph_card"] = july_quick["knowledge_graph_card"]
            return research_data
        else:
            # Fast Assistant with Knowledge Graph & Geo enrichment
            july_res = await july_assistant.generate_answer_async(query, search_results, geo_metadata=geo_metadata)
            return july_res

    async def generate_response_hybrid(
        self,
        query: str,
        search_results: List[Dict[str, Any]],
        model_preference: str = "auto",
        mode: str = "general",
        geo_metadata: Dict[str, Any] = None,
        query_complexity: str = "low"
    ) -> Dict[str, Any]:
        """
        Hybrid multi-tier model router.
        Selects internal model tier based on query complexity:
        - Low complexity / Geo: FAST tier
        - Medium complexity: QUALITY tier
        - High complexity / Research: REASONING tier
        """
        tier = "fast"
        if query_complexity == "high" or mode in ("research", "academic"):
            tier = "reasoning"
        elif query_complexity == "medium":
            tier = "quality"

        if model_preference == "gravity" or (model_preference == "auto" and self.should_use_gravity(query, mode)):
            research_data = await gravity_agent.execute_deep_research(query)
            july_quick = await july_assistant.generate_answer_async(query, search_results, geo_metadata=geo_metadata)
            research_data["quick_summary"] = july_quick.get("summary")
            if "knowledge_graph_card" in july_quick:
                research_data["knowledge_graph_card"] = july_quick["knowledge_graph_card"]
            return research_data
        else:
            return await july_assistant.generate_answer_async(query, search_results, geo_metadata=geo_metadata)


ai_router = AIRouter()
