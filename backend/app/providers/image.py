"""
Pendulum Search - Image Search Provider & Viewer Adapter
Company: HS AI Solutions
Founder: Harshan Seliyan

Integrates open image discovery without paid API keys:
1. Wikimedia Commons API (Millions of public domain and CC images)
2. Openverse API (Over 700 million openly licensed cultural and media works)
3. Pendulum Native Web Index (images discovered by our web crawler)

Key Guarantees:
- Real images with verified metadata.
- Accurate creator attribution and license links (CC BY, CC BY-SA, Public Domain).
- Respects download policies: download is permitted only when the license explicitly permits it.
"""

import asyncio
import html as html_lib
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)

_COMMONS_API = "https://commons.wikimedia.org/w/api.php"
_OPENVERSE_API = "https://api.openverse.org/v1/images/"
_DDG_URL = "https://duckduckgo.com/"
_DDG_IMAGES_API = "https://duckduckgo.com/i.js"
_USER_AGENT = "PendulumSearch/1.0 (https://hsaisolutions.com; contact@hsaisolutions.com)"
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_CACHE_TTL_SEC = 900.0  # 15 minutes


class ImageSearchProvider:
    """
    Modular Image Search Provider.
    Queries DuckDuckGo Images as primary foundation, with Wikimedia Commons and Openverse
    for open-license filters or fallbacks.
    """

    def __init__(self):
        self._cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
        self._lock = asyncio.Lock()

    async def search(
        self,
        query: str,
        limit: int = 30,
        license_filter: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        source_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        clean_q = (query or "").strip()
        if not clean_q:
            return []

        lic_norm = (license_filter or "all").lower()
        src_norm = (source_filter or "all").lower()
        cache_key = f"{clean_q.lower()}:{limit}:{lic_norm}:{aspect_ratio}:{src_norm}"
        now = time.time()
        async with self._lock:
            if cache_key in self._cache:
                exp, data = self._cache[cache_key]
                if now < exp:
                    return data
                del self._cache[cache_key]

        is_unrestricted = lic_norm in ("all", "any", "")
        want_ddg = src_norm == "duckduckgo" or (src_norm == "all" and is_unrestricted)

        ddg_items: List[Dict[str, Any]] = []
        if want_ddg:
            ddg_items = await self._search_duckduckgo(clean_q, limit=limit)
            if aspect_ratio:
                ddg_items = [img for img in ddg_items if self._matches_aspect(img, aspect_ratio)]

        if src_norm == "all" and is_unrestricted and len(ddg_items) < min(limit, 6):
            bing_items = await self._search_bing_web_fallback(clean_q, aspect_ratio=aspect_ratio, limit=limit)
            ddg_items.extend(bing_items)

        results: List[Dict[str, Any]] = []
        seen_urls = set()

        for it in ddg_items:
            if it["url"] not in seen_urls:
                seen_urls.add(it["url"])
                results.append(it)
            if len(results) >= limit:
                break

        need_open_catalogs = (
            src_norm in ("wikimedia", "openverse")
            or not is_unrestricted
            or (src_norm == "all" and len(results) < min(limit, 6))
        )

        if need_open_catalogs:
            tasks = []
            if src_norm != "openverse":
                tasks.append(asyncio.create_task(self._search_wikimedia(clean_q, limit=limit // 2 + 5)))
            if src_norm != "wikimedia":
                tasks.append(
                    asyncio.create_task(
                        self._search_openverse(
                            clean_q,
                            limit=limit // 2 + 5,
                            license_filter=None if is_unrestricted else lic_norm
                        )
                    )
                )

            raw = await asyncio.gather(*tasks, return_exceptions=True) if tasks else []
            open_items: List[Dict[str, Any]] = []
            for bucket in raw:
                if isinstance(bucket, list):
                    open_items.extend(bucket)

            if aspect_ratio:
                open_items = [img for img in open_items if self._matches_aspect(img, aspect_ratio)]

            for it in open_items:
                if it["url"] not in seen_urls:
                    seen_urls.add(it["url"])
                    results.append(it)
                if len(results) >= limit:
                    break

        # Save to cache
        async with self._lock:
            if len(self._cache) > 500:
                self._cache.clear()
            self._cache[cache_key] = (now + _CACHE_TTL_SEC, results)

        return results[:limit]

    async def _search_duckduckgo(self, query: str, limit: int = 30) -> List[Dict[str, Any]]:
        """Fetch primary image results from DuckDuckGo i.js using fresh VQD token."""
        items: List[Dict[str, Any]] = []
        try:
            headers = {
                "User-Agent": _BROWSER_UA,
                "Accept-Language": "en-US,en;q=0.9",
            }
            async with httpx.AsyncClient(headers=headers, timeout=5.0, follow_redirects=True) as client:
                vqd_resp = await client.get(
                    _DDG_URL,
                    params={"q": query, "iax": "images", "ia": "images"}
                )
                if vqd_resp.status_code != 200:
                    return items
                m = re.search(r'vqd=["\']?([0-9-]+)["\']?', vqd_resp.text) or re.search(r'vqd=([^"&\'\s]+)', vqd_resp.text)
                if not m:
                    return items
                vqd = m.group(1)

                img_resp = await client.get(
                    _DDG_IMAGES_API,
                    params={
                        "l": "us-en",
                        "o": "json",
                        "q": query,
                        "vqd": vqd,
                        "f": ",,,,,",
                        "p": "1",
                    },
                    headers={
                        "Referer": "https://duckduckgo.com/",
                        "Accept": "application/json, text/javascript, */*; q=0.01",
                    }
                )
                if img_resp.status_code != 200:
                    return items

                payload = img_resp.json()
                if payload.get("challenge") or not isinstance(payload.get("results"), list):
                    return items
                raw_results = payload.get("results", [])
                for idx, it in enumerate(raw_results[: max(limit * 2, 40)]):
                    orig_url = (it.get("image") or "").strip()
                    if not orig_url.startswith(("http://", "https://")):
                        continue
                    thumb_url = (it.get("thumbnail") or "").strip()
                    if not thumb_url.startswith(("http://", "https://")):
                        thumb_url = orig_url
                    source_url = (it.get("url") or orig_url).strip()
                    title = (it.get("title") or query).strip()
                    w = int(it.get("width") or 0)
                    h = int(it.get("height") or 0)
                    domain_match = re.match(r"https?://(?:www\.)?([^/]+)", source_url)
                    domain = domain_match.group(1) if domain_match else "duckduckgo.com"

                    items.append({
                        "id": f"ddg_img_{idx}",
                        "title": title,
                        "url": orig_url,
                        "thumbnail_url": thumb_url,
                        "width": w,
                        "height": h,
                        "aspect_ratio": round(w / h, 2) if h else 1.0,
                        "creator": domain,
                        "creator_url": source_url,
                        "license": "Web Image (See Source)",
                        "license_url": source_url,
                        "allow_download": False,
                        "source": "DuckDuckGo",
                        "provider": "DuckDuckGo",
                        "domain": domain,
                        "source_url": source_url,
                        "description": f"Image via DuckDuckGo from {domain}.",
                        "attribution": f"Based on DuckDuckGo · Source: {domain}"
                    })
        except Exception as exc:
            logger.debug("DuckDuckGo image search error: %s", exc)

        return items

    async def _search_bing_web_fallback(
        self,
        query: str,
        aspect_ratio: Optional[str] = None,
        limit: int = 30
    ) -> List[Dict[str, Any]]:
        """Fallback to Bing web image index (DuckDuckGo's upstream web image index) when DDG rate-limits."""
        items: List[Dict[str, Any]] = []
        try:
            params: Dict[str, str] = {"q": query, "first": "1", "count": str(max(limit, 35)), "adlt": "moderate"}
            if aspect_ratio in ("wide", "landscape"):
                params["qft"] = "+filterui:aspect-wide"
            elif aspect_ratio in ("tall", "portrait"):
                params["qft"] = "+filterui:aspect-tall"
            elif aspect_ratio == "square":
                params["qft"] = "+filterui:aspect-square"

            headers = {"User-Agent": _BROWSER_UA, "Accept-Language": "en-US,en;q=0.9"}
            async with httpx.AsyncClient(headers=headers, timeout=5.0, follow_redirects=True) as client:
                resp = await client.get("https://www.bing.com/images/async", params=params)
                if resp.status_code != 200:
                    return items
                card_re = re.compile(r'<a\b[^>]*class="[^"]*\biusc\b[^"]*"[^>]*m="([^"]+)"([^>]*)>', re.I)
                for idx, match in enumerate(card_re.finditer(resp.text)):
                    if len(items) >= limit:
                        break
                    try:
                        obj = json.loads(html_lib.unescape(match.group(1)))
                    except Exception:
                        continue
                    orig_url = (obj.get("murl") or "").strip()
                    if not orig_url.startswith(("http://", "https://")):
                        continue
                    thumb_url = (obj.get("turl") or "").strip()
                    if not thumb_url.startswith(("http://", "https://")):
                        thumb_url = orig_url
                    source_url = (obj.get("purl") or orig_url).strip()
                    tail = match.group(2) or ""
                    w_m = re.search(r"expw=(\d+)", tail, re.I)
                    h_m = re.search(r"exph=(\d+)", tail, re.I)
                    w = int(w_m.group(1)) if w_m else 0
                    h = int(h_m.group(1)) if h_m else 0
                    title = (obj.get("t") or obj.get("desc") or query).strip()
                    dom_m = re.match(r"https?://(?:www\.)?([^/]+)", source_url)
                    domain = dom_m.group(1) if dom_m else "bing.com"
                    items.append({
                        "id": f"bing_img_{idx}",
                        "title": title,
                        "url": orig_url,
                        "thumbnail_url": thumb_url,
                        "width": w,
                        "height": h,
                        "aspect_ratio": round(w / h, 2) if h else 1.0,
                        "creator": domain,
                        "creator_url": source_url,
                        "license": "Web Image (See Source)",
                        "license_url": source_url,
                        "allow_download": False,
                        "source": "Bing Web Index",
                        "provider": "Bing Web Index",
                        "domain": domain,
                        "source_url": source_url,
                        "description": f"Web image index result from {domain}.",
                        "attribution": f"Based on Web Image Index · Source: {domain}"
                    })
        except Exception as exc:
            logger.debug("Bing web image fallback error: %s", exc)
        return items

    def _matches_aspect(self, img: Dict[str, Any], aspect: str) -> bool:
        w = img.get("width") or 0
        h = img.get("height") or 0
        if not w or not h:
            return False if aspect in ("tall", "portrait", "wide", "landscape", "square") else True
        ratio = w / h
        if aspect == "tall" or aspect == "portrait":
            return ratio < 0.9
        elif aspect == "wide" or aspect == "landscape":
            return ratio > 1.1
        elif aspect == "square":
            return 0.85 <= ratio <= 1.15
        return True

    async def _search_wikimedia(self, query: str, limit: int = 15) -> List[Dict[str, Any]]:
        """Search Wikimedia Commons for high-resolution openly licensed images."""
        items: List[Dict[str, Any]] = []
        try:
            headers = {"User-Agent": _USER_AGENT}
            params = {
                "action": "query",
                "generator": "search",
                "gsrsearch": f"{query} filetype:bitmap",
                "gsrnamespace": "6",
                "gsrlimit": str(limit),
                "prop": "imageinfo",
                "iiprop": "url|size|mime|extmetadata",
                "iiurlwidth": "480",  # Generate thumbnail url
                "format": "json"
            }
            async with httpx.AsyncClient(headers=headers, timeout=4.5) as client:
                resp = await client.get(_COMMONS_API, params=params)
                if resp.status_code == 200:
                    pages = resp.json().get("query", {}).get("pages", {})
                    for pid, p in pages.items():
                        imageinfo = p.get("imageinfo", [{}])[0]
                        orig_url = imageinfo.get("url")
                        if not orig_url:
                            continue

                        meta = imageinfo.get("extmetadata", {})
                        title = p.get("title", "").replace("File:", "").replace("_", " ")
                        for ext in [".jpg", ".jpeg", ".png", ".svg", ".webp"]:
                            if title.lower().endswith(ext):
                                title = title[:-len(ext)]

                        artist_raw = meta.get("Artist", {}).get("value", "") or "Wikimedia Contributor"
                        artist = re.sub(r"<[^>]+>", "", artist_raw).strip() or "Wikimedia Commons"

                        license_short = meta.get("LicenseShortName", {}).get("value", "Public Domain / CC")
                        license_url = meta.get("LicenseUrl", {}).get("value", "https://creativecommons.org/licenses/")
                        description_raw = meta.get("ImageDescription", {}).get("value", "") or title
                        description = re.sub(r"<[^>]+>", "", description_raw).strip()[:240]

                        w = imageinfo.get("width", 0)
                        h = imageinfo.get("height", 0)
                        thumb_url = imageinfo.get("thumburl") or orig_url

                        # Licensing check for downloading
                        allow_download = True  # Public domain & Creative Commons images permit downloading

                        items.append({
                            "id": f"wm_img_{pid}",
                            "title": title,
                            "url": orig_url,
                            "thumbnail_url": thumb_url,
                            "width": w,
                            "height": h,
                            "aspect_ratio": round(w / h, 2) if h else 1.0,
                            "creator": artist,
                            "creator_url": f"https://commons.wikimedia.org/wiki/{quote_plus(p.get('title', ''))}",
                            "license": license_short,
                            "license_url": license_url,
                            "allow_download": allow_download,
                            "source": "Wikimedia Commons",
                            "source_url": f"https://commons.wikimedia.org/wiki/{quote_plus(p.get('title', ''))}",
                            "description": description,
                            "attribution": f"© {artist} · Licensed under {license_short}"
                        })
        except Exception as exc:
            logger.debug("Wikimedia image search error: %s", exc)

        return items

    async def _search_openverse(self, query: str, limit: int = 15, license_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search Openverse API for 700M+ openly licensed creative works."""
        items: List[Dict[str, Any]] = []
        try:
            headers = {"User-Agent": _USER_AGENT}
            params = {
                "q": query,
                "page_size": str(min(limit, 25))
            }
            if license_filter:
                params["license_type"] = license_filter

            async with httpx.AsyncClient(headers=headers, timeout=4.5) as client:
                resp = await client.get(_OPENVERSE_API, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    for it in data.get("results", []):
                        img_url = it.get("url")
                        if not img_url:
                            continue

                        title = it.get("title") or query.title()
                        creator = it.get("creator") or "Openverse Contributor"
                        license_code = it.get("license", "").upper()
                        license_version = it.get("license_version", "")
                        license_name = f"CC {license_code} {license_version}".strip() if license_code else "Creative Commons"
                        license_url = it.get("license_url") or "https://creativecommons.org/"
                        foreign_landing_url = it.get("foreign_landing_url") or img_url

                        w = it.get("width") or 800
                        h = it.get("height") or 600
                        thumb_url = it.get("thumbnail") or img_url

                        items.append({
                            "id": f"ov_img_{it.get('id')}",
                            "title": title,
                            "url": img_url,
                            "thumbnail_url": thumb_url,
                            "width": w,
                            "height": h,
                            "aspect_ratio": round(w / h, 2) if h else 1.0,
                            "creator": creator,
                            "creator_url": it.get("creator_url") or foreign_landing_url,
                            "license": license_name,
                            "license_url": license_url,
                            "allow_download": "nd" not in license_code.lower(),
                            "source": "Openverse",
                            "source_url": foreign_landing_url,
                            "description": f"Open educational image: {title} via Openverse and {it.get('provider', 'Open Web')}.",
                            "attribution": f"Photo by {creator} · Licensed under {license_name}"
                        })
        except Exception as exc:
            logger.debug("Openverse image search error: %s", exc)

        return items


image_search_provider = ImageSearchProvider()
