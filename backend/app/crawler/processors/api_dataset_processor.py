"""
HS SEARCH - Universal API & Dataset Processor
Company: HS AI Solutions | Founder: Harshan Seliyan

Extracts schema, metadata, update frequency, records, and source attribution
for Open Data, CKAN, REST/JSON APIs, and scientific public datasets.
"""

import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.nlp.language import multilingual_engine
from app.nlp.categorizer import universal_categorizer
from app.crawler.extractor import compute_simhash

class APIDatasetProcessor:
    def process(self, raw_data: Any, source_url: str, content_type: str = "application/json") -> Dict[str, Any]:
        """
        Parses JSON/tabular datasets, schemas, and API metadata records.
        """
        now_utc = datetime.now(timezone.utc)

        data = raw_data
        if isinstance(raw_data, str):
            try:
                data = json.loads(raw_data)
            except Exception:
                data = {"raw_text": raw_data}

        # 1. Infer Schema and Format
        schema: Dict[str, str] = {}
        items_sample: List[Dict[str, Any]] = []

        if isinstance(data, list):
            record_count = len(data)
            if data and isinstance(data[0], dict):
                for k, v in data[0].items():
                    schema[k] = type(v).__name__
                items_sample = data[:5]
        elif isinstance(data, dict):
            record_count = len(data.keys())
            for k, v in list(data.items())[:20]:
                schema[k] = type(v).__name__
            items_sample = [data]
        else:
            record_count = 1

        # 2. Dataset Title & Description
        title = ""
        description = ""
        attribution = ""
        update_frequency = "daily"

        # Check for standard CKAN / OpenData schema fields
        if isinstance(data, dict):
            title = data.get("title") or data.get("name") or data.get("dataset_name", "")
            description = data.get("description") or data.get("notes") or data.get("summary", "")
            attribution = data.get("author") or data.get("maintainer") or data.get("organization", {}).get("title", "")
            update_frequency = data.get("update_frequency") or data.get("frequency", "daily")

        if not title:
            # Fallback to URL path
            parts = [p for p in source_url.split("/") if p]
            title = f"Dataset: {parts[-1].replace('-', ' ').replace('_', ' ').title()}" if parts else "Public Open Dataset"

        if not description:
            description = f"Structured public dataset with {record_count} records. Schema: {', '.join(list(schema.keys())[:8])}"

        content_text = f"{title}. {description}. Fields: {', '.join(schema.keys())}. Sample data: {json.dumps(items_sample)[:600]}"

        # 3. Language & Categorization
        detected = multilingual_engine.detect_language(f"{title} {description}")
        cat_info = universal_categorizer.classify(
            title=title,
            content=content_text,
            url=source_url,
            structured_type="Dataset"
        )

        return {
            "title": title,
            "description": description,
            "content_text": content_text,
            "canonical_url": source_url,
            "author": attribution or None,
            "category": cat_info["category_key"],
            "category_label": cat_info["category_label"],
            "language": detected["code"],
            "content_type": content_type,
            "quality_score": 0.85,
            "simhash": compute_simhash(content_text),
            "retrieved_at": now_utc.isoformat(),
            "metadata": {
                "schema": schema,
                "record_count": record_count,
                "update_frequency": update_frequency,
                "attribution": attribution or "Public Domain / Open Data"
            }
        }

api_dataset_processor = APIDatasetProcessor()
