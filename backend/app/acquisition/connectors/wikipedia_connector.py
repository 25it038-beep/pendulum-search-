"""
Wikipedia / Wikimedia REST API Connector
Fetches structured encyclopedic entries, summaries, and topics.
Company: HS AI Solutions
"""

import aiohttp
import logging
from typing import List, Dict, Any
from datetime import datetime
from app.acquisition.base import BaseConnector

logger = logging.getLogger(__name__)

class WikipediaConnector(BaseConnector):
    def __init__(self):
        super().__init__(name="Wikimedia Knowledge Connector", category="encyclopedic", default_interval_sec=3600)
        self.api_base = "https://en.wikipedia.org/api/rest_v1"
        self.seed_topics = [
            "Artificial_intelligence", "Machine_learning", "Search_engine",
            "Quantum_computing", "Distributed_computing", "Natural_language_processing",
            "Information_retrieval", "Semiconductor", "Deep_learning", "Algorithm"
        ]

    async def fetch_items(self, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        headers = {"User-Agent": "HSSearchGlobalBot/1.0 (https://hsaisolutions.com; info@hsaisolutions.com)"}

        async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as session:
            for topic in self.seed_topics[:limit]:
                try:
                    url = f"{self.api_base}/page/summary/{topic}"
                    async with session.get(url) as resp:
                        if resp.status != 200:
                            continue
                        data = await resp.json()

                        title = data.get("title", topic.replace("_", " "))
                        extract = data.get("extract", "")
                        page_url = data.get("content_urls", {}).get("desktop", {}).get("page", f"https://en.wikipedia.org/wiki/{topic}")

                        images = []
                        if "thumbnail" in data and data["thumbnail"].get("source"):
                            images.append({
                                "src": data["thumbnail"]["source"],
                                "alt": title
                            })

                        results.append({
                            "url": page_url,
                            "domain": "en.wikipedia.org",
                            "title": f"{title} - Wikipedia",
                            "content_text": extract,
                            "snippet": extract[:280] + ("..." if len(extract) > 280 else ""),
                            "published_at": datetime.utcnow(),
                            "quality_score": 0.95,
                            "credibility_score": 0.92,
                            "images": images,
                            "category": "academic",
                            "source_type": "wikipedia_connector",
                            "metadata": {
                                "category": "encyclopedic",
                                "language": "en",
                                "reading_time_min": max(1, len(extract.split()) // 200)
                            }
                        })
                except Exception as e:
                    logger.debug(f"Wikipedia connector error for {topic}: {e}")

        return results

wikipedia_connector = WikipediaConnector()
