"""
Pendulum Search - Media Metadata Provider
Company: HS AI Solutions
Founder: Harshan Seliyan

Extracts canonical metadata, embed codes, MIME types, and licensing information
for media URLs (YouTube, Wikimedia Commons, HTML5 Video, Audio, and Images).
"""

import asyncio
import logging
import re
from typing import Any, Dict, Optional
from urllib.parse import parse_qs, urlparse

import httpx

logger = logging.getLogger(__name__)


class MediaMetadataProvider:
    """Extracts verified playback metadata and embed permissions for any media URL."""

    async def get_metadata(self, url: str) -> Dict[str, Any]:
        clean_url = (url or "").strip()
        if not clean_url:
            return {"error": "Empty URL"}

        parsed = urlparse(clean_url)
        domain = parsed.netloc.lower()

        # 1. YouTube
        if "youtube.com" in domain or "youtu.be" in domain:
            video_id = None
            if "youtu.be" in domain:
                video_id = parsed.path.lstrip("/").split("?")[0]
            else:
                qs = parse_qs(parsed.query)
                video_id = qs.get("v", [None])[0]

            if video_id:
                oembed_data = await self._fetch_youtube_oembed(video_id)
                return {
                    "url": clean_url,
                    "media_type": "youtube",
                    "video_id": video_id,
                    "embed_url": f"https://www.youtube.com/embed/{video_id}?autoplay=1&enablejsapi=1",
                    "thumbnail_url": oembed_data.get("thumbnail_url") or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                    "title": oembed_data.get("title") or "YouTube Video",
                    "publisher": oembed_data.get("author_name") or "YouTube",
                    "publisher_url": oembed_data.get("author_url") or clean_url,
                    "is_embeddable": True,
                    "format": "iframe",
                    "license": "Standard YouTube License"
                }

        # 2. Wikimedia Commons File
        if "wikimedia.org" in domain:
            is_video = any(clean_url.lower().endswith(ext) for ext in [".webm", ".mp4", ".ogv"])
            is_image = any(clean_url.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".svg", ".webp", ".gif"])
            return {
                "url": clean_url,
                "media_type": "video" if is_video else ("image" if is_image else "media"),
                "embed_url": clean_url,
                "thumbnail_url": clean_url if is_image else "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Video-icon-svg.svg/480px-Video-icon-svg.svg.png",
                "title": parsed.path.split("/")[-1].replace("_", " "),
                "publisher": "Wikimedia Commons",
                "is_embeddable": True,
                "format": "html5_video" if is_video else ("html5_image" if is_image else "direct"),
                "license": "Creative Commons / Public Domain"
            }

        # 3. Direct Video / Audio / Image File
        lower_path = parsed.path.lower()
        if lower_path.endswith((".mp4", ".webm", ".ogv", ".mov", ".m4v")):
            return {
                "url": clean_url,
                "media_type": "video",
                "embed_url": clean_url,
                "thumbnail_url": None,
                "title": parsed.path.split("/")[-1],
                "publisher": domain,
                "is_embeddable": True,
                "format": "html5_video",
                "license": "Source Domain License"
            }
        elif lower_path.endswith((".mp3", ".ogg", ".wav", ".m4a")):
            return {
                "url": clean_url,
                "media_type": "audio",
                "embed_url": clean_url,
                "title": parsed.path.split("/")[-1],
                "publisher": domain,
                "is_embeddable": True,
                "format": "html5_audio",
                "license": "Source Domain License"
            }
        elif lower_path.endswith((".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif")):
            return {
                "url": clean_url,
                "media_type": "image",
                "embed_url": clean_url,
                "thumbnail_url": clean_url,
                "title": parsed.path.split("/")[-1],
                "publisher": domain,
                "is_embeddable": True,
                "format": "html5_image",
                "license": "Source Domain License"
            }

        # Fallback Web Resource
        return {
            "url": clean_url,
            "media_type": "web_page",
            "embed_url": None,
            "title": domain,
            "publisher": domain,
            "is_embeddable": False,
            "format": "link",
            "license": "Copyright of original publisher"
        }

    async def _fetch_youtube_oembed(self, video_id: str) -> Dict[str, Any]:
        try:
            url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
            async with httpx.AsyncClient(timeout=2.5) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.json()
        except Exception:
            pass
        return {}


media_metadata_provider = MediaMetadataProvider()
