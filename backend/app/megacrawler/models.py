"""
HS MegaCrawler Models & Types
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class CrawlerType(str, Enum):
    # 13 Universal Resource-Based Worker Types
    HTML = "HTMLCrawler"
    JAVASCRIPT = "JavaScriptCrawler"
    PDF = "PDFCrawler"
    DOCUMENT = "DocumentCrawler"
    IMAGE_METADATA = "ImageMetadataCrawler"
    VIDEO_METADATA = "VideoMetadataCrawler"
    AUDIO_METADATA = "AudioMetadataCrawler"
    API_DATA = "APIDataCrawler"
    RSS = "RSSCrawler"
    SITEMAP = "SitemapCrawler"
    DATASET = "DatasetCrawler"
    DEEP_DISCOVERY = "DeepDiscoveryCrawler"
    REFRESH_WORKER = "RefreshCrawler"

    # 15 Specialized Domain Crawlers
    WEB = "HS-WebCrawler"
    NEWS = "HS-NewsCrawler"
    RESEARCH = "HS-ResearchCrawler"
    TECH = "HS-TechCrawler"
    CODE = "HS-CodeCrawler"
    DOC = "HS-DocCrawler"
    GOV = "HS-GovCrawler"
    SCIENCE = "HS-ScienceCrawler"
    LIVE = "HS-LiveCrawler"
    IMAGE = "HS-ImageCrawler"
    VIDEO = "HS-VideoCrawler"
    DISCOVERY = "HS-DiscoveryCrawler"
    REFRESH = "HS-RefreshCrawler"
    DEEP = "HS-DeepCrawler"
    API = "HS-API-Crawler"

class CrawlerStatus(str, Enum):
    ACTIVE = "active"
    IDLE = "idle"
    PAUSED = "paused"
    THROTTLED = "throttled"
    STOPPED = "stopped"

class DiscoverySourceType(str, Enum):
    HYPERLINK = "hyperlink"
    SITEMAP = "sitemap"
    RSS_ATOM = "rss_atom"
    COMMON_CRAWL = "common_crawl"
    PUBLIC_DATASET = "public_dataset"
    INDEXNOW = "indexnow"
    PUBLIC_API = "public_api"
    INDEXED_PAGE = "indexed_page"
    NEW_DOMAIN = "new_domain"
    DOC_REPO = "doc_repo"
    RESOURCE_DIRECTORY = "resource_directory"

class JulySearchMode(str, Enum):
    FAST = "fast"
    DEEP = "deep"
    RESEARCH = "research"
    LIVE = "live"
    TECHNICAL = "technical"

class CrawlerServiceConfig(BaseModel):
    crawler_type: CrawlerType
    name: str
    description: str
    target_domains: List[str] = Field(default_factory=list)
    refresh_interval_sec: int = 30
    concurrency_limit: int = 4
    request_timeout_sec: int = 15
    max_depth: int = 3
    priority: int = 5  # 1 = highest, 10 = lowest
    respect_robots: bool = True
    user_agent_suffix: str = "Mega"
    is_enabled: bool = True

class CrawlerServiceStats(BaseModel):
    crawler_type: CrawlerType
    name: str
    status: CrawlerStatus = CrawlerStatus.ACTIVE
    active_workers: int = 0
    queue_length: int = 0
    urls_discovered: int = 0
    urls_downloaded: int = 0
    pages_indexed: int = 0
    pages_updated: int = 0
    duplicates_rejected: int = 0
    failed_requests: int = 0
    avg_latency_ms: float = 0.0
    bandwidth_kbps: float = 0.0
    cost_est_usd: float = 0.0
    last_crawl_time: Optional[datetime] = None

class WorkerInfo(BaseModel):
    worker_id: str
    crawler_type: CrawlerType
    status: str = "idle"
    current_url: Optional[str] = None
    urls_processed: int = 0
    bytes_downloaded: int = 0
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    registered_at: datetime
    last_heartbeat: datetime

class URLPriorityFactors(BaseModel):
    content_relevance: float = 0.5        # 0.0 to 1.0 (relevance to knowledge categories / search topics)
    source_quality: float = 0.7           # 0.0 to 1.0 (domain trust, TLS, editorial standard)
    domain_authority: float = 0.6         # 0.0 to 1.0 (inbound link equity, domain age)
    update_frequency: float = 0.5         # 0.0 to 1.0 (how actively the site produces new content)
    freshness: float = 0.8                # 0.0 to 1.0 (recent discovery vs stale backlog)
    user_search_demand: float = 0.5       # 0.0 to 1.0 (demand from user queries and discovery gaps)
    historical_change_freq: float = 0.5   # 0.0 to 1.0 (frequency of actual content mutations)
    content_uniqueness: float = 0.7       # 0.0 to 1.0 (inverse SimHash collision likelihood)
    crawl_cost: float = 0.3               # 0.0 to 1.0 (estimated response latency, payload weight, depth)

class FrontierTask(BaseModel):
    id: Optional[int] = None
    url: str
    domain: str
    crawler_type: str
    priority: int = 5  # 1 (critical) to 10 (background)
    depth: int = 0
    status: str = "pending"
    scheduled_for: datetime
    leased_to: Optional[str] = None
    leased_until: Optional[datetime] = None
    retries: int = 0
    max_retries: int = 3
    referrer: Optional[str] = None
    discovered_at: datetime
    discovery_source: str = "hyperlink"
    priority_score: float = 0.5  # Raw float score 0.0 to 1.0

class JulyCrawlRequest(BaseModel):
    query: str
    target_domains: Optional[List[str]] = None
    suggested_urls: Optional[List[str]] = None
    crawler_type: Optional[str] = "HS-DiscoveryCrawler"
    urgency: str = "normal"  # high, normal, low
    reason: str
    requested_by: str = "July LLM"
    mode: Optional[str] = "fast"

class BenchmarkReport(BaseModel):
    timestamp: datetime
    benchmark_duration_sec: float
    total_pages_indexed: int
    unique_domains_discovered: int
    pages_per_hour: float
    domains_per_hour: float
    successful_retrieval_rate_pct: float
    duplicate_rejection_rate_pct: float
    avg_indexing_latency_ms: float
    crawl_freshness_score: float
    infrastructure_cost_per_1000_pages_usd: float
    system_status: str

class OptimizationRecommendation(BaseModel):
    crawler_type: str
    metric: str
    observed_value: float
    recommendation: str
    suggested_action: str
    severity: str = "info"  # info, warning, action_taken
    timestamp: datetime
