"""
Crossref Scientific Literature Connector
Company: HS AI Solutions
"""

import aiohttp
import logging
from typing import List, Dict, Any
from datetime import datetime
from app.acquisition.base import BaseConnector

logger = logging.getLogger(__name__)

class CrossrefConnector(BaseConnector):
    def __init__(self):
        super().__init__(name="Crossref Research Repository", category="science", default_interval_sec=14400)
        self.api_url = "https://api.crossref.org/works"

    async def fetch_items(self, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        headers = {"User-Agent": "HSSearchGlobalBot/1.0 (mailto:admin@hsaisolutions.com)"}
        params = {
            "query": "quantum computing algorithms OR artificial intelligence",
            "rows": str(min(limit, 15)),
            "sort": "published",
            "order": "desc"
        }

        try:
            async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as session:
                async with session.get(self.api_url, params=params) as resp:
                    if resp.status != 200:
                        return results
                    data = await resp.json()
                    items = data.get("message", {}).get("items", [])

                    for item in items:
                        titles = item.get("title", [])
                        title = titles[0] if titles else "Scientific Work"
                        doi = item.get("DOI", "")
                        url = item.get("URL", f"https://doi.org/{doi}")
                        container = item.get("container-title", ["Academic Journal"])[0] if item.get("container-title") else "Journal"
                        abstract = item.get("abstract", "") or f"Published in {container}. Indexed via Crossref scientific registry."

                        # Clean XML markup from abstract if present
                        import re
                        abstract_clean = re.sub(r"<[^>]+>", " ", abstract).strip()

                        results.append({
                            "url": url,
                            "domain": "doi.org",
                            "title": title,
                            "content_text": f"{title}. {abstract_clean}",
                            "snippet": abstract_clean[:280] + ("..." if len(abstract_clean) > 280 else ""),
                            "published_at": datetime.utcnow(),
                            "quality_score": 0.94,
                            "credibility_score": 0.95,
                            "category": "academic",
                            "source_type": "crossref_connector",
                            "metadata": {
                                "journal": container,
                                "doi": doi,
                                "category": "academic"
                            }
                        })
        except Exception as e:
            logger.debug(f"Crossref connector retrieval error: {e}")

        return results

crossref_connector = CrossrefConnector()
