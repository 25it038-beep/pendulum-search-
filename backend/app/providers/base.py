"""
HS SEARCH - Search Provider Base Interfaces
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime

@dataclass
class ProviderResult:
    title: str
    url: str
    snippet: str
    source_provider: str          # e.g. "HS Native Index", "DuckDuckGo Instant Answers", "Wikipedia"
    original_publisher: str       # Domain or organization (e.g. "wikipedia.org", "bbc.com")
    retrieval_timestamp: datetime
    publication_timestamp: Optional[datetime] = None
    source_attribution: str = ""  # Legal attribution requirement (e.g. "© Wikipedia, CC BY-SA 4.0")
    is_live: bool = False
    source_type: str = "hs_indexed"  # "hs_indexed" | "external_partner" | "public_dataset" | "live_source"
    domain: str = ""
    score: float = 0.5
    language: str = "en"
    category: str = "general"
    location: Optional[Dict[str, Any]] = None
    distance_km: Optional[float] = None
    distance_str: Optional[str] = None
    images: List[Dict[str, Any]] = field(default_factory=list)
    original_rank: Optional[int] = None
    provider_type: str = "external_supplement"  # "primary_web_search" | "external_supplement" | "hs_indexed"
    result_type: str = "web"

class BaseSearchProvider(ABC):
    """Abstract base class for all search providers in the HS Search Gateway."""
    name: str = "Base"
    provider_type: str = "native"     # "native", "external", "instant", "news", "live", "geo", "research"
    source_category: str = "hs_indexed"  # "hs_indexed", "external_partner", "public_dataset", "live_source"
    is_external: bool = False

    def __init__(self):
        self.request_count = 0
        self.error_count = 0
        self.total_latency_ms = 0.0
        self.avg_latency_ms = 0.0
        self.is_healthy = True
        self.consecutive_errors = 0
        self.circuit_open = False
        self.last_circuit_trip = 0.0

    @abstractmethod
    async def search(self, query: str, limit: int = 10, **kwargs) -> List[ProviderResult]:
        """Execute query across this specific provider."""
        pass

    async def health_check(self) -> Dict[str, Any]:
        """Check provider operational status and return health telemetry."""
        return {
            "name": self.name,
            "provider_type": self.provider_type,
            "source_category": self.source_category,
            "is_external": self.is_external,
            "is_healthy": self.is_healthy,
            "circuit_open": self.circuit_open,
            "avg_latency_ms": round(self.avg_latency_ms, 1),
            "requests": self.request_count,
            "errors": self.error_count
        }

    def record_metrics(self, latency_ms: float, error: bool = False):
        self.request_count += 1
        if error:
            self.error_count += 1
            self.consecutive_errors += 1
            if self.consecutive_errors >= 3:
                self.circuit_open = True
                self.is_healthy = False
                import time
                self.last_circuit_trip = time.time()
        else:
            self.consecutive_errors = 0
            self.circuit_open = False
            self.is_healthy = True
            self.total_latency_ms += latency_ms
            self.avg_latency_ms = self.total_latency_ms / max(1, self.request_count - self.error_count)
