"""
Autonomous Multi-Source Information Acquisition Coordinator
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.database.connection import db
from app.acquisition.base import BaseConnector
from app.acquisition.connectors.wikipedia_connector import wikipedia_connector
from app.acquisition.connectors.openalex_connector import openalex_connector
from app.acquisition.connectors.crossref_connector import crossref_connector
from app.acquisition.connectors.github_connector import github_connector
from app.acquisition.connectors.wikidata_connector import wikidata_connector
from app.acquisition.connectors.commoncrawl_connector import commoncrawl_connector
from app.acquisition.connectors.indexnow_connector import indexnow_connector
from app.indexer.pipeline import indexing_pipeline
from app.knowledge.extractor import entity_extractor

logger = logging.getLogger(__name__)

class AcquisitionManager:
    def __init__(self):
        self.connectors: Dict[str, BaseConnector] = {
            "wikipedia": wikipedia_connector,
            "openalex": openalex_connector,
            "crossref": crossref_connector,
            "github": github_connector,
            "wikidata": wikidata_connector,
            "commoncrawl": commoncrawl_connector,
            "indexnow": indexnow_connector
        }
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._stats = {
            "items_acquired": 0,
            "runs_completed": 0,
            "last_active": None
        }

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        logger.info("Starting Autonomous Acquisition Manager...")
        self._task = asyncio.create_task(self._acquisition_loop())

    async def stop(self):
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()

    async def _acquisition_loop(self):
        """Periodic background acquisition cycle across all connected sources."""
        while self.is_running:
            try:
                for name, connector in self.connectors.items():
                    await self.run_connector(name, limit=5)
                    await asyncio.sleep(2.0)

                # Wait between rounds
                await asyncio.sleep(60.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Acquisition loop error: {e}")
                await asyncio.sleep(15.0)

    async def run_connector(self, connector_name: str, limit: int = 10) -> Dict[str, Any]:
        """Run single connector on demand or on schedule."""
        connector = self.connectors.get(connector_name.lower())
        if not connector:
            return {"status": "error", "message": f"Connector {connector_name} not found"}

        try:
            items = await connector.fetch_items(limit=limit)
            indexed_count = 0

            for doc in items:
                # Add content hash & simhash if not present
                import hashlib
                from app.crawler.extractor import compute_simhash
                text = doc.get("content_text", "")
                doc["content_hash"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
                doc["simhash"] = compute_simhash(text)

                doc_id, action = await indexing_pipeline.index_document(doc)
                if action in ("created", "updated"):
                    indexed_count += 1
                    # Extract entities for Knowledge Graph
                    asyncio.create_task(entity_extractor.process_document_entities(
                        doc.get("title", ""), text, doc.get("url", "")
                    ))

            self._stats["items_acquired"] += indexed_count
            self._stats["runs_completed"] += 1
            self._stats["last_active"] = datetime.utcnow().isoformat()

            return {
                "connector": connector_name,
                "fetched_count": len(items),
                "indexed_count": indexed_count,
                "status": "success"
            }
        except Exception as e:
            logger.debug(f"Connector execution failed ({connector_name}): {e}")
            return {"status": "error", "message": str(e)}

acquisition_manager = AcquisitionManager()
