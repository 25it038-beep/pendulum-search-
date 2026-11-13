"""
HS SEARCH - Universal PDF Document Processor
Company: HS AI Solutions | Founder: Harshan Seliyan

Extracts text, metadata, page count, document title, author, creation date,
language detection, and semantic classification from PDF documents.
"""

import io
import re
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import pypdf

from app.nlp.language import multilingual_engine
from app.nlp.categorizer import universal_categorizer
from app.crawler.extractor import compute_simhash

class PDFProcessor:
    def process(self, pdf_bytes: bytes, source_url: str) -> Dict[str, Any]:
        """
        Processes PDF binary stream and extracts full text, metadata, page count, and language.
        """
        now_utc = datetime.now(timezone.utc)
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        page_count = len(reader.pages)

        # 1. Metadata Extraction
        raw_meta = reader.metadata or {}
        meta_title = raw_meta.get("/Title")
        meta_author = raw_meta.get("/Author")
        meta_subject = raw_meta.get("/Subject")
        meta_creator = raw_meta.get("/Creator")

        creation_date = None
        raw_date = raw_meta.get("/CreationDate")
        if raw_date and isinstance(raw_date, str):
            # Format: D:YYYYMMDDHHmmSS...
            date_match = re.search(r"D:(\d{4})(\d{2})(\d{2})", raw_date)
            if date_match:
                try:
                    y, m, d = date_match.groups()
                    creation_date = datetime(int(y), int(m), int(d), tzinfo=timezone.utc)
                except Exception:
                    pass

        # 2. Text Extraction across pages
        page_texts: List[str] = []
        outlinks: List[str] = []

        for idx, page in enumerate(reader.pages[:100]): # Cap at 100 pages for search indexing
            try:
                t = page.extract_text()
                if t:
                    page_texts.append(t.strip())
                # Extract page links if present
                if "/Annots" in page:
                    annots = page["/Annots"]
                    if isinstance(annots, list):
                        for a in annots:
                            obj = a.get_object() if hasattr(a, "get_object") else a
                            if isinstance(obj, dict) and "/A" in obj and "/URI" in obj["/A"]:
                                uri = obj["/A"]["/URI"]
                                if uri.startswith("http") and uri not in outlinks:
                                    outlinks.append(uri)
            except Exception:
                continue

        full_text = "\n\n".join(page_texts)
        full_text = re.sub(r"\s+", " ", full_text).strip()

        # 3. Document Title Resolution
        title = meta_title.strip() if meta_title and len(meta_title.strip()) > 3 else ""
        if not title:
            # Fallback to first non-empty line of text
            for line in page_texts[0].split("\n") if page_texts else []:
                clean_line = line.strip()
                if len(clean_line) > 5 and len(clean_line) < 140:
                    title = clean_line
                    break
        if not title:
            # Fallback to URL filename
            filename = source_url.split("/")[-1].replace(".pdf", "").replace("-", " ").replace("_", " ")
            title = filename.title() if filename else "PDF Document"

        # 4. Description
        description = meta_subject or (full_text[:250] + "..." if len(full_text) > 250 else full_text)

        # 5. Language Detection
        detected = multilingual_engine.detect_language(f"{title} {description} {full_text[:2000]}")

        # 6. Categorization
        cat_info = universal_categorizer.classify(
            title=title,
            content=full_text,
            headings=[meta_subject] if meta_subject else [],
            url=source_url,
            structured_type="ScholarlyArticle" if "arxiv" in source_url or "doi" in full_text.lower() else "DigitalDocument"
        )

        word_count = len(full_text.split())
        quality_score = min(1.0, max(0.4, (word_count / 500.0) * 0.7 + (0.3 if meta_author else 0.0)))

        return {
            "title": title,
            "description": description,
            "content_text": full_text,
            "author": str(meta_author) if meta_author else None,
            "published_at": creation_date,
            "canonical_url": source_url,
            "page_count": page_count,
            "language": detected["code"],
            "language_name": detected["name"],
            "category": cat_info["category_key"],
            "category_label": cat_info["category_label"],
            "emergent_category": cat_info["emergent_category"],
            "content_type": "application/pdf",
            "outlinks": outlinks[:30],
            "quality_score": round(quality_score, 2),
            "simhash": compute_simhash(full_text),
            "retrieved_at": now_utc.isoformat(),
            "metadata": {
                "creator": str(meta_creator) if meta_creator else None,
                "page_count": page_count,
                "pdf_version": getattr(reader, "pdf_header", "1.7")
            }
        }

pdf_processor = PDFProcessor()
