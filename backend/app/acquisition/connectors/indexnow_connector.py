"""
IndexNow Protocol Connector for Instant Publisher Submission
Company: HS AI Solutions
"""

import logging
from typing import List, Dict, Any
from datetime import datetime
from app.acquisition.base import BaseConnector

logger = logging.getLogger(__name__)

class IndexNowConnector(BaseConnector):
    def __init__(self):
        super().__init__(name="IndexNow Protocol Engine", category="web", default_interval_sec=300)
        self._received_submissions: List[Dict[str, Any]] = []

    def receive_submission(self, host: str, url_list: List[str], key: str = None) -> int:
        """Process incoming IndexNow notification from a publisher."""
        count = 0
        now = datetime.utcnow()
        for url in url_list:
            self._received_submissions.append({
                "host": host,
                "url": url,
                "timestamp": now,
                "key": key
            })
            count += 1
        return count

    async def fetch_items(self, limit: int = 10) -> List[Dict[str, Any]]:
        # Returns queued submissions ready for crawler extraction
        items = []
        while self._received_submissions and len(items) < limit:
            items.append(self._received_submissions.pop(0))
        return items

indexnow_connector = IndexNowConnector()
