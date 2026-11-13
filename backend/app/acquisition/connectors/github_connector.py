"""
GitHub Open-Source & Technical Documentation Connector
Company: HS AI Solutions
"""

import aiohttp
import logging
from typing import List, Dict, Any
from datetime import datetime
from app.acquisition.base import BaseConnector

logger = logging.getLogger(__name__)

class GitHubConnector(BaseConnector):
    def __init__(self):
        super().__init__(name="GitHub Open Source Registry", category="code", default_interval_sec=7200)
        self.api_url = "https://api.github.com/search/repositories"

    async def fetch_items(self, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "HSSearchGlobalBot/1.0"
        }
        params = {
            "q": "stars:>1000 topic:search-engine OR topic:machine-learning",
            "sort": "updated",
            "order": "desc",
            "per_page": str(min(limit, 15))
        }

        try:
            async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as session:
                async with session.get(self.api_url, params=params) as resp:
                    if resp.status != 200:
                        return results
                    data = await resp.json()
                    repos = data.get("items", [])

                    for repo in repos:
                        full_name = repo.get("full_name", "")
                        html_url = repo.get("html_url", "")
                        desc = repo.get("description", "") or "Open source software repository and technical documentation."
                        language = repo.get("language", "Code")
                        stars = repo.get("stargazers_count", 0)

                        content = f"{full_name}: {desc}. Primary language: {language}. Community stars: {stars}."

                        results.append({
                            "url": html_url,
                            "domain": "github.com",
                            "title": f"{full_name} ({language})",
                            "content_text": content,
                            "snippet": desc[:280] + ("..." if len(desc) > 280 else ""),
                            "published_at": datetime.utcnow(),
                            "quality_score": 0.92,
                            "credibility_score": 0.90,
                            "category": "tech",
                            "source_type": "github_connector",
                            "metadata": {
                                "category": "tech",
                                "language": language,
                                "stars": stars
                            }
                        })
        except Exception as e:
            logger.debug(f"GitHub connector error: {e}")

        return results

github_connector = GitHubConnector()
