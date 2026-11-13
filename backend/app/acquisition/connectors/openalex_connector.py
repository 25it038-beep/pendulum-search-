"""
OpenAlex Scholarly & Research Literature Connector
Fetches verified academic works, preprints, concepts, and citations.
Company: HS AI Solutions
"""

import aiohttp
import logging
from typing import List, Dict, Any
from datetime import datetime
from app.acquisition.base import BaseConnector

logger = logging.getLogger(__name__)

class OpenAlexConnector(BaseConnector):
    def __init__(self):
        super().__init__(name="OpenAlex Scholarly Repository", category="academic", default_interval_sec=7200)
        self.api_url = "https://api.openalex.org/works"

    async def fetch_items(self, limit: int = 15) -> List[Dict[str, Any]]:
        results = []
        headers = {"User-Agent": "HSSearchGlobalBot/1.0 (mailto:scholar@hsaisolutions.com)"}

        # Query top cited / open access recent works in Computer Science & AI
        params = {
            "filter": "default.search:artificial intelligence,open_access.is_oa:true",
            "sort": "publication_date:desc",
            "per_page": str(min(limit, 25))
        }

        try:
            async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=12)) as session:
                async with session.get(self.api_url, params=params) as resp:
                    if resp.status != 200:
                        return results
                    data = await resp.json()
                    works = data.get("results", [])

                    for w in works:
                        title = w.get("title") or "Scholarly Publication"
                        doi = w.get("doi") or f"https://openalex.org/{w.get('id', '').split('/')[-1]}"
                        
                        # Reconstruct abstract from inverted index if present
                        abstract_text = ""
                        inv_index = w.get("abstract_inverted_index")
                        if inv_index:
                            word_positions = []
                            for word, positions in inv_index.items():
                                for pos in positions:
                                    word_positions.append((pos, word))
                            word_positions.sort()
                            abstract_text = " ".join([wp[1] for wp in word_positions])

                        if not abstract_text:
                            concepts = [c.get("display_name", "") for c in w.get("concepts", [])[:4]]
                            abstract_text = f"Research publication on {', '.join(concepts)}. Published in {w.get('publication_year', 2026)}."

                        pub_date = None
                        if w.get("publication_date"):
                            try:
                                pub_date = datetime.fromisoformat(w["publication_date"])
                            except Exception:
                                pass

                        results.append({
                            "url": doi,
                            "domain": "openalex.org",
                            "title": title,
                            "content_text": f"{title}. {abstract_text}",
                            "snippet": abstract_text[:280] + ("..." if len(abstract_text) > 280 else ""),
                            "published_at": pub_date or datetime.utcnow(),
                            "quality_score": 0.96,
                            "credibility_score": 0.95,
                            "category": "academic",
                            "source_type": "openalex_connector",
                            "metadata": {
                                "category": "academic",
                                "authors": [a.get("author", {}).get("display_name", "") for a in w.get("authorships", [])[:4]],
                                "doi": w.get("doi"),
                                "cited_by_count": w.get("cited_by_count", 0),
                                "language": "en"
                            }
                        })
        except Exception as e:
            logger.debug(f"OpenAlex connector retrieval error: {e}")

        return results

openalex_connector = OpenAlexConnector()
