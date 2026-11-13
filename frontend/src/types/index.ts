export interface ImageItem {
  src: string;
  alt: string;
  title?: string;
  width?: number;
  height?: number;
}

export interface VideoItem {
  src: string;
  type: string;
  title?: string;
}

export interface AudioItem {
  src: string;
  type: string;
  title?: string;
  transcript?: string;
}

export interface SearchResultItem {
  id: number;
  url: string;
  domain: string;
  title: string;
  snippet: string;
  published_at?: string;
  indexed_at: string;
  published_str?: string;
  indexed_str: string;
  score: number;
  text_score: number;
  semantic_score: number;
  freshness_score: number;
  credibility_score: number;
  category: string;
  category_label?: string;
  language?: string;
  content_type?: string;
  images: ImageItem[];
  videos: VideoItem[];
  audios?: AudioItem[];
  is_live: boolean;
  source_type: string;
  source_provider?: string;
  source_category?: 'hs_indexed' | 'external_partner' | 'public_dataset' | 'live_source' | string;
  original_publisher?: string;
  source_attribution?: string;
  location?: Record<string, any>;
  geo_score?: number;
  distance_km?: number;
  distance_str?: string;
}

export interface Citation {
  index: number;
  title: string;
  url: string;
  domain: string;
  published_str?: string;
  indexed_str?: string;
  credibility_score?: number;
}

export interface KeyFinding {
  claim: string;
  source_title: string;
  citation_index: number;
  domain: string;
  published_at?: string;
}

export interface CrossSourceAnalysis {
  theme: string;
  assessment: string;
  supporting_citations: number[];
}

export interface KGRelation {
  type: string;
  target: string;
  evidence?: string;
}

export interface KnowledgeGraphCard {
  entity_id: string;
  name: string;
  entity_type: string;
  description?: string;
  source_url?: string;
  relations: KGRelation[];
}

export interface AIIntelligence {
  model: string;
  query?: string;
  direct_answer?: string;
  summary?: string;
  quick_summary?: string;
  executive_summary?: string;
  key_takeaways?: string[];
  key_findings?: KeyFinding[];
  cross_source_analysis?: CrossSourceAnalysis[];
  contradictions_detected?: any[];
  citations?: Citation[];
  knowledge_graph_card?: KnowledgeGraphCard;
  sub_searches?: { sub_query: string; results_found: number }[];
  confidence_score?: number;
  research_duration_sec?: number;
  error?: string;
}

export interface SourceRegistryItem {
  id: number;
  source_name: string;
  source_url: string;
  source_category: string;
  domain: string;
  source_reliability: number;
  update_frequency: string;
  interval_sec: number;
  last_retrieval?: string;
  content_format: string;
  crawl_status: string;
  items_retrieved: number;
  error_count: number;
}

export interface DiscoveryGap {
  id: number;
  topic_or_query: string;
  category: string;
  search_count: number;
  failure_reason: string;
  discovered_at: string;
  resolved_status: string;
}

export interface SystemHealth {
  status: string;
  resources: {
    cpu_percent: number;
    ram_percent: number;
    ram_used_gb: number;
    ram_total_gb: number;
    disk_percent: number;
    disk_free_gb: number;
    concurrency_throttle: number;
  };
  metrics: SystemMetrics;
  recent_snapshots: any[];
}

export interface SearchResponse {
  engine: string;
  company: string;
  founder: string;
  query: string;
  mode: string;
  sort: string;
  page: number;
  total_results: number;
  execution_time_ms: number;
  applied_filters?: Record<string, any>;
  geo_metadata?: Record<string, any>;
  ai_intelligence?: AIIntelligence;
  results: SearchResultItem[];
}

export interface LiveFeed {
  id: number;
  name: string;
  feed_url: string;
  feed_type: string;
  category: string;
  interval_sec: number;
  priority_level: string;
  is_active: boolean;
  last_checked_at?: string;
  last_updated_at?: string;
  items_indexed: number;
  error_count: number;
  last_error?: string;
}

export interface SystemMetrics {
  total_discovered_domains: number;
  total_discovered_urls: number;
  indexed_webpages: number;
  modified_webpages: number;
  queue_size: number;
  active_live_feeds: number;
  total_searches: number;
  average_search_response_time_ms: number;
  crawling_req_per_sec: number;
  indexing_ops_per_sec: number;
  recent_logs: any[];
}

export type SearchMode =
  | 'general'
  | 'latest'
  | 'news'
  | 'tech'
  | 'academic'
  | 'image'
  | 'video'
  | 'research'
  | 'realtime';

export type SortOrder = 'relevance' | 'newest' | 'oldest' | 'closest' | 'best_rated';

// Global Geolocation Intelligence Types
export interface GeoCoordinates {
  lat: number;
  lon: number;
}

export interface GeoPlaceSuggestion {
  id: number;
  name: string;
  type: string;
  label: string;
  country: string;
  country_code: string;
  state?: string;
  city?: string;
  lat: number;
  lon: number;
}

export interface LiveLocalInfo {
  city: string;
  is_live: boolean;
  retrieved_at: string;
  freshness_label?: string;
  weather?: {
    temperature_c: number;
    condition: string;
    humidity_percent: number;
    wind_kmh: number;
    air_quality_index: number;
    air_quality_label: string;
    published_at: string;
    source: string;
  };
  transit_updates?: Array<{
    line: string;
    status: string;
    message: string;
    last_checked_at: string;
  }>;
  announcements?: Array<{
    title: string;
    type: string;
    issued_at: string;
    source: string;
  }>;
}

export interface GeoMetadata {
  is_geo_query: boolean;
  intent_type: string;
  target_place?: string;
  target_lat?: number;
  target_lon?: number;
  radius_km?: number;
  ranking_mode?: string;
  category?: string;
  ambiguous_matches?: any[];
  live_local_info?: LiveLocalInfo;
}

export interface LocationState {
  mode: 'worldwide' | 'near_me' | 'city' | 'region' | 'country';
  displayName: string;
  coords?: GeoCoordinates;
  radiusKm: number;
  rankingMode: string;
  privacyMode: 'standard' | 'approximate' | 'disabled';
}

// HS MegaCrawler Ecosystem Types
export interface CrawlerServiceItem {
  crawler_type: string;
  name: string;
  description?: string;
  status: 'active' | 'idle' | 'paused' | 'throttled' | 'stopped';
  active_workers: number;
  queue_length: number;
  urls_discovered: number;
  urls_downloaded: number;
  pages_indexed: number;
  pages_updated: number;
  duplicates_rejected: number;
  failed_requests: number;
  avg_latency_ms: number;
  bandwidth_kbps: number;
  cost_est_usd: number;
  concurrency_limit: number;
  priority: number;
}

export interface MegaCrawlerSummary {
  active_workers: number;
  total_queue_length: number;
  urls_discovered: number;
  urls_downloaded: number;
  pages_indexed: number;
  pages_updated: number;
  duplicates_rejected: number;
  failed_requests: number;
  total_cost_est_usd: number;
  cost_per_1000_pages_usd: number;
}

export interface MegaCrawlerEcosystemResponse {
  engine: string;
  company: string;
  founder: string;
  status: string;
  crawler_count: number;
  summary: MegaCrawlerSummary;
  discovery_engine?: {
    status: string;
    total_urls_discovered: number;
    sitemaps_parsed: number;
    feeds_scanned: number;
    api_records_ingested: number;
    active_channels: string[];
  };
  storage?: {
    storage_path: string;
    total_documents_retained: number;
    disk_usage_mb: number;
    uncompressed_data_mb: number;
    average_compression_ratio: string;
    backend: string;
  };
  self_optimization?: {
    status: string;
    safety_boundaries: {
      max_worker_concurrency: number;
      min_worker_concurrency: number;
      robots_txt_immutable: boolean;
      ssrf_protection_immutable: boolean;
      rate_limit_immutable: boolean;
    };
    recent_tuning_actions: any[];
    active_optimizations: string[];
  };
  crawlers: CrawlerServiceItem[];
}

export interface MegaCrawlerWorker {
  worker_id: string;
  crawler_type: string;
  status: string;
  current_url?: string;
  urls_processed: number;
  bytes_downloaded: number;
  cpu_percent: number;
  memory_mb: number;
  registered_at: string;
  last_heartbeat: string;
}

export interface BenchmarkReport {
  timestamp: string;
  benchmark_duration_sec: number;
  total_pages_indexed: number;
  unique_domains_discovered: number;
  pages_per_hour: number;
  domains_per_hour: number;
  successful_retrieval_rate_pct: number;
  duplicate_rejection_rate_pct: number;
  avg_indexing_latency_ms: number;
  crawl_freshness_score: number;
  infrastructure_cost_per_1000_pages_usd: number;
  system_status: string;
}

// Multi-Source Search Provider & Hybrid Engine Types
export type SourceType = 'hs_indexed' | 'external_partner' | 'public_dataset' | 'live_source';

export interface ProviderStats {
  [providerName: string]: {
    count: number;
    status: 'ok' | 'failed' | 'circuit_open';
    error?: string;
  };
}

export interface HybridSearchResponse extends SearchResponse {
  sources_used?: string[];
  provider_stats?: ProviderStats;
  query_intent?: string;
  query_complexity?: string;
  is_hybrid?: boolean;
}

export interface NvidiaStats {
  stats: {
    fast: { requests: number; total_tokens: number; errors: number; avg_latency_ms: number };
    quality: { requests: number; total_tokens: number; errors: number; avg_latency_ms: number };
    reasoning: { requests: number; total_tokens: number; errors: number; avg_latency_ms: number };
  };
  models: {
    fast: string;
    quality: string;
    reasoning: string;
  };
  circuit_status: 'open' | 'closed';
}

// Real-time SSE Stream Event Types
export type StreamEvent =
  | { type: 'results'; results: SearchResultItem[]; geo_metadata?: any; total: number }
  | { type: 'token'; content: string }
  | { type: 'ai_done'; citations: any[]; model: string }
  | { type: 'external_results'; results: SearchResultItem[]; provider: string }
  | { type: 'done'; total: number; sources: string[]; execution_time_ms: number }
  | { type: 'error'; message: string };

