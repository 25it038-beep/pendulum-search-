"""
Database Models & Pydantic Schemas for HS SEARCH
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class DocumentMetadata(BaseModel):
    title: str = ""
    description: str = ""
    keywords: List[str] = Field(default_factory=list)
    author: Optional[str] = None
    language: str = "en"
    language_name: str = "English"
    canonical_url: Optional[str] = None
    og_image: Optional[str] = None
    og_type: Optional[str] = None
    reading_time_min: int = 1
    content_type: str = "text/html"
    category: str = "general" # general, education, science_research, healthcare, commerce, news, entertainment, sports, travel, government, social, multimedia
    category_label: str = "General Web"
    emergent_category: Optional[str] = None
    headings: List[str] = Field(default_factory=list)
    structured_data: List[Dict[str, Any]] = Field(default_factory=list)
    page_count: Optional[int] = None
    etag: Optional[str] = None

class ImageItem(BaseModel):
    src: str
    alt: str = ""
    title: str = ""
    width: Optional[int] = None
    height: Optional[int] = None
    license: Optional[str] = "public"

class VideoItem(BaseModel):
    src: str
    type: str = "video"
    title: str = ""
    duration_sec: Optional[float] = None

class AudioItem(BaseModel):
    src: str
    type: str = "audio/mpeg"
    title: str = ""
    transcript: Optional[str] = None

class DocumentRecord(BaseModel):
    id: Optional[int] = None
    url: str
    domain: str
    title: str
    snippet: str = ""
    content_text: str
    content_hash: str
    simhash: Optional[str] = None
    status_code: int = 200
    published_at: Optional[datetime] = None
    indexed_at: datetime = Field(default_factory=datetime.utcnow)
    last_crawled_at: datetime = Field(default_factory=datetime.utcnow)
    last_modified_header: Optional[str] = None
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)
    images: List[ImageItem] = Field(default_factory=list)
    videos: List[VideoItem] = Field(default_factory=list)
    audios: List[AudioItem] = Field(default_factory=list)
    outlinks: List[str] = Field(default_factory=list)
    quality_score: float = 0.5
    credibility_score: float = 0.5
    inlink_count: int = 0
    is_live: bool = False
    source_type: str = "HTMLCrawler" # Worker type or connector source

class DocumentVersion(BaseModel):
    id: Optional[int] = None
    document_id: int
    url: str
    version_number: int = 1
    title: str
    content_hash: str
    content_text: str
    captured_at: datetime = Field(default_factory=datetime.utcnow)
    change_summary: Optional[str] = None

class DomainRecord(BaseModel):
    id: Optional[int] = None
    domain: str
    discovered_at: datetime = Field(default_factory=datetime.utcnow)
    last_crawled_at: Optional[datetime] = None
    crawl_interval_sec: int = 3600
    pages_crawled: int = 0
    credibility_score: float = 0.5
    robots_txt_content: Optional[str] = None
    robots_last_fetched: Optional[datetime] = None
    sitemaps: List[str] = Field(default_factory=list)
    status: str = "active" # discovered, active, inactive, restricted
    primary_category: str = "General Web"
    primary_language: str = "en"
    crawl_permissions: str = "permitted"
    update_frequency_sec: int = 86400
    unique_indexed_count: int = 0

class QueueItem(BaseModel):
    id: Optional[int] = None
    url: str
    domain: str
    depth: int = 0
    priority: int = 5 # 1 (highest) to 10 (lowest)
    status: str = "pending" # pending, in_progress, completed, failed
    retries: int = 0
    scheduled_for: datetime = Field(default_factory=datetime.utcnow)
    discovered_at: datetime = Field(default_factory=datetime.utcnow)
    referrer: Optional[str] = None

class LiveFeedRecord(BaseModel):
    id: Optional[int] = None
    name: str
    feed_url: str
    feed_type: str = "rss" # rss, atom, json
    category: str = "news"
    interval_sec: int = 30
    priority_level: str = "regular" # critical (1s), high (5s), regular (30s), adaptive
    is_active: bool = True
    last_checked_at: Optional[datetime] = None
    last_updated_at: Optional[datetime] = None
    items_indexed: int = 0
    error_count: int = 0
    last_error: Optional[str] = None

class CrawlerLogRecord(BaseModel):
    id: Optional[int] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    level: str = "INFO"
    event_type: str = "crawl" # crawl, index, change, discovery, error
    url: Optional[str] = None
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)

class SearchResultItem(BaseModel):
    id: int
    url: str
    domain: str
    title: str
    snippet: str
    published_at: Optional[datetime] = None
    indexed_at: datetime
    published_str: Optional[str] = None
    indexed_str: str = ""
    score: float
    text_score: float = 0.0
    semantic_score: float = 0.0
    freshness_score: float = 0.0
    credibility_score: float = 0.0
    category: str = "general"
    category_label: str = "General Web"
    language: str = "en"
    content_type: str = "text/html"
    images: List[ImageItem] = Field(default_factory=list)
    videos: List[VideoItem] = Field(default_factory=list)
    is_live: bool = False
    source_type: str = "crawler"
    source_provider: str = "HS Native Index"
    source_category: str = "hs_indexed"  # hs_indexed, external_partner, public_dataset, live_source
    original_publisher: Optional[str] = None
    retrieval_timestamp: Optional[datetime] = None
    source_attribution: Optional[str] = None
    location: Optional[Dict[str, Any]] = None
    geo_score: float = 0.0
    distance_km: Optional[float] = None
    distance_str: Optional[str] = None

class SourceRegistryRecord(BaseModel):
    id: Optional[int] = None
    source_url: str
    source_name: str
    source_category: str # science, academic, code, encyclopedic, gov, news, general
    domain: str
    source_reliability: float = 0.85
    update_frequency: str = "daily" # continuous, hourly, daily, weekly, adaptive
    interval_sec: int = 86400
    last_retrieval: Optional[datetime] = None
    next_retrieval: Optional[datetime] = None
    content_format: str = "json" # html, json, xml, pdf, warc
    access_restrictions: str = "public"
    crawl_status: str = "active" # active, paused, failed, restricted
    items_retrieved: int = 0
    error_count: int = 0

class KGEntityRecord(BaseModel):
    id: Optional[int] = None
    entity_id: str
    name: str
    entity_type: str # person, company, technology, product, research_paper, concept, location, organization
    description: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    source_url: Optional[str] = None
    credibility: float = 0.85
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class KGRelationRecord(BaseModel):
    id: Optional[int] = None
    source_entity_id: str
    target_entity_id: str
    relation_type: str
    confidence: float = 0.85
    source_url: Optional[str] = None
    evidence_snippet: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DiscoveryGapRecord(BaseModel):
    id: Optional[int] = None
    topic_or_query: str
    category: str = "general"
    search_count: int = 1
    failure_reason: str = "low_coverage"
    discovered_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_status: str = "pending"
    resolved_sources: List[str] = Field(default_factory=list)

class SystemSnapshotRecord(BaseModel):
    id: Optional[int] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    disk_percent: float = 0.0
    active_workers: int = 0
    queue_size: int = 0
    requests_per_sec: float = 0.0
    indexing_per_sec: float = 0.0
    error_rate: float = 0.0
