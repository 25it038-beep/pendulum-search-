"""
HS SEARCH - Intelligent Query Router
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import re
from typing import List, Dict, Any, Optional
from app.providers.base import BaseSearchProvider
from app.providers.native import HSNativeSearchProvider
from app.providers.external import HSExternalSearchProvider
from app.providers.instant import HSInstantAnswerProvider
from app.providers.news import HSNewsProvider
from app.providers.geo import HSGeographicProvider
from app.providers.research import HSResearchProvider

class QueryRouter:
    """
    Intelligent Query Router: Classifies queries and selects optimal search providers.
    Never calls every provider for every query.
    """

    INTENT_ROUTING = {
        "general": ["native", "external", "instant"],
        "news": ["native", "news", "external"],
        "local": ["native", "geo"],
        "research": ["native", "research", "external"],
        "technical": ["native", "research"],
        "live": ["instant", "news", "native"],
        "navigational": ["native", "external"],
        "complex": ["native", "research", "external"],
        "shopping": ["native", "external"]
    }

    def __init__(self):
        # Instantiate provider singletons
        self.providers: Dict[str, BaseSearchProvider] = {
            "native": HSNativeSearchProvider(),
            "external": HSExternalSearchProvider(),
            "instant": HSInstantAnswerProvider(),
            "news": HSNewsProvider(),
            "geo": HSGeographicProvider(),
            "research": HSResearchProvider()
        }

    def classify_query_fast(self, query: str, mode: str = "general") -> Dict[str, Any]:
        """
        Sub-millisecond heuristic classification without external network dependency.
        """
        q_clean = query.strip()
        q_lower = q_clean.lower()
        words = q_lower.split()
        word_count = len(words)

        # 1. Computation / Math
        if re.match(r"^[\d\s\+\-\*\/\^\(\)\.\%]+$", q_clean) and any(c in q_clean for c in ["+", "-", "*", "/", "^", "%"]):
            return {
                "intent": "live",
                "complexity": "low",
                "needs_geo": False,
                "needs_live": True,
                "needs_external": False,
                "provider_names": ["instant"],
                "reasoning": "Mathematical expression for instant calculation"
            }

        # 2. Local / Geographic search
        geo_keywords = ["near me", "nearby", "in ", "at ", "around ", "hospital", "college", "university", "restaurant", "hotel"]
        if mode == "local" or any(k in q_lower for k in geo_keywords):
            return {
                "intent": "local",
                "complexity": "medium",
                "needs_geo": True,
                "needs_live": False,
                "needs_external": False,
                "provider_names": ["native", "geo"],
                "reasoning": "Location-specific discovery query"
            }

        # 3. Breaking News / Live
        news_keywords = ["news", "latest", "breaking", "today", "yesterday", "update", "current"]
        if mode in ("news", "latest", "realtime") or any(k in q_lower for k in news_keywords):
            return {
                "intent": "news",
                "complexity": "medium",
                "needs_geo": False,
                "needs_live": True,
                "needs_external": True,
                "provider_names": ["native", "news", "external"],
                "reasoning": "Time-sensitive breaking news or recent event query"
            }

        # 4. Research / Academic / Scientific
        research_keywords = ["research", "paper", "study", "quantum", "algorithm", "arxiv", "theorem", "physics", "biology"]
        if mode in ("academic", "research") or any(k in q_lower for k in research_keywords):
            return {
                "intent": "research",
                "complexity": "high" if word_count > 6 else "medium",
                "needs_geo": False,
                "needs_live": False,
                "needs_external": True,
                "provider_names": ["native", "research", "external"],
                "reasoning": "Scholarly, scientific or technical investigation query"
            }

        # 5. Technical / Code
        tech_keywords = ["code", "python", "javascript", "react", "docker", "api", "function", "error", "debug", "install"]
        if mode == "tech" or any(k in q_lower for k in tech_keywords):
            return {
                "intent": "technical",
                "complexity": "medium",
                "needs_geo": False,
                "needs_live": False,
                "needs_external": False,
                "provider_names": ["native", "research"],
                "reasoning": "Technical programming and system documentation query"
            }

        # 6. Complex Comparative / Multi-turn
        complex_keywords = ["compare", "difference between", "pros and cons", "analysis of", "how does", "why does"]
        if word_count > 8 or any(k in q_lower for k in complex_keywords):
            return {
                "intent": "complex",
                "complexity": "high",
                "needs_geo": False,
                "needs_live": False,
                "needs_external": True,
                "provider_names": ["native", "research", "external"],
                "reasoning": "Multi-faceted comparative or deep synthesis query"
            }

        # 7. Default General Knowledge
        return {
            "intent": "general",
            "complexity": "low",
            "needs_geo": False,
            "needs_live": False,
            "needs_external": True,
            "provider_names": ["native", "external", "instant"],
            "reasoning": "Universal general web and encyclopedic query"
        }

    async def route(
        self,
        query: str,
        mode: str = "general",
        location_state: Optional[Dict[str, Any]] = None,
        use_nvidia_classify: bool = False
    ) -> Dict[str, Any]:
        """
        Route query to appropriate search providers.
        Can optionally use internal NVIDIA AI classification for complex ambiguity resolution.
        """
        # 1. Fast local classification
        classification = self.classify_query_fast(query, mode=mode)

        # 2. If NVIDIA classification requested and query is complex, augment with AI router
        if use_nvidia_classify and classification["complexity"] in ("medium", "high"):
            try:
                from app.ai.nvidia_gateway import nvidia_gateway
                ai_class = await nvidia_gateway.classify_query(query)
                if ai_class and ai_class.get("intent") in self.INTENT_ROUTING:
                    intent = ai_class["intent"]
                    classification["intent"] = intent
                    classification["provider_names"] = self.INTENT_ROUTING[intent]
                    classification["needs_geo"] = ai_class.get("needs_geo", classification["needs_geo"])
                    classification["needs_live"] = ai_class.get("needs_live_data", classification["needs_live"])
                    classification["reasoning"] = f"NVIDIA Fast AI Router: {ai_class.get('reasoning', '')}"
            except Exception:
                pass

        # If location state is explicitly set to near_me or city, ensure geo provider is included
        if location_state and location_state.get("mode") in ("near_me", "city", "region"):
            if "geo" not in classification["provider_names"]:
                classification["provider_names"].append("geo")
            classification["needs_geo"] = True

        return classification

    def get_providers(self, provider_names: List[str]) -> List[BaseSearchProvider]:
        """Return list of provider instances for the requested names."""
        selected: List[BaseSearchProvider] = []
        for name in provider_names:
            if name in self.providers:
                selected.append(self.providers[name])
        # Native provider is ALWAYS guaranteed
        if self.providers["native"] not in selected:
            selected.insert(0, self.providers["native"])
        return selected

# Singleton Instance
query_router = QueryRouter()
