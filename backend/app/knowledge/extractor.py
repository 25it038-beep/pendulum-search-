"""
Automated Entity & Relation Extractor
Extracts named entities (People, Companies, Products, Tech, Concepts) and relationships from text.
Company: HS AI Solutions
"""

import re
import logging
from typing import List, Dict, Any, Tuple
from app.database.connection import db

logger = logging.getLogger(__name__)

# Heuristic patterns for relationship extraction
RELATION_PATTERNS = [
    (r"\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\s+founded\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\b", "FOUNDED"),
    (r"\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\s+(?:developed|created|built)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\b", "DEVELOPS"),
    (r"\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\s+(?:produces|manufactures|released)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\b", "PRODUCES"),
    (r"\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\s+is an architecture for\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\b", "ARCHITECTURE_OF"),
    (r"\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\s+is a subsidiary of\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\b", "SUBSIDIARY_OF")
]

class EntityExtractor:
    async def process_document_entities(self, doc_title: str, text: str, url: str) -> int:
        """Extract and link entities from ingested text."""
        extracted_count = 0
        cleaned_sample = text[:3000]

        # Check relation patterns
        for pattern, rel_type in RELATION_PATTERNS:
            matches = re.findall(pattern, cleaned_sample)
            for src, tgt in matches:
                src_clean = src.strip()
                tgt_clean = tgt.strip()
                if 2 < len(src_clean) < 40 and 2 < len(tgt_clean) < 40:
                    src_id = re.sub(r"[^\w]", "_", src_clean.lower())
                    tgt_id = re.sub(r"[^\w]", "_", tgt_clean.lower())

                    # Ensure both entities exist
                    await db.upsert_kg_entity({
                        "entity_id": src_id,
                        "name": src_clean,
                        "entity_type": "organization" if "inc" in src_clean.lower() or "corp" in src_clean.lower() else "concept",
                        "description": f"Entity mentioned in {doc_title}.",
                        "source_url": url
                    })

                    await db.upsert_kg_entity({
                        "entity_id": tgt_id,
                        "name": tgt_clean,
                        "entity_type": "product" if rel_type == "PRODUCES" else "technology",
                        "description": f"Entity mentioned in {doc_title}.",
                        "source_url": url
                    })

                    # Add relationship
                    await db.upsert_kg_relation({
                        "source_entity_id": src_id,
                        "target_entity_id": tgt_id,
                        "relation_type": rel_type,
                        "confidence": 0.85,
                        "source_url": url,
                        "evidence_snippet": f"{src_clean} {rel_type.lower()} {tgt_clean}."
                    })
                    extracted_count += 1

        return extracted_count

entity_extractor = EntityExtractor()
