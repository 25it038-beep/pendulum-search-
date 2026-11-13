"""
HS SEARCH - Universal Multimedia Processor
Company: HS AI Solutions | Founder: Harshan Seliyan

Extracts metadata, dimensions, embeds, captions, transcripts, and resource references
for Public Images, Videos, and Audio/Podcasts.
"""

import re
import urllib.parse
from typing import Dict, Any, List, Optional
from bs4 import BeautifulSoup
from datetime import datetime, timezone

from app.nlp.language import multilingual_engine
from app.nlp.categorizer import universal_categorizer

class MultimediaProcessor:
    def extract_images(self, soup: BeautifulSoup, base_url: str) -> List[Dict[str, Any]]:
        """Extract public image metadata with dimensions, alt text, title, and licenses."""
        images: List[Dict[str, Any]] = []
        for img in soup.find_all("img"):
            src = img.get("src") or img.get("data-src")
            if not src:
                continue
            try:
                resolved_src = urllib.parse.urljoin(base_url, src)
                alt = img.get("alt", "").strip()
                title = img.get("title", "").strip()
                width = int(img.get("width")) if img.get("width") and img.get("width").isdigit() else None
                height = int(img.get("height")) if img.get("height") and img.get("height").isdigit() else None

                # Filter out tracking pixels / tiny icons
                if width and width < 40 and height and height < 40:
                    continue

                images.append({
                    "src": resolved_src,
                    "alt": alt,
                    "title": title,
                    "width": width,
                    "height": height,
                    "license": img.get("data-license", "public")
                })
                if len(images) >= 12:
                    break
            except Exception:
                continue
        return images

    def extract_videos(self, soup: BeautifulSoup, base_url: str) -> List[Dict[str, Any]]:
        """Extract public video embeds, iframe sources, durations, and titles."""
        videos: List[Dict[str, Any]] = []

        # 1. HTML5 Video tags
        for v in soup.find_all("video"):
            src = v.get("src")
            if not src:
                source_tag = v.find("source")
                if source_tag:
                    src = source_tag.get("src")
            if src:
                videos.append({
                    "src": urllib.parse.urljoin(base_url, src),
                    "type": "html5_video",
                    "title": v.get("title", "Video Resource"),
                    "duration_sec": v.get("data-duration")
                })

        # 2. IFrames (YouTube, Vimeo, TED)
        for iframe in soup.find_all("iframe"):
            src = iframe.get("src", "")
            if any(p in src for p in ["youtube.com/embed", "player.vimeo.com", "ted.com/talks"]):
                videos.append({
                    "src": src,
                    "type": "video_embed",
                    "title": iframe.get("title", "Embedded Video Stream")
                })
                if len(videos) >= 5:
                    break

        return videos

    def extract_audio(self, soup: BeautifulSoup, base_url: str) -> List[Dict[str, Any]]:
        """Extract public audio streams, podcast episodes, and transcripts."""
        audios: List[Dict[str, Any]] = []
        for a in soup.find_all(["audio", "enclosure"]):
            src = a.get("src") or a.get("url")
            if src:
                audios.append({
                    "src": urllib.parse.urljoin(base_url, src),
                    "type": a.get("type", "audio/mpeg"),
                    "title": a.get("title", "Audio Stream"),
                    "transcript": a.get("data-transcript")
                })
        return audios

    def process(self, html_text: str, base_url: str) -> Dict[str, Any]:
        """Processes rich multimedia metadata from document."""
        soup = BeautifulSoup(html_text, "html.parser")
        now_utc = datetime.now(timezone.utc)

        images = self.extract_images(soup, base_url)
        videos = self.extract_videos(soup, base_url)
        audios = self.extract_audio(soup, base_url)

        title = soup.title.string.strip() if soup.title and soup.title.string else "Multimedia Collection"
        content_text = f"Multimedia content collection containing {len(images)} images, {len(videos)} videos, and {len(audios)} audio assets."

        detected = multilingual_engine.detect_language(title)

        return {
            "title": title,
            "description": content_text,
            "content_text": content_text,
            "canonical_url": base_url,
            "images": images,
            "videos": videos,
            "audios": audios,
            "category": "multimedia",
            "category_label": "Multimedia",
            "language": detected["code"],
            "retrieved_at": now_utc.isoformat()
        }

multimedia_processor = MultimediaProcessor()
