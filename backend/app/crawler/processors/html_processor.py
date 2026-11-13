"""
HS SEARCH - Universal HTML Document Processor
Company: HS AI Solutions | Founder: Harshan Seliyan

Extracts Title, Main content, Headings, Meta Description, Outlinks,
Author, Publication date, Canonical URL, Language, and Structured Data (JSON-LD, OpenGraph).
"""

import re
import json
import urllib.parse
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from bs4 import BeautifulSoup

from app.nlp.language import multilingual_engine
from app.nlp.categorizer import universal_categorizer
from app.crawler.extractor import compute_simhash

TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "msclkid", "ref", "source", "mc_cid", "mc_eid"
}

class HTMLProcessor:
    def process(self, html_text: str, base_url: str) -> Dict[str, Any]:
        """
        Parses raw HTML text and extracts complete metadata, structure, and content.
        """
        soup = BeautifulSoup(html_text, "html.parser")
        now_utc = datetime.now(timezone.utc)

        # 1. Canonical URL
        canonical_tag = soup.find("link", rel=lambda r: r and "canonical" in r)
        canonical_url = canonical_tag.get("href") if canonical_tag else None
        if canonical_url:
            canonical_url = urllib.parse.urljoin(base_url, canonical_url)
        else:
            canonical_url = base_url

        # 2. Document Title
        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        elif soup.find("meta", property="og:title"):
            title = soup.find("meta", property="og:title").get("content", "").strip()
        elif soup.find("h1"):
            title = soup.find("h1").get_text(strip=True)
        if not title:
            parsed = urllib.parse.urlparse(base_url)
            title = parsed.path.strip("/").replace("-", " ").replace("_", " ").title() or parsed.netloc

        # 3. Meta Description
        description = ""
        meta_desc = soup.find("meta", attrs={"name": re.compile(r"description", re.I)}) or \
                    soup.find("meta", property="og:description")
        if meta_desc and meta_desc.get("content"):
            description = meta_desc.get("content").strip()

        # 4. Author Extraction
        author = None
        author_meta = soup.find("meta", attrs={"name": re.compile(r"author", re.I)}) or \
                      soup.find("meta", property="article:author")
        if author_meta and author_meta.get("content"):
            author = author_meta.get("content").strip()

        # 5. Publication Date Extraction
        published_at = None
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if isinstance(item, dict):
                        # Author fallback
                        if not author and "author" in item:
                            auth = item["author"]
                            if isinstance(auth, dict) and "name" in auth:
                                author = auth["name"]
                            elif isinstance(auth, str):
                                author = auth
                        # Date
                        for k in ("datePublished", "dateCreated", "dateModified"):
                            val = item.get(k)
                            if val and isinstance(val, str):
                                try:
                                    published_at = datetime.fromisoformat(val.replace("Z", "+00:00"))
                                    break
                                except Exception:
                                    pass
            except Exception:
                pass

        if not published_at:
            time_tag = soup.find("time")
            if time_tag and time_tag.get("datetime"):
                try:
                    published_at = datetime.fromisoformat(time_tag["datetime"].replace("Z", "+00:00"))
                except Exception:
                    pass

        # 6. Headings (H1, H2, H3)
        headings: List[str] = []
        for h in soup.find_all(["h1", "h2", "h3"]):
            text = h.get_text(strip=True)
            if text and len(text) > 2 and text not in headings:
                headings.append(text)
                if len(headings) >= 15:
                    break

        # 7. Structured Data (JSON-LD & OpenGraph)
        structured_data: List[Dict[str, Any]] = []
        primary_schema_type = None
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                if isinstance(data, dict):
                    structured_data.append(data)
                    primary_schema_type = data.get("@type", primary_schema_type)
                elif isinstance(data, list):
                    structured_data.extend(data)
            except Exception:
                pass

        og_type = None
        og_type_tag = soup.find("meta", property="og:type")
        if og_type_tag:
            og_type = og_type_tag.get("content")

        # 8. Clean Main Content
        # Remove noisy elements
        for el in soup(["script", "style", "noscript", "svg", "nav", "footer", "iframe"]):
            el.decompose()

        # Extract textual strings
        content_text = " ".join(soup.stripped_strings)
        content_text = re.sub(r"\s+", " ", content_text).strip()

        # 9. Outlinks Extraction
        outlinks = []
        for a in soup.find_all("a", href=True):
            raw_href = a["href"].strip()
            if not raw_href or raw_href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue
            try:
                resolved = urllib.parse.urljoin(base_url, raw_href)
                p = urllib.parse.urlparse(resolved)
                if p.scheme in ("http", "https"):
                    # clean query params
                    q_tuples = [(k, v) for k, v in urllib.parse.parse_qsl(p.query) if k.lower() not in TRACKING_PARAMS]
                    clean_url = urllib.parse.urlunparse((p.scheme, p.netloc.lower(), p.path, "", urllib.parse.urlencode(q_tuples), ""))
                    if clean_url not in outlinks and clean_url != base_url:
                        outlinks.append(clean_url)
                        if len(outlinks) >= 50:
                            break
            except Exception:
                pass

        # 10. Language Detection
        declared_lang = None
        html_tag = soup.find("html")
        if html_tag and html_tag.get("lang"):
            declared_lang = html_tag.get("lang").split("-")[0].lower()

        detected = multilingual_engine.detect_language(f"{title} {description} {content_text[:1500]}")
        lang_code = declared_lang if (declared_lang and len(declared_lang) == 2 and declared_lang in multilingual_engine.detect_language(title)["code"]) else detected["code"]

        # 11. Categorization
        cat_info = universal_categorizer.classify(
            title=title,
            content=content_text,
            headings=headings,
            url=base_url,
            structured_type=primary_schema_type or og_type
        )

        # 12. Quality score heuristic
        word_count = len(content_text.split())
        quality_score = min(1.0, max(0.2, (word_count / 400.0) * 0.7 + (0.3 if author or published_at else 0.0)))

        return {
            "title": title,
            "description": description or (content_text[:200] + "..."),
            "content_text": content_text,
            "headings": headings,
            "author": author,
            "published_at": published_at,
            "canonical_url": canonical_url,
            "language": lang_code,
            "language_name": detected["name"],
            "category": cat_info["category_key"],
            "category_label": cat_info["category_label"],
            "emergent_category": cat_info["emergent_category"],
            "structured_data": structured_data[:3],
            "outlinks": outlinks,
            "quality_score": round(quality_score, 2),
            "simhash": compute_simhash(content_text),
            "retrieved_at": now_utc.isoformat()
        }

html_processor = HTMLProcessor()
