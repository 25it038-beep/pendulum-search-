export type SourceId = 'pendulum' | 'external';

export type SourceLabel =
  | 'DuckDuckGo'
  | 'DuckDuckGo · Pendulum Enhanced'
  | 'Pendulum Indexed'
  | 'External Search'
  | 'Multiple Sources';

export type SearchSortMode =
  | 'relevance'
  | 'latest'
  | 'authority'
  | 'local'
  | 'pendulum'
  | 'external';

export type TimeRangeFilter = 'any' | 'hour' | 'day' | 'week' | 'month' | 'year';

export type AiModelChoice = 'july' | 'gravity';

export type QueryIntentType =
  | 'informational'
  | 'navigational'
  | 'transactional'
  | 'local'
  | 'news'
  | 'educational'
  | 'technical'
  | 'research'
  | 'comparison'
  | 'historical'
  | 'definition';

export type FreshnessNeed = 'high' | 'medium' | 'low' | 'historical';
export type LocationNeed = 'explicit_place' | 'near_me' | 'regional' | 'none';
export type CredibilityProfile = 'scientific' | 'government' | 'technical' | 'news' | 'commerce' | 'general';

export type EntityType =
  | 'educational_institution'
  | 'school'
  | 'company'
  | 'government_department'
  | 'hospital'
  | 'organization'
  | 'brand'
  | 'product'
  | 'person'
  | 'website_service';

export type SourceClass =
  | 'official_website'
  | 'official_subpage'
  | 'wikipedia'
  | 'academic'
  | 'news'
  | 'directory'
  | 'educational_portal'
  | 'web';

export interface EntityPossibleMatch {
  name: string;
  entityType?: EntityType;
  officialDomain?: string;
  officialUrl?: string;
  country?: string;
  region?: string;
  location?: string;
  description?: string;
  confidence: number;
}

export interface RecognizedEntity {
  name: string;
  normalizedName: string;
  entityType: EntityType;
  targetUrl?: string;
  targetDomain?: string;
  country?: string;
  region?: string;
  location?: string;
  abbreviations: string[];
  alternativeNames: string[];
  targetSubpageIntent?: string;
  isSpecificEntityQuery: boolean;
  isAmbiguous: boolean;
  possibleMatches: EntityPossibleMatch[];
  confidence: number;
}

export interface OfficialVerificationResult {
  domain: string;
  url: string;
  isOfficialWebsite: boolean;
  isOfficialSubpage: boolean;
  confidence: number;
  sourceClass: SourceClass;
  organizationName?: string;
  signals: string[];
  verifiedBy: string[];
}

export interface GeoLocationContext {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  lat?: number;
  lon?: number;
  language?: string;
  enabled?: boolean;
}

export interface QueryIntelligence {
  originalQuery: string;
  normalizedQuery: string;
  correctedQuery: string;
  correctionApplied: boolean;
  cleanQuery: string;
  tokens: string[];
  expandedTokens: string[];
  exactPhrases: string[];
  entities: string[];
  operators: {
    site?: string;
    contentType?: string;
    language?: string;
    freshness?: string;
  };
  intent: QueryIntentType;
  freshnessNeed: FreshnessNeed;
  locationNeed: LocationNeed;
  credibilityProfile: CredibilityProfile;
  hasLocalIntent: boolean;
  isNearMe: boolean;
  explicitPlace?: { name: string; region?: string; country?: string; lat: number; lon: number };
  regionalHints: string[];
  reformulatedQueries: string[];
  /** General-purpose entity & official-intent extraction */
  recognizedEntity?: RecognizedEntity;
  /** Backward-compatible category alias */
  intentCategory: string;
}

export type ResultType = 'web' | 'image' | 'video' | 'news' | 'map' | 'research';

export interface WebResult {
  resultType: 'web';
  id: string;
  title: string;
  url: string;
  canonicalUrl: string;
  snippet: string;
  domain: string;
  publishedAt: string | null;
}

export interface ImageResult {
  resultType: 'image';
  id: string;
  title: string;
  thumbnailUrl: string;
  originalUrl: string;
  sourceUrl: string;
  domain: string;
  width?: number;
  height?: number;
  license?: string;
}

export interface VideoResult {
  resultType: 'video';
  id: string;
  title: string;
  url: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  publisher?: string;
  sourceDomain: string;
  duration?: string;
}

export interface NewsResult {
  resultType: 'news';
  id: string;
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publishedAt: string | null;
}

export interface MapResult {
  resultType: 'map';
  id: string;
  title: string;
  url: string;
  lat: number;
  lon: number;
  address: string;
  distanceKm?: number;
}

export interface ResearchResult {
  resultType: 'research';
  id: string;
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publishedAt: string | null;
}

export interface ProviderRawResult {
  id: string;
  title: string;
  url: string;
  canonicalUrl?: string;
  snippet: string;
  domain: string;
  content: string;
  headings?: string[];
  publishedAt: string | null;
  updatedAt?: string | null;
  indexedAt: string | null;
  crawledAt?: string | null;
  source: SourceId;
  /** Internal sub-provider key used for multi-list RRF and admin diagnostics only */
  subProvider: string;
  providerDetail: string;
  rank: number;
  /** Original 1-based rank returned by primary web search provider (preserved untouched for ranking & diagnostics) */
  originalRank?: number;
  /** Semantic provider identifier ('primary_web_search' | 'pendulum_index' | 'official_discovery' | 'external_supplement') */
  providerType?: string;
  rawScore: number;
  resultType?: ResultType;
  category?: string;
  language?: string;
  favicon?: string;
  isLive?: boolean;
  location?: Record<string, any>;
  isOfficialWebsite?: boolean;
  isOfficialSubpage?: boolean;
  officialConfidence?: number;
  officialOrganizationName?: string;
  officialVerifiedBy?: string[];
  sourceClass?: SourceClass;
  discoveredSubpageType?: string;
  author?: string;
  publisher?: string;
  structuredType?: string;
  isEnriched?: boolean;
  enhancementMeta?: CandidateEnhancementMeta;
  media?: {
    images?: Array<{ src: string; alt: string; title?: string; width?: number; height?: number }>;
    videos?: Array<{ src: string; type: string; title?: string; embedUrl?: string; duration?: string }>;
  };
}

export interface CandidateEnhancementMeta {
  enriched: boolean;
  fetchedHttpStatus?: number;
  contentType?: string;
  metaDescription?: string;
  extractedTitle?: string;
  canonicalUrl?: string;
  author?: string;
  publisher?: string;
  structuredType?: string;
  contentLength: number;
  headingsCount: number;
  relevanceSignals: {
    exactQueryMatch: boolean;
    titleCoverage: number;
    headingCoverage: number;
    bodyCoverage: number;
    entityMatch: boolean;
    surfaceMentionOnly: boolean;
    relevanceScore: number;
  };
  validationEvidence: string[];
  qualityFlags: string[];
  rejected?: boolean;
  rejectReason?: string;
  latencyMs: number;
}

export interface PrimaryProviderTelemetry {
  strategyUsed: 'searxng' | 'brave_api' | 'serper_api' | 'instant_answer_fallback' | 'custom_adapter' | 'error';
  providerQuery: string;
  rawStatus: number | null;
  contentType: string | null;
  rawOrganicCount: number;
  parsedCount: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
  genuineWebUrlCount: number;
  hasFullOrganicResults: boolean;
  limitationNotice?: string;
  errors: string[];
  latencyMs: number;
}

export interface ResultQualityAssessment {
  passed: boolean;
  removeReason?: string;
  qualityScore: number;
  spamRisk: number;
  flags: string[];
}

export interface ResultDiagnostics {
  rawRrf: number;
  rrfNormalized: number;
  originalRank?: number | null;
  originalRankScore?: number;
  providerSubRanks: Record<string, number>;
  provenance: string[];
  qualityFlags: string[];
  qualityMultiplier: number;
  spamRisk: number;
  domainDiversityMultiplier: number;
  promotionReasons: string[];
  demotionReasons: string[];
  aiRerankScore?: number;
  aiRerankReason?: string;
  isEnriched?: boolean;
  validationEvidence?: string[];
  weightedComponents: Record<string, number>;
}

export interface HybridSearchResult {
  id: string;
  title: string;
  url: string;
  canonicalUrl: string;
  snippet: string;
  domain: string;
  content: string;
  headings?: string[];
  publishedAt: string | null;
  updatedAt?: string | null;
  indexedAt: string | null;
  crawledAt?: string | null;
  sources: SourceId[];
  sourceLabel: SourceLabel;
  providerDetails: string[];
  providerRanks: {
    pendulum: number | null;
    external?: number | null;
    primaryWeb?: number | null;
  };
  providerSubRanks: Record<string, number>;
  scores: {
    lexical: number;
    semantic: number;
    freshness: number;
    authority: number;
    geographic: number;
    rrf: number;
    completeness: number;
    quality: number;
    originalRank?: number;
    final: number;
  };
  favicon: string;
  resultType?: ResultType;
  category: string;
  language: string;
  isLive: boolean;
  location?: Record<string, any>;
  distanceKm?: number;
  media?: {
    images?: Array<{ src: string; alt: string; title?: string; width?: number; height?: number }>;
    videos?: Array<{ src: string; type: string; title?: string; embedUrl?: string; duration?: string }>;
  };
  aiRerankScore?: number;
  aiRerankReason?: string;
  isOfficialWebsite?: boolean;
  isOfficialSubpage?: boolean;
  officialConfidence?: number;
  officialOrganizationName?: string;
  officialVerifiedBy?: string[];
  sourceClass?: SourceClass;
  discoveredSubpageType?: string;
  author?: string;
  publisher?: string;
  structuredType?: string;
  isEnriched?: boolean;
  enhancementMeta?: CandidateEnhancementMeta;
  /** Internal ranking telemetry — stripped from public search API responses, included in /api/admin/diagnostics */
  _diagnostics?: ResultDiagnostics;
  // Backward-compatible aliases
  source: string;
  score: number;
  text_score: number;
  semantic_score: number;
  freshness_score: number;
  credibility_score: number;
  published_str?: string;
  indexed_str?: string;
  is_live: boolean;
  source_type: string;
  source_provider: string;
  source_category: string;
  original_publisher: string;
  source_attribution: string;
  images: Array<{ src: string; alt: string; title?: string; width?: number; height?: number }>;
  videos: Array<{ src: string; type: string; title?: string; embedUrl?: string; duration?: string }>;
  distance_km?: number;
  distance_str?: string;
  geo_score?: number;
}

export interface ProviderStatusMetric {
  status: 'success' | 'partial' | 'timeout' | 'error' | 'disabled';
  count: number;
  latencyMs: number;
  error?: string;
  note?: string;
}

export interface HybridRankingWeights {
  lexical: number;
  semantic: number;
  authority: number;
  freshness: number;
  geographic: number;
  rrf: number;
  completeness: number;
  pendulumRrfWeight: number;
  externalRrfWeight: number;
}

export interface OriginalVsEnhancedComparison {
  originalQuery: string;
  primaryProviderQuery: string;
  originalTop10: Array<{
    originalRank: number;
    title: string;
    url: string;
    domain: string;
    snippet: string;
    subProvider: string;
  }>;
  enhancedTop10: Array<{
    finalRank: number;
    originalRank: number | null;
    rankDelta: number | null;
    changeType: 'unchanged' | 'promoted' | 'demoted' | 'added_by_pendulum';
    title: string;
    url: string;
    domain: string;
    sourceLabel: SourceLabel;
    sourceClass?: SourceClass;
    isOfficialWebsite: boolean;
    isEnriched: boolean;
    finalScore: number;
    reasons: string[];
  }>;
  gainedResults: Array<{ title: string; url: string; domain: string; finalRank: number; reason: string }>;
  lostResults: Array<{ originalRank: number; title: string; url: string; domain: string; reason: string }>;
}

export interface AdminDiagnosticRecord {
  timestamp: string;
  query: string;
  originalQuery: string;
  primaryProviderQuery: string;
  queryIntelligence: QueryIntelligence;
  executionTimeMs: number;
  julyRerankLatencyMs: number;
  julyRerankApplied: boolean;
  primaryProviderTelemetry: PrimaryProviderTelemetry;
  enhancerTelemetry: {
    attempted: number;
    enrichedCount: number;
    rejectedCount: number;
    rejectedPages: Array<{ title: string; url: string; domain: string; reason: string }>;
    skippedReasons: Record<string, number>;
    latencyMs: number;
  };
  providers: Record<string, ProviderStatusMetric>;
  deduplication: {
    rawTotal: number;
    pendulumCandidatesCount: number;
    primaryOrganicCount: number;
    filteredOutLowQuality: number;
    uniqueTotal: number;
    duplicatesRemoved: number;
  };
  comparison: OriginalVsEnhancedComparison;
  results: Array<{
    rank: number;
    id: string;
    title: string;
    url: string;
    domain: string;
    sourceLabel: SourceLabel;
    finalScore: number;
    scores: HybridSearchResult['scores'];
    diagnostics: ResultDiagnostics;
  }>;
}
