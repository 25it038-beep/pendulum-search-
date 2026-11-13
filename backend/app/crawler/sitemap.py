"""
XML Sitemap Parser for HS SEARCH
Company: HS AI Solutions
"""

import xml.etree.ElementTree as ET
import aiohttp
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class SitemapParser:
    def __init__(self, user_agent: str = "HSSearchBot"):
        self.user_agent = user_agent

    async def fetch_and_parse(self, sitemap_url: str, session: aiohttp.ClientSession, max_urls: int = 500) -> List[Dict[str, Any]]:
        """
        Fetch and parse a sitemap. Handles standard sitemaps and sitemap index files recursively.
        Returns a list of dicts: {"url": str, "lastmod": datetime, "priority": float}
        """
        urls = []
        try:
            async with session.get(
                sitemap_url,
                timeout=aiohttp.ClientTimeout(total=10),
                headers={"User-Agent": self.user_agent}
            ) as resp:
                if resp.status != 200:
                    return urls
                xml_text = await resp.text(errors="ignore")

            root = ET.fromstring(xml_text)
            # Remove namespace prefixes from tags for simpler parsing
            tag_name = root.tag.split("}")[-1].lower() if "}" in root.tag else root.tag.lower()

            if tag_name == "sitemapindex":
                # It's an index of multiple sitemaps!
                for sitemap_node in root.findall(".//{*}sitemap"):
                    loc_node = sitemap_node.find("{*}loc")
                    if loc_node is not None and loc_node.text:
                        sub_sitemap_url = loc_node.text.strip()
                        sub_urls = await self.fetch_and_parse(sub_sitemap_url, session, max_urls=max_urls - len(urls))
                        urls.extend(sub_urls)
                        if len(urls) >= max_urls:
                            break

            elif tag_name == "urlset":
                for url_node in root.findall(".//{*}url"):
                    loc_node = url_node.find("{*}loc")
                    if loc_node is None or not loc_node.text:
                        continue
                    loc = loc_node.text.strip()

                    lastmod_dt = None
                    lastmod_node = url_node.find("{*}lastmod")
                    if lastmod_node is not None and lastmod_node.text:
                        try:
                            lastmod_dt = datetime.fromisoformat(lastmod_node.text.strip().replace("Z", "+00:00")).replace(tzinfo=None)
                        except Exception:
                            pass

                    prio = 0.5
                    prio_node = url_node.find("{*}priority")
                    if prio_node is not None and prio_node.text:
                        try:
                            prio = float(prio_node.text.strip())
                        except Exception:
                            pass

                    urls.append({
                        "url": loc,
                        "lastmod": lastmod_dt,
                        "priority": prio
                    })
                    if len(urls) >= max_urls:
                        break

        except Exception as e:
            logger.debug(f"Error parsing sitemap {sitemap_url}: {e}")

        return urls

sitemap_parser = SitemapParser()
