"""
Source Registry Management for HS SEARCH
Company: HS AI Solutions
"""

from typing import List, Dict, Any
from app.database.connection import db

INITIAL_SOURCE_REGISTRY = [
    {
        "source_name": "Wikimedia Knowledge REST API",
        "source_url": "https://en.wikipedia.org/api/rest_v1",
        "source_category": "encyclopedic",
        "domain": "en.wikipedia.org",
        "source_reliability": 0.95,
        "update_frequency": "hourly",
        "interval_sec": 3600,
        "content_format": "json",
        "access_restrictions": "public"
    },
    {
        "source_name": "OpenAlex Scholarly Catalog",
        "source_url": "https://api.openalex.org/works",
        "source_category": "academic",
        "domain": "openalex.org",
        "source_reliability": 0.98,
        "update_frequency": "daily",
        "interval_sec": 7200,
        "content_format": "json",
        "access_restrictions": "public"
    },
    {
        "source_name": "Crossref Research Registry",
        "source_url": "https://api.crossref.org/works",
        "source_category": "science",
        "domain": "crossref.org",
        "source_reliability": 0.95,
        "update_frequency": "daily",
        "interval_sec": 14400,
        "content_format": "json",
        "access_restrictions": "public"
    },
    {
        "source_name": "GitHub Open Source Registry",
        "source_url": "https://api.github.com/search/repositories",
        "source_category": "code",
        "domain": "github.com",
        "source_reliability": 0.92,
        "update_frequency": "hourly",
        "interval_sec": 7200,
        "content_format": "json",
        "access_restrictions": "public"
    },
    {
        "source_name": "Wikidata Structured Entity Graph",
        "source_url": "https://www.wikidata.org/w/api.php",
        "source_category": "encyclopedic",
        "domain": "wikidata.org",
        "source_reliability": 0.98,
        "update_frequency": "daily",
        "interval_sec": 14400,
        "content_format": "json",
        "access_restrictions": "public"
    },
    {
        "source_name": "Common Crawl Global Discovery",
        "source_url": "https://commoncrawl.org/",
        "source_category": "web",
        "domain": "commoncrawl.org",
        "source_reliability": 0.90,
        "update_frequency": "weekly",
        "interval_sec": 86400,
        "content_format": "warc",
        "access_restrictions": "public"
    }
]

async def seed_source_registry():
    """Ensure all core multi-source connectors are registered in database."""
    for src in INITIAL_SOURCE_REGISTRY:
        try:
            await db.upsert_source(src)
        except Exception:
            pass
