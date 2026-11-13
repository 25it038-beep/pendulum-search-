"""
HS SEARCH - External Partner Search Provider Adapter
Company: HS AI Solutions
Founder: Harshan Seliyan

Integrates authorized, documented external APIs (DuckDuckGo Instant Answers & Wikipedia OpenSearch).
Strictly adheres to:
- Documented interfaces only (no undocumented scraping)
- Explicit partner attribution ("External Partner Result")
- Strict timeout control (1.5s max)
- Independent failure isolation (never impairs HS Native Index)
"""

import time
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.config import settings
from app.providers.base import BaseSearchProvider, ProviderResult

class HSExternalSearchProvider(BaseSearchProvider):
    """
    Authorized External Search Provider Adapter.
    Combines DuckDuckGo Instant Answer API and Wikipedia OpenSearch API.
    """
    name = "DuckDuckGo & Wikipedia Partner Network"
    provider_type = "external"
    source_category = "external_partner"
    is_external = True

    def __init__(self):
        super().__init__()
        self.ddg_url = getattr(settings, "DUCKDUCKGO_API_URL", "https://api.duckduckgo.com/")
        self.wiki_url = getattr(settings, "WIKIPEDIA_API_URL", "https://en.wikipedia.org/w/api.php")
        self.timeout_sec = getattr(settings, "EXTERNAL_PROVIDER_TIMEOUT_SEC", 1.5)

    async def search(self, query: str, limit: int = 10, **kwargs) -> List[ProviderResult]:
        if not getattr(settings, "ENABLE_EXTERNAL_PROVIDERS", True):
            return []

        # Check circuit breaker
        if self.circuit_open:
            import time
            if time.time() - self.last_circuit_trip < 30.0:
                return []
            else:
                self.circuit_open = False  # Half-open retry

        start = time.perf_counter()
        results: List[ProviderResult] = []

        headers = {
            "User-Agent": getattr(settings, "USER_AGENT", "HSSearchBot/1.0 (+https://hsaisolutions.com/bot)")
        }

        async with httpx.AsyncClient(headers=headers, timeout=self.timeout_sec) as client:
            # 1. Query DuckDuckGo Documented Instant Answer API
            try:
                ddg_params = {
                    "q": query,
                    "format": "json",
                    "no_html": "1",
                    "skip_disambig": "1"
                }
                resp = await client.get(self.ddg_url, params=ddg_params)
                if resp.status_code == 200:
                    data = resp.json()

                    # Primary Abstract
                    abstract = data.get("AbstractText")
                    abstract_url = data.get("AbstractURL")
                    heading = data.get("Heading")
                    abstract_src = data.get("AbstractSource") or "DuckDuckGo Partner"

                    if abstract and abstract_url:
                        domain = abstract_url.split("/")[2] if "//" in abstract_url else "duckduckgo.com"
                        results.append(ProviderResult(
                            title=heading or query.title(),
                            url=abstract_url,
                            snippet=abstract,
                            source_provider="DuckDuckGo Instant Answers",
                            original_publisher=abstract_src,
                            retrieval_timestamp=datetime.utcnow(),
                            publication_timestamp=None,
                            source_attribution=f"Powered by DuckDuckGo Instant Answer API • Source: {abstract_src}",
                            is_live=False,
                            source_type="external_partner",
                            domain=domain,
                            score=0.88,
                            category="general"
                        ))

                    # Related Topics
                    for topic in data.get("RelatedTopics", [])[:4]:
                        text = topic.get("Text")
                        first_url = topic.get("FirstURL")
                        if text and first_url:
                            domain = first_url.split("/")[2] if "//" in first_url else "external"
                            results.append(ProviderResult(
                                title=text[:60] + "..." if len(text) > 60 else text,
                                url=first_url,
                                snippet=text,
                                source_provider="DuckDuckGo Instant Answers",
                                original_publisher=abstract_src,
                                retrieval_timestamp=datetime.utcnow(),
                                publication_timestamp=None,
                                source_attribution=f"Powered by DuckDuckGo Instant Answer API • Source: {abstract_src}",
                                is_live=False,
                                source_type="external_partner",
                                domain=domain,
                                score=0.75,
                                category="general"
                            ))
            except Exception:
                pass

            # 2. Query Wikipedia OpenSearch API
            try:
                wiki_params = {
                    "action": "opensearch",
                    "search": query,
                    "limit": "4",
                    "namespace": "0",
                    "format": "json"
                }
                resp_wiki = await client.get(self.wiki_url, params=wiki_params)
                if resp_wiki.status_code == 200:
                    wdata = resp_wiki.json()
                    if len(wdata) >= 4:
                        titles = wdata[1]
                        descriptions = wdata[2]
                        urls = wdata[3]
                        for i in range(min(len(titles), len(urls))):
                            w_url = urls[i]
                            w_title = titles[i]
                            w_desc = descriptions[i] if i < len(descriptions) else ""
                            # Skip if already in results
                            if any(r.url == w_url for r in results):
                                continue
                            results.append(ProviderResult(
                                title=w_title,
                                url=w_url,
                                snippet=w_desc or f"Wikipedia article regarding {w_title}.",
                                source_provider="Wikipedia OpenSearch",
                                original_publisher="wikipedia.org",
                                retrieval_timestamp=datetime.utcnow(),
                                publication_timestamp=None,
                                source_attribution="Wikipedia content licensed under CC BY-SA 4.0",
                                is_live=False,
                                source_type="public_dataset",
                                domain="wikipedia.org",
                                score=0.80,
                                category="encyclopedic"
                            ))
            except Exception:
                pass

        latency = (time.perf_counter() - start) * 1000.0
        self.record_metrics(latency, error=(len(results) == 0))
        return results[:limit]
