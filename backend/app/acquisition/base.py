"""
Base Connector Interface for Autonomous Information Acquisition
Company: HS AI Solutions
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any
from datetime import datetime

class BaseConnector(ABC):
    def __init__(self, name: str, category: str, default_interval_sec: int = 86400):
        self.name = name
        self.category = category
        self.interval_sec = default_interval_sec
        self.last_run: datetime = None

    @abstractmethod
    async def fetch_items(self, limit: int = 25) -> List[Dict[str, Any]]:
        """
        Fetch items from the source.
        Returns a list of standardized document dictionaries:
        {
            "url": str,
            "domain": str,
            "title": str,
            "content_text": str,
            "snippet": str,
            "published_at": Optional[datetime],
            "quality_score": float,
            "credibility_score": float,
            "metadata": dict,
            "source_type": str
        }
        """
        pass
