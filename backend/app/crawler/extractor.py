"""
Data Extraction & HTML Content Parsing Engine for HS SEARCH
Company: HS AI Solutions
"""

import re
import hashlib
import json
import urllib.parse
from bs4 import BeautifulSoup
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from app.database.models import DocumentMetadata, ImageItem, VideoItem

# Tracking parameters to strip for clean canonical links
TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "msclkid", "ref", "source", "mc_cid", "mc_eid"
}

IGNORED_EXTENSIONS = {
    ".pdf", ".zip", ".tar", ".gz", ".exe", ".dmg", ".apk", ".iso",
    ".mp3", ".wav", ".flac", ".ogg", ".css", ".js", ".json"
}

def compute_simhash(text: str) -> str:
    """Compute 64-bit SimHash for near-duplicate text detection."""
    words = re.findall(r"\w+", text.lower())
    if not words:
        return "0" * 16

    v = [0] * 64
    for word in words:
        h = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
        for i in range(64):
            bit = (h >> i) & 1
            if bit:
                v[i] += 1
            else:
                v[i] -= 1

    fingerprint = 0
    for i in range(64):
        if v[i] > 0:
            fingerprint |= (1 << i)

    return f"{fingerprint:016x}"

def normalize_url(url: str, base_url: str) -> Optional[str]:
    """Resolve relative URLs and strip tracking parameters."""
    try:
        resolved = urllib.parse.urljoin(base_url, url)
        parsed = urllib.parse.urlparse(resolved)

        if parsed.scheme not in ("http", "https"):
            return None

        # Check file extension
        path_lower = parsed.path.lower()
        if any(path_lower.endswith(ext) for ext in IGNORED_EXTENSIONS):
            return None

        # Filter query params
        query_dict = urllib.parse.parse_qs(parsed.query, keep_blank_values=False)
        clean_query = {k: v for k, v in query_dict.items() if k.lower() not in TRACKING_PARAMS}
        new_query_str = urllib.parse.urlencode(clean_query, doseq=True)

        clean_url = urllib.parse.urlunparse((
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            parsed.path,
            parsed.params,
            new_query_str,
            "" # strip fragment
        ))
        return clean_url.rstrip("/") if clean_url.endswith("/") and len(clean_url) > 10 else clean_url
    except Exception:
        return None

def extract_publication_date(soup: BeautifulSoup) -> Optional[datetime]:
    """Extract publication date from JSON-LD, meta tags, or time elements."""
    # 1. JSON-LD Schema
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, dict):
                candidates = [data]
            elif isinstance(data, list):
                candidates = data
            else:
                continue

            for c in candidates:
                for key in ["datePublished", "dateCreated", "dateModified"]:
                    val = c.get(key)
                    if val and isinstance(val, str):
                        try:
                            # Parse ISO format
                            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                            return dt.replace(tzinfo=None)
                        except Exception:
                            pass
        except Exception:
            pass

    # 2. OpenGraph / Dublin Core / Meta tags
    meta_date_keys = [
        {"property": "article:published_time"},
        {"property": "og:pubdate"},
        {"name": "pubdate"},
        {"name": "publishdate"},
        {"name": "date"},
        {"name": "DC.date.issued"}
    ]
    for attrs in meta_date_keys:
        tag = soup.find("meta", attrs=attrs)
        if tag and tag.get("content"):
            content = tag["content"].strip()
            try:
                dt = datetime.fromisoformat(content.replace("Z", "+00:00"))
                return dt.replace(tzinfo=None)
            except Exception:
                pass

    # 3. HTML5 <time> tag
    time_tag = soup.find("time")
    if time_tag and time_tag.get("datetime"):
        dt_str = time_tag["datetime"].strip()
        try:
            dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            return dt.replace(tzinfo=None)
        except Exception:
            pass

    return None

def infer_category(url: str, title: str, text: str) -> str:
    """Infer content category for search modes."""
    combined = (url + " " + title + " " + text[:500]).lower()
    if any(k in combined for k in ["arxiv", "doi.org", "abstract", "paper", "proceedings", "journal", "ieee", "biorxiv"]):
        return "academic"
    elif any(k in combined for k in ["github", "gitlab", "api", "docs", "python", "javascript", "developer", "docker", "code", "programming", "tutorial"]):
        return "tech"
    elif any(k in combined for k in ["breaking", "news", "reuters", "reported", "edition", "headline", "daily", "press"]):
        return "news"
    elif any(k in combined for k in ["video", "youtube", "watch", "stream", "trailer", "episode"]):
        return "video"
    return "general"

def extract_content(html: str, url: str) -> Dict[str, Any]:
    """Parse HTML and extract clean text, metadata, images, and links."""
    soup = BeautifulSoup(html, "html.parser")

    # 1. Title
    title = ""
    title_tag = soup.find("title")
    if title_tag and title_tag.string:
        title = title_tag.string.strip()
    if not title:
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"].strip()
    if not title:
        h1_tag = soup.find("h1")
        if h1_tag:
            title = h1_tag.get_text().strip()
    if not title:
        title = urllib.parse.urlparse(url).netloc

    # 2. Description
    description = ""
    desc_tag = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", property="og:description")
    if desc_tag and desc_tag.get("content"):
        description = desc_tag["content"].strip()

    # 3. Clean body text
    # Remove unwanted tags
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg", "form", "iframe", "aside"]):
        tag.decompose()

    body_text = soup.get_text(separator=" ", strip=True)
    body_text = re.sub(r"\s+", " ", body_text).strip()

    # Create snippet if description is absent
    if not description and len(body_text) > 0:
        description = body_text[:240] + ("..." if len(body_text) > 240 else "")

    # 4. Canonical URL & Language
    canonical_tag = soup.find("link", rel="canonical")
    canonical_url = canonical_tag.get("href") if canonical_tag else None

    html_tag = soup.find("html")
    language = html_tag.get("lang", "en").split("-")[0].lower() if html_tag and html_tag.get("lang") else "en"

    # 5. Extract Images
    images: List[ImageItem] = []
    for img in soup.find_all("img"):
        src = img.get("src")
        if not src:
            continue
        norm_src = normalize_url(src, url)
        if not norm_src:
            continue

        alt = img.get("alt", "").strip()
        img_title = img.get("title", "").strip()
        width = None
        height = None
        try:
            if img.get("width"):
                width = int(re.sub(r"\D", "", img["width"]))
            if img.get("height"):
                height = int(re.sub(r"\D", "", img["height"]))
        except Exception:
            pass

        # Ignore tiny tracking pixels
        if (width and width <= 2) or (height and height <= 2):
            continue

        images.append(ImageItem(
            src=norm_src,
            alt=alt or title,
            title=img_title,
            width=width,
            height=height
        ))
        if len(images) >= 15:
            break

    # 6. Extract Videos
    videos: List[VideoItem] = []
    for vid in soup.find_all(["video", "source"]):
        src = vid.get("src")
        if src:
            v_url = normalize_url(src, url)
            if v_url:
                videos.append(VideoItem(src=v_url, type="html5", title=title))
    
    # 7. Extract Outgoing Links
    outlinks: List[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        norm_link = normalize_url(href, url)
        if norm_link and norm_link != url and norm_link not in outlinks:
            outlinks.append(norm_link)
        if len(outlinks) >= 100:
            break

    # 8. Publication Date
    pub_date = extract_publication_date(soup)

    # 9. Hashes & Quality Scores
    content_hash = hashlib.sha256(body_text.encode("utf-8")).hexdigest()
    simhash = compute_simhash(body_text)

    # Heuristic Quality Score (0.0 to 1.0)
    word_count = len(body_text.split())
    quality = min(1.0, max(0.2, (word_count / 800.0) * 0.7 + (0.3 if pub_date else 0.1)))

    category = infer_category(url, title, body_text)

    metadata = DocumentMetadata(
        title=title,
        description=description,
        language=language,
        canonical_url=canonical_url,
        reading_time_min=max(1, word_count // 200),
        content_type="text/html",
        category=category
    )

    return {
        "title": title,
        "snippet": description,
        "content_text": body_text,
        "content_hash": content_hash,
        "simhash": simhash,
        "published_at": pub_date,
        "metadata": metadata,
        "images": images,
        "videos": videos,
        "outlinks": outlinks,
        "quality_score": quality,
        "category": category
    }

class HTMLExtractor:
    def extract(self, url: str, html: str, domain: str = "") -> Dict[str, Any]:
        data = extract_content(html, url)
        data["url"] = url
        data["domain"] = domain or urllib.parse.urlparse(url).netloc.lower()
        return data

html_extractor = HTMLExtractor()
