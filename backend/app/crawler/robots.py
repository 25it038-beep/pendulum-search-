"""
Robots.txt Parser & Compliance Engine for HS SEARCH
Company: HS AI Solutions
"""

import urllib.robotparser
import urllib.parse
import aiohttp
import asyncio
from typing import Dict, Tuple, List, Optional
from datetime import datetime, timedelta

class RobotsManager:
    def __init__(self, user_agent: str = "HSSearchBot"):
        self.user_agent = user_agent
        self._parsers: Dict[str, urllib.robotparser.RobotFileParser] = {}
        self._sitemaps: Dict[str, List[str]] = {}
        self._crawl_delays: Dict[str, float] = {}
        self._cache_expires: Dict[str, datetime] = {}
        self._lock = asyncio.Lock()

    def _extract_domain(self, url: str) -> str:
        parsed = urllib.parse.urlparse(url)
        return parsed.netloc.lower()

    async def can_fetch(self, url: str, session: aiohttp.ClientSession) -> Tuple[bool, float, List[str]]:
        """
        Check if URL can be fetched under robots.txt rules.
        Returns: (allowed: bool, crawl_delay: float, sitemaps: List[str])
        """
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        if not domain:
            return False, 0.0, []

        now = datetime.utcnow()

        async with self._lock:
            # Check cache validity
            if domain in self._parsers and now < self._cache_expires.get(domain, now):
                parser = self._parsers[domain]
                allowed = parser.can_fetch(self.user_agent, url) or parser.can_fetch("*", url)
                delay = self._crawl_delays.get(domain, 1.0)
                sitemaps = self._sitemaps.get(domain, [])
                return allowed, delay, sitemaps

        # Fetch robots.txt
        robots_url = f"{parsed.scheme}://{domain}/robots.txt"
        rp = urllib.robotparser.RobotFileParser()
        sitemaps = []
        crawl_delay = 1.0

        try:
            async with session.get(robots_url, timeout=aiohttp.ClientTimeout(total=8), headers={"User-Agent": self.user_agent}) as resp:
                if resp.status == 200:
                    text = await resp.text(errors="ignore")
                    rp.parse(text.splitlines())
                    
                    # Extract sitemaps & crawl delay
                    for line in text.splitlines():
                        line_stripped = line.strip()
                        if line_stripped.lower().startswith("sitemap:"):
                            parts = line_stripped.split(":", 1)
                            if len(parts) == 2 and parts[1].strip():
                                sitemaps.append(parts[1].strip())
                        elif line_stripped.lower().startswith("crawl-delay:"):
                            try:
                                val = float(line_stripped.split(":", 1)[1].strip())
                                crawl_delay = max(crawl_delay, val)
                            except ValueError:
                                pass
                elif resp.status in (401, 403):
                    # Disallowed
                    rp.disallow_all = True
                else:
                    # 404 or other errors mean allow all
                    rp.allow_all = True
        except Exception:
            # On network timeout or connection error, default to polite allow
            rp.allow_all = True

        async with self._lock:
            self._parsers[domain] = rp
            self._sitemaps[domain] = sitemaps
            self._crawl_delays[domain] = min(crawl_delay, 10.0) # cap at 10s
            self._cache_expires[domain] = now + timedelta(hours=24)

        allowed = rp.can_fetch(self.user_agent, url) or rp.can_fetch("*", url)
        return allowed, self._crawl_delays[domain], sitemaps

    async def is_allowed(self, url: str, user_agent: Optional[str] = None) -> bool:
        """Fast check whether URL is allowed under cached or default robots policy."""
        parsed = urllib.parse.urlparse(url)
        domain = parsed.netloc.lower()
        rp = self._parsers.get(domain)
        ua = user_agent or self.user_agent
        if rp:
            return rp.can_fetch(ua, url) or rp.can_fetch("*", url)
        return True

robots_manager = RobotsManager()
robots_cache = robots_manager
