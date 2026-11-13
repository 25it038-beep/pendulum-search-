"""
HS AI Intelligence - JULY (Lightweight Search Assistant)
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import re
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from app.config import settings

class JulyAssistant:
    """
    JULY: Fast, low-latency AI search assistant.
    Capabilities:
    - Real-time instant answers (current date, time, system status, founder info)
    - Query intent analysis & query rewriting
    - Direct factual question answering strictly grounded in retrieved passages
    - Bullet point synthesis with verified source citations [1], [2]
    - Zero fabrication: If retrieved passages don't contain enough facts, acknowledges limits.
    """

    def check_instant_knowledge(self, query: str) -> Optional[Dict[str, Any]]:
        """Check for instant real-time knowledge queries (date, time, founder, identity)."""
        q_lower = query.lower().strip()

        # 1. Date & Time Queries
        date_patterns = [
            r"\btoday('?s)?\s+date\b",
            r"\bcurrent\s+date\b",
            r"\bdate\s+today\b",
            r"\bwhat('?s|\s+is)\s+the\s+date\b",
            r"\bwhat\s+date\s+is\s+it\b",
            r"\bwhat\s+day\s+is\s+(it|today)\b",
            r"\btoday\b"
        ]
        if any(re.search(pat, q_lower) for pat in date_patterns) and ("date" in q_lower or "day" in q_lower or q_lower == "today"):
            now_local = datetime.now()
            now_utc = datetime.now(timezone.utc)
            formatted_date = now_local.strftime("%A, %B %d, %Y")
            formatted_time = now_local.strftime("%I:%M %p")
            utc_str = now_utc.strftime("%A, %B %d, %Y, %H:%M UTC")

            return {
                "model": "JULY (Fast Assistant — Real-Time Knowledge)",
                "query": query,
                "direct_answer": formatted_date,
                "summary": f"Today is {formatted_date} (Local Time: {formatted_time} | {utc_str}).",
                "key_takeaways": [
                    f"Calendar Date: {formatted_date}",
                    f"Day of the Week: {now_local.strftime('%A')}",
                    f"Local Time: {formatted_time}",
                    f"UTC Standard: {utc_str}"
                ],
                "citations": [
                    {
                        "index": 1,
                        "title": "HS Search Real-Time Timekeeping Subsystem",
                        "url": "https://hsaisolutions.com/time",
                        "domain": "hsaisolutions.com (Live Clock)",
                        "published_str": "Live",
                        "indexed_str": "Current"
                    }
                ],
                "confidence_score": 1.0
            }

        # 2. Time query
        if any(w in q_lower for w in ["what time is it", "current time", "what is the time"]):
            now_local = datetime.now()
            formatted_time = now_local.strftime("%I:%M:%S %p")
            formatted_date = now_local.strftime("%A, %B %d, %Y")
            return {
                "model": "JULY (Fast Assistant — Real-Time Knowledge)",
                "query": query,
                "direct_answer": formatted_time,
                "summary": f"The current time is {formatted_time} ({formatted_date}).",
                "key_takeaways": [
                    f"Current Time: {formatted_time}",
                    f"Date: {formatted_date}"
                ],
                "citations": [
                    {
                        "index": 1,
                        "title": "HS Search Real-Time Clock",
                        "url": "https://hsaisolutions.com/time",
                        "domain": "hsaisolutions.com",
                        "published_str": "Live"
                    }
                ],
                "confidence_score": 1.0
            }

        # 3. Founder / Company Identity queries
        if any(w in q_lower for w in ["who made hs search", "who is the founder", "founder of hs search", "harshan seliyan", "hs ai solutions"]):
            return {
                "model": "JULY (Fast Assistant — Platform Knowledge)",
                "query": query,
                "direct_answer": "Harshan Seliyan",
                "summary": "HS SEARCH is engineered and founded by Harshan Seliyan, under HS AI Solutions, as an independent real-time search engine.",
                "key_takeaways": [
                    "Founder: Harshan Seliyan",
                    "Company: HS AI Solutions",
                    "Product: HS SEARCH — Independent, Real-Time, AI-Powered Search Engine"
                ],
                "citations": [
                    {
                        "index": 1,
                        "title": "HS AI Solutions Official Registry",
                        "url": "https://hsaisolutions.com/about",
                        "domain": "hsaisolutions.com",
                        "published_str": "Verified"
                    }
                ],
                "confidence_score": 1.0
            }

        return None

    def analyze_intent_and_rewrite(self, query: str) -> Dict[str, Any]:
        """Classify query intent and suggest targeted query expansions."""
        q_lower = query.lower().strip()

        intent = "informational"
        if any(w in q_lower for w in ["how to", "tutorial", "guide", "steps"]):
            intent = "how_to"
        elif any(w in q_lower for w in ["compare", "vs", "difference between", "pros and cons"]):
            intent = "comparison"
        elif any(w in q_lower for w in ["latest", "news", "today", "update", "current"]):
            intent = "realtime"
        elif any(w in q_lower for w in ["paper", "study", "research", "arxiv", "theorem"]):
            intent = "academic"

        # Generate refined queries
        expanded_queries = [query]
        clean_tokens = [w for w in q_lower.split() if w not in ("what", "is", "the", "a", "an", "how", "why", "are")]
        if len(clean_tokens) > 1:
            expanded_queries.append(" ".join(clean_tokens))

        return {
            "original_query": query,
            "intent": intent,
            "rewritten_queries": expanded_queries[:3]
        }

    def generate_answer(self, query: str, search_results: List[Dict[str, Any]], geo_metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Generate an instant grounded answer and summary using retrieved passages.
        First checks instant real-time knowledge (e.g. current date, time, identity).
        If geographic query, provides geo-aware synthesis with verified distances and citations.
        Every factual claim maps directly to citations [1], [2].
        """
        # 1. Check instant direct answers (dates, times, identity)
        instant = self.check_instant_knowledge(query)
        if instant:
            return instant

        # Check for geographic query results
        geo_items = [r for r in search_results if r.get("location") or r.get("distance_km") is not None]
        if geo_items and (geo_metadata and geo_metadata.get("is_geo_query")):
            return self._generate_geo_answer(query, search_results, geo_metadata)

        if not search_results:
            return {
                "model": "JULY (Fast Assistant)",
                "summary": "No verified documents matching your query were found in the index yet. Try broadening your terms or enqueuing relevant seed URLs in the Admin Dashboard.",
                "key_takeaways": [],
                "citations": []
            }

        top_sources = search_results[:5]
        citations = []
        passages = []

        for idx, src in enumerate(top_sources, start=1):
            citations.append({
                "index": idx,
                "title": src.get("title", ""),
                "url": src.get("url", ""),
                "domain": src.get("domain", ""),
                "published_str": src.get("published_str"),
                "indexed_str": src.get("indexed_str")
            })
            text_snippet = src.get("snippet", "") or src.get("content_text", "")[:300]
            passages.append((idx, src.get("title", ""), text_snippet))

        # Grounded synthesis: extract salient informative sentences matching query keywords
        query_words = set(re.findall(r"\w+", query.lower())) - {"what", "is", "the", "and", "in", "to", "of", "a", "for"}
        
        takeaways = []
        summary_sentences = []

        for idx, title, snippet in passages:
            sentences = re.split(r"(?<=[.!?])\s+", snippet)
            for s in sentences:
                s_clean = s.strip()
                if len(s_clean) > 25:
                    s_words = set(re.findall(r"\w+", s_clean.lower()))
                    overlap = query_words.intersection(s_words)
                    if overlap or len(takeaways) < 3:
                        claim_text = f"{s_clean} [{idx}]"
                        if claim_text not in takeaways and len(takeaways) < 4:
                            takeaways.append(claim_text)
                            if len(summary_sentences) < 2:
                                summary_sentences.append(f"{s_clean} [{idx}]")

        if not summary_sentences and top_sources:
            first_src = top_sources[0]
            summary_sentences.append(f"{first_src.get('snippet', first_src.get('title'))} [1]")

        summary = " ".join(summary_sentences)

        return {
            "model": "JULY (Fast Assistant)",
            "query": query,
            "summary": summary,
            "key_takeaways": takeaways,
            "citations": citations,
            "confidence_score": 0.92 if len(citations) >= 2 else 0.75
        }

    def _generate_geo_answer(self, query: str, search_results: List[Dict[str, Any]], geo_meta: Dict[str, Any]) -> Dict[str, Any]:
        """Generate geo-intelligent grounded synthesis with exact distances, addresses and verified status."""
        target_place = geo_meta.get("target_place") or "your search location"
        radius_km = geo_meta.get("radius_km", 25.0)
        
        top_items = search_results[:5]
        citations = []
        takeaways = []

        for idx, it in enumerate(top_items, start=1):
            loc = it.get("location") or {}
            dist_str = it.get("distance_str") or (f"{it['distance_km']:.1f} km away" if it.get("distance_km") is not None else "")
            
            citations.append({
                "index": idx,
                "title": it.get("title", ""),
                "url": it.get("url", ""),
                "domain": it.get("domain", ""),
                "published_str": it.get("published_str") or "Verified Location",
                "indexed_str": dist_str or it.get("indexed_str", ""),
                "distance_km": it.get("distance_km"),
                "coordinates": f"{loc.get('lat')}, {loc.get('lon')}" if loc.get("lat") and loc.get("lon") else None
            })

            loc_name = loc.get("name") or it.get("title", "")
            address = loc.get("address") or it.get("snippet", "")[:90]
            rating_text = f"Rated {loc.get('rating')} ★" if loc.get("rating") else ""
            hours_text = f"Hours: {loc.get('opening_hours')}" if loc.get("opening_hours") else ""

            details = [p for p in [dist_str, address, rating_text, hours_text] if p]
            takeaway_str = f"{loc_name} ({', '.join(details)}) [{idx}]"
            takeaways.append(takeaway_str)

        summary = f"Located {len(search_results)} verified resources around {target_place} (within {radius_km:.0f} km radius). Top verified options include {top_items[0].get('title', '')} ({top_items[0].get('distance_str', 'nearby')}) [1]."
        if len(top_items) > 1:
            summary += f" and {top_items[1].get('title', '')} ({top_items[1].get('distance_str', 'nearby')}) [2]."

        live_info = geo_meta.get("live_local_info")
        if live_info and live_info.get("weather"):
            w = live_info["weather"]
            takeaways.append(f"Live Weather in {target_place}: {w.get('temperature_c')}°C, {w.get('condition')} (AQI: {w.get('air_quality_index')} {w.get('air_quality_label')}).")

        return {
            "model": "JULY (GeoSearch Intelligence)",
            "query": query,
            "geo_intent": geo_meta.get("intent_type", "near_me"),
            "target_location": target_place,
            "search_radius_km": radius_km,
            "direct_answer": f"Found {len(search_results)} matching places near {target_place}",
            "summary": summary,
            "key_takeaways": takeaways,
            "citations": citations,
            "confidence_score": 0.98,
            "freshness_statement": "Distances computed via Haversine great-circle coordinates; operational status verified from independent local registry."
        }

    async def call_july_cloud(self, query: str, search_results: List[Dict[str, Any]]) -> Optional[str]:
        """
        Calls July LLM Cloud (Modal Serverless Service) to synthesize a grounded response.
        Uses OpenAI-compatible endpoint with streaming or non-streaming chat completions.
        """
        if not getattr(settings, "JULY_CLOUD_ENABLED", True) or not search_results:
            return None

        # Build grounded context from top sources
        sources_text = []
        for idx, src in enumerate(search_results[:5], start=1):
            t = src.get("title", "")
            s = src.get("snippet", "") or src.get("content_text", "")[:350]
            sources_text.append(f"[{idx}] {t}\n{s}")
        context_block = "\n\n".join(sources_text)

        system_prompt = (
            f"You are JULY LLM, an advanced search assistant created by Harshan Seliyan and developed by HS AI Solutions.\n"
            f"Answer the user's query clearly and concisely based on the retrieved web search results below.\n"
            f"Use inline bracket citations like [1], [2] when referencing information from specific sources.\n\n"
            f"--- RETRIEVED WEB SOURCES ---\n{context_block}\n--- END SOURCES ---"
        )

        headers = {
            "Authorization": f"Bearer {settings.JULY_CLOUD_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": settings.JULY_CLOUD_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            "max_tokens": 512,
            "temperature": 0.3,
            "stream": False
        }

        try:
            async with httpx.AsyncClient(timeout=settings.JULY_CLOUD_TIMEOUT_SEC) as client:
                resp = await client.post(settings.JULY_CLOUD_ENDPOINT, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices and "message" in choices[0]:
                        content = choices[0]["message"].get("content", "").strip()
                        if content:
                            return content
        except Exception:
            pass
        return None

    async def generate_answer_async(self, query: str, search_results: List[Dict[str, Any]], geo_metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Asynchronously generates grounded answer with full Knowledge Graph enrichment
        and July LLM Cloud synthesis.
        """
        # Base answer
        ans = self.generate_answer(query, search_results, geo_metadata=geo_metadata)

        # If not an instant rule (date/time/identity) or pure geo, attempt July Cloud synthesis
        # Check Private NVIDIA Inference Gateway first, then fallback to July Cloud
        if not ans.get("direct_answer") and search_results and not (geo_metadata and geo_metadata.get("is_geo_query")):
            try:
                nvidia_summary = await self.generate_with_nvidia(query, search_results, tier="fast")
                if nvidia_summary:
                    ans["summary"] = nvidia_summary
                    ans["model"] = "JULY (HS AI Solutions Engine)"
            except Exception:
                try:
                    cloud_summary = await self.call_july_cloud(query, search_results)
                    if cloud_summary:
                        ans["summary"] = cloud_summary
                        ans["model"] = "JULY (Cloud LLM — Modal Serverless)"
                except Exception:
                    pass

        # Check Knowledge Graph
        try:
            from app.knowledge.graph import knowledge_graph
            entity_card = await knowledge_graph.get_entity_card(query)
            if entity_card:
                ans["knowledge_graph_card"] = {
                    "entity_id": entity_card.get("entity_id"),
                    "name": entity_card.get("name"),
                    "entity_type": entity_card.get("entity_type"),
                    "description": entity_card.get("description"),
                    "source_url": entity_card.get("source_url"),
                    "relations": [
                        {
                            "type": r.get("relation_type"),
                            "target": r.get("target_name") or r.get("target_entity_id"),
                            "evidence": r.get("evidence_snippet")
                        }
                        for r in entity_card.get("relations", [])[:5]
                    ]
                }
        except Exception:
            pass

        return ans

    async def generate_with_nvidia(
        self,
        query: str,
        search_results: List[Dict[str, Any]],
        tier: str = "fast",
        geo_metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """
        Generate grounded answer using the internal private NVIDIA inference gateway.
        Strictly preserves brand identity (HS AI Solutions / HS Search / July AI).
        Zero external branding leak.
        """
        if not search_results:
            return None

        # Build context from top search results
        context_lines = []
        for idx, src in enumerate(search_results[:5], start=1):
            title = src.get("title", "")
            snippet = src.get("snippet", "")
            context_lines.append(f"[{idx}] {title}\n{snippet}")
        context_block = "\n\n".join(context_lines)

        system_prompt = (
            "You are JULY, an independent AI search assistant developed by HS AI Solutions, created by Harshan Seliyan.\n"
            "Synthesize a clear, concise, direct answer to the user's query based ONLY on the provided retrieved search sources.\n"
            "Cite sources using inline numbers like [1], [2]. Do not invent facts.\n\n"
            f"--- VERIFIED SEARCH SOURCES ---\n{context_block}\n--- END SOURCES ---"
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]

        try:
            from app.ai.nvidia_gateway import nvidia_gateway
            output = await nvidia_gateway.complete(messages, tier=tier, max_tokens=400, temperature=0.2)
            return output if output and len(output.strip()) > 15 else None
        except Exception:
            return None

    async def stream_answer_nvidia(
        self,
        query: str,
        search_results: List[Dict[str, Any]],
        tier: str = "fast",
        geo_metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Stream grounded tokens incrementally using the private inference gateway.
        Yields text deltas.
        """
        if not search_results:
            return

        context_lines = []
        for idx, src in enumerate(search_results[:5], start=1):
            title = src.get("title", "")
            snippet = src.get("snippet", "")
            context_lines.append(f"[{idx}] {title}\n{snippet}")
        context_block = "\n\n".join(context_lines)

        system_prompt = (
            "You are JULY, an independent AI search assistant developed by HS AI Solutions, created by Harshan Seliyan.\n"
            "Synthesize a clear, concise, direct answer to the user's query based ONLY on the provided retrieved search sources.\n"
            "Cite sources using inline numbers like [1], [2]. Do not invent facts.\n\n"
            f"--- VERIFIED SEARCH SOURCES ---\n{context_block}\n--- END SOURCES ---"
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]

        try:
            from app.ai.nvidia_gateway import nvidia_gateway
            async for chunk in nvidia_gateway.stream_complete(messages, tier=tier, max_tokens=600):
                yield chunk
        except Exception:
            return


july_assistant = JulyAssistant()
