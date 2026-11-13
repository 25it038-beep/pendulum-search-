import { GLOBAL_PLACES, LOCAL_ENTITIES, LIVE_LOCAL_DATA } from './geoData';
import {
  AdminDiagnosticRecord,
  AiModelChoice,
  GeoLocationContext,
  HybridSearchResult,
  OriginalVsEnhancedComparison,
  PrimaryProviderTelemetry,
  ProviderRawResult,
  ProviderStatusMetric,
  SearchSortMode,
  TimeRangeFilter
} from './types';
import {
  NativeIndexedDoc,
  pendulumDocs,
  searchPendulumIndex
} from './providers/pendulumProvider';
import {
  DuckDuckGoProvider,
  INSTANT_ANSWER_LIMITATION_NOTICE,
  defaultDuckDuckGoProvider,
  fetchPermittedExternalProviders,
  fetchWithTimeout,
  isBlockedHost,
  stripHtml
} from './providers/duckduckgoProvider';
import { deduplicateResults, normalizeUrl } from './hybrid/deduplicator';
import { analyzeQuery, rankHybridResults } from './hybrid/ranker';
import { evaluationMetrics, TtlCache } from './metrics';
import { imageSearchProvider, videoSearchProvider } from './providers/mediaProviders';
import {
  AiOverviewPayload,
  contextualizeFollowupQuery,
  FollowupResponseStyle,
  generateAiOverview,
  registerRetrievedSources,
  rerankCandidatesWithJuly,
  resolveModelChoice,
  streamAiOverviewText
} from './ai/julyEngine';
import { analyzeQueryIntelligence, enhanceQueryWithJulyAI, registerCorpusVocabulary } from './query/intelligence';
import {
  discoverAndVerifyOfficialWebsite,
  extractRegistrableHost,
  OfficialDiscoveryBundle
} from './entity/officialDiscovery';
import { crawlUrlAndRecord } from './crawler/crawlerEngine';
import { enhanceSearchResults, EnhancementRunOptions } from './enhancer/resultEnhancer';

export { isBlockedHost };
export const nativeDocs: NativeIndexedDoc[] = pendulumDocs;

const nowIso = () => new Date().toISOString();
let nextDocId = 200;

export const KG_ENTITIES = [
  {
    entity_id: 'harshan_seliyan',
    name: 'Harshan Seliyan B S',
    entity_type: 'person',
    description: 'Founder and Chief Architect of HS AI Solutions (HS AI Studio), creator of Pendulum, July LLM, and Gravity LLM.',
    aliases: ['harshan', 'harshan seliyan', 'harshan seliyan b s', 'h. seliyan'],
    source_url: 'https://hs-ai-studio-4i7i.vercel.app/journey'
  },
  {
    entity_id: 'hs_ai_solutions',
    name: 'HS AI Solutions',
    entity_type: 'company',
    description: 'AI research and engineering studio founded by Harshan Seliyan B S, building July LLM, Gravity LLM, Pendulum, DOMCode LLM, Galaxy Vision, Electron AI, Lumina, HSBot, Ledger, and Phishing Defence.',
    aliases: ['hs ai', 'hs ai solutions', 'hs ai studio', 'hs-ai-studio-4i7i.vercel.app'],
    source_url: 'https://hs-ai-studio-4i7i.vercel.app/'
  },
  {
    entity_id: 'hs_search',
    name: 'Pendulum Search (HS SEARCH)',
    entity_type: 'product',
    description: 'Automated Private Browser & hybrid AI search engine by HS AI Solutions combining Pendulum web indexing, multi-source retrieval, and July & Gravity AI overviews.',
    aliases: ['hs search', 'pendulum search', 'pendulum', 'pendulum browser'],
    source_url: 'https://hs-ai-studio-4i7i.vercel.app/products/pendulum'
  },
  {
    entity_id: 'july_llm',
    name: 'July & Gravity LLM',
    entity_type: 'technology',
    description: 'Dual-tier AI model architecture by HS AI Solutions: July LLM (autonomous multi-model CLI & search reasoning) and Gravity LLM (local intelligence engine with 44 built-in tools).',
    aliases: ['july', 'july llm', 'july ai', 'gravity', 'gravity llm'],
    source_url: 'https://hs-ai-studio-4i7i.vercel.app/products/july-llm'
  },
  {
    entity_id: 'quantum_computing',
    name: 'Quantum Computing',
    entity_type: 'concept',
    description: 'Computation leveraging quantum mechanics phenomena—superposition, interference, and entanglement—to process information in qubits.',
    aliases: ['quantum computing', 'quantum computer', 'qubits'],
    source_url: 'https://www.ibm.com/topics/quantum-computing'
  }
];

export const KG_RELATIONS = [
  { source_entity_id: 'harshan_seliyan', type: 'FOUNDED', target: 'HS AI Solutions', evidence: 'Harshan Seliyan founded HS AI Solutions.' },
  { source_entity_id: 'hs_ai_solutions', type: 'DEVELOPS', target: 'Pendulum Search (HS SEARCH)', evidence: 'HS AI Solutions builds Pendulum Search.' },
  { source_entity_id: 'hs_search', type: 'POWERED_BY', target: 'July & Gravity AI', evidence: 'Pendulum Search AI overviews are powered by July and Gravity AI.' }
];

export const searchHistoryLog: Array<{ query: string; timestamp: string }> = [];
export const systemLogs: Array<{ id: number; timestamp: string; level: string; component: string; message: string }> = [
  { id: 1, timestamp: nowIso(), level: 'INFO', component: 'HybridSearch', message: 'Pendulum BM25 + Vector + Pure RRF fusion pipeline initialized.' },
  { id: 2, timestamp: nowIso(), level: 'INFO', component: 'JulyGravityAI', message: '7-criteria July reranking & grounded citation synthesis ready.' }
];

export const systemStats = {
  totalSearches: 0,
  totalLatenciesMs: [] as number[],
  crawlerRunning: true,
  liveMonitorRunning: true,
  gatewayRequests: 0,
  gatewayTokens: 0,
  gatewayErrors: 0
};

const hybridCache = new TtlCache<any>(60_000, 150);

export function evaluateSafeMath(expr: string): string | null {
  const cleaned = expr.trim().replace(/^what is\s+/i, '').replace(/\?$/, '').trim();
  if (!/^[0-9+\-*/().\s^%]+$/.test(cleaned) || !/[0-9]/.test(cleaned) || !/[+\-*/^%]/.test(cleaned)) {
    return null;
  }
  try {
    const jsExpr = cleaned.replace(/\^/g, '**');
    const result = Function(`"use strict"; return (${jsExpr});`)();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return `${cleaned} = ${result}`;
    }
  } catch {}
  return null;
}

export interface HybridExecutionParams {
  query: string;
  type?: string;
  mode?: string;
  providers?: Array<'pendulum' | 'duckduckgo' | 'external'>;
  sort?: SearchSortMode;
  timeRange?: TimeRangeFilter;
  safeSearch?: boolean;
  limit?: number;
  location?: GeoLocationContext;
  aiOverview?: boolean;
  aiModel?: AiModelChoice | 'auto';
  rerank?: boolean;
  skipCache?: boolean;
  includeDiagnostics?: boolean;
  ddgAdapter?: DuckDuckGoProvider;
  forceProviderFailure?: 'pendulum' | 'duckduckgo' | 'external';
  disableEntityDiscovery?: boolean;
  enhancerOptions?: EnhancementRunOptions;
}

const TIME_RANGE_WINDOWS_MS: Record<Exclude<TimeRangeFilter, 'any'>, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000
};

function filterResultsByTimeRange(items: HybridSearchResult[], timeRange?: TimeRangeFilter): HybridSearchResult[] {
  if (!timeRange || timeRange === 'any') return items;
  const maxAgeMs = TIME_RANGE_WINDOWS_MS[timeRange];
  if (!maxAgeMs) return items;
  const nowMs = Date.now();
  return items.filter((item) => {
    const rawDate =
      item.publishedAt ||
      item.updatedAt ||
      (item.isLive ? item.crawledAt || item.indexedAt : null);
    if (!rawDate) return false;
    const parsedMs = Date.parse(rawDate);
    if (!Number.isFinite(parsedMs)) return false;
    return nowMs - parsedMs <= maxAgeMs;
  });
}

function sanitizePublicResult(item: HybridSearchResult): HybridSearchResult {
  const copy = { ...item };
  delete copy._diagnostics;
  const hasDdg =
    (item.providerDetails || []).some((d) => /duckduckgo/i.test(d)) ||
    'primary_web_organic' in (item.providerSubRanks || {}) ||
    'knowledge_ia' in (item.providerSubRanks || {}) ||
    'ext_ia' in (item.providerSubRanks || {}) ||
    'ext_topic' in (item.providerSubRanks || {}) ||
    Boolean(item.providerRanks?.primaryWeb);

  const isEnhanced = Boolean(
    item.isEnriched ||
      item.isOfficialWebsite ||
      item.isOfficialSubpage ||
      item.enhancementMeta?.enriched ||
      item.sources.includes('pendulum')
  );

  if (hasDdg) {
    copy.sourceLabel = isEnhanced ? 'DuckDuckGo · Pendulum Enhanced' : 'DuckDuckGo';
    copy.source_provider = isEnhanced ? 'DuckDuckGo · Pendulum Enhanced' : 'DuckDuckGo';
    copy.source_attribution = copy.sourceLabel;
    copy.providerDetails = isEnhanced ? ['DuckDuckGo', 'Pendulum Enhanced'] : ['DuckDuckGo'];
  } else {
    copy.providerDetails = [item.domain || item.original_publisher];
    copy.source_provider = item.domain || item.original_publisher;
  }
  return copy;
}

export async function executeHybridEngine(params: HybridExecutionParams) {
  const startedAt = performance.now();
  const query = params.query.trim();
  const rawType = (params.type || params.mode || 'All').toLowerCase();
  const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
  const sort: SearchSortMode = params.sort || 'relevance';
  const timeRange: TimeRangeFilter = params.timeRange || 'any';
  const enabledProviders = new Set(params.providers || ['pendulum', 'duckduckgo', 'external']);
  const ddgAdapter = params.ddgAdapter || defaultDuckDuckGoProvider;

  // Phase 2: Query Intelligence (never alters displayed query)
  let intel = analyzeQueryIntelligence(query, params.location, { type: rawType, mode: params.mode });
  if (params.aiOverview !== false && !params.forceProviderFailure) {
    intel = await enhanceQueryWithJulyAI(intel);
  }

  const locKey =
    intel.locationNeed === 'none' || params.location?.enabled === false
      ? 'geo:global'
      : `${params.location?.country || ''}:${params.location?.region || ''}:${params.location?.city || ''}`;
  const cacheKey = JSON.stringify({
    q: query.toLowerCase(),
    t: rawType,
    p: Array.from(enabledProviders).sort(),
    s: sort,
    tr: timeRange,
    l: limit,
    locKey,
    ai: params.aiOverview !== false,
    m: params.aiModel || 'auto',
    rr: params.rerank !== false
  });

  if (!params.skipCache && !params.forceProviderFailure && !params.includeDiagnostics) {
    const cached = hybridCache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  systemStats.totalSearches += 1;
  searchHistoryLog.unshift({ query, timestamp: nowIso() });
  if (searchHistoryLog.length > 50) searchHistoryLog.pop();

  const mathDirect = evaluateSafeMath(query);

  // Phase 3: Concurrent retrieval up to 40 candidates per source
  let pendulumResults: ProviderRawResult[] = [];
  let supplementalResults: ProviderRawResult[] = [];
  let externalResults: ProviderRawResult[] = [];
  let subProviderMetrics: Record<string, { count: number; latencyMs: number; status: string }> = {};
  let directAnswer: string | undefined = mathDirect ? `Direct Computation: ${mathDirect}` : undefined;
  let abstractText: string | undefined;

  const pendulumMetric: ProviderStatusMetric = { status: 'disabled', count: 0, latencyMs: 0 };
  const supplementalMetric: ProviderStatusMetric = { status: 'disabled', count: 0, latencyMs: 0 };
  const externalMetric: ProviderStatusMetric = { status: 'disabled', count: 0, latencyMs: 0 };

  const providerTasks: Array<Promise<void>> = [];
  const retrievalQuery = intel.correctedQuery || query;

  if (enabledProviders.has('pendulum')) {
    providerTasks.push(
      (async () => {
        const t0 = performance.now();
        try {
          if (params.forceProviderFailure === 'pendulum') {
            throw new Error('Simulated Pendulum index timeout');
          }
          const catFilter = rawType === 'maps' ? undefined : rawType === 'news' ? 'news' : undefined;
          pendulumResults = await searchPendulumIndex(query, {
            limit: Math.max(limit * 2, 40),
            location: params.location,
            category: catFilter,
            intelligence: intel
          });
          pendulumMetric.status = 'success';
          pendulumMetric.count = pendulumResults.length;
        } catch (err: any) {
          pendulumMetric.status = 'error';
          pendulumMetric.error = err?.message || 'Pendulum retrieval error';
        } finally {
          pendulumMetric.latencyMs = Math.round((performance.now() - t0) * 10) / 10;
        }
      })()
    );
  }

  let primaryProviderTelemetry: PrimaryProviderTelemetry = {
    strategyUsed: 'instant_answer_fallback',
    providerQuery: query,
    rawStatus: null,
    contentType: null,
    rawOrganicCount: 0,
    parsedCount: 0,
    rejectedCount: 0,
    rejectionReasons: {},
    genuineWebUrlCount: 0,
    hasFullOrganicResults: false,
    limitationNotice: INSTANT_ANSWER_LIMITATION_NOTICE,
    errors: [],
    latencyMs: 0
  };

  if (enabledProviders.has('duckduckgo')) {
    providerTasks.push(
      (async () => {
        const t0 = performance.now();
        try {
          if (params.forceProviderFailure === 'duckduckgo') {
            throw new Error('Simulated primary web search outage');
          }
          // CRITICAL: Always send the exact untouched original user query to the primary web-search provider
          const res = await ddgAdapter.search(query, {
            limit: 30,
            safeSearch: params.safeSearch !== false,
            timeoutMs: 3200,
            regionCode: params.location?.countryCode,
            language: params.location?.language
          });
          supplementalResults = res.results.map((r, idx) => ({
            ...r,
            source: 'external' as const,
            subProvider: r.subProvider || 'knowledge_ia',
            originalRank: r.originalRank ?? (r.subProvider === 'primary_web_organic' || r.subProvider === 'searxng_web' ? r.rank || idx + 1 : undefined)
          }));
          if (res.telemetry) {
            primaryProviderTelemetry = res.telemetry;
          } else {
            const organicHits = supplementalResults.filter(
              (r) => r.subProvider === 'primary_web_organic' || r.subProvider === 'searxng_web' || typeof r.originalRank === 'number'
            );
            primaryProviderTelemetry = {
              strategyUsed: organicHits.length > 0 ? 'custom_adapter' : 'instant_answer_fallback',
              providerQuery: query,
              rawStatus: 200,
              contentType: 'application/json',
              rawOrganicCount: organicHits.length,
              parsedCount: organicHits.length,
              rejectedCount: 0,
              rejectionReasons: {},
              genuineWebUrlCount: organicHits.length,
              hasFullOrganicResults: organicHits.length > 0,
              limitationNotice: organicHits.length > 0 ? undefined : INSTANT_ANSWER_LIMITATION_NOTICE,
              errors: res.error ? [res.error] : [],
              latencyMs: Math.round((performance.now() - t0) * 10) / 10
            };
          }
          if (!directAnswer && res.directAnswer) directAnswer = res.directAnswer;
          if (res.abstractText) abstractText = res.abstractText;
          supplementalMetric.count = supplementalResults.length;
          supplementalMetric.note = res.engineLabel;
          if (res.error && supplementalResults.length === 0) {
            supplementalMetric.status = 'error';
            supplementalMetric.error = res.error;
          } else if (res.partial) {
            supplementalMetric.status = 'partial';
          } else {
            supplementalMetric.status = 'success';
          }
        } catch (err: any) {
          supplementalMetric.status = 'error';
          supplementalMetric.error = err?.message || 'Primary web retrieval error';
          primaryProviderTelemetry = {
            ...primaryProviderTelemetry,
            strategyUsed: 'error',
            errors: [supplementalMetric.error],
            latencyMs: Math.round((performance.now() - t0) * 10) / 10
          };
        } finally {
          supplementalMetric.latencyMs = Math.round((performance.now() - t0) * 10) / 10;
        }
      })()
    );
  }

  if (enabledProviders.has('external')) {
    providerTasks.push(
      (async () => {
        const t0 = performance.now();
        try {
          if (params.forceProviderFailure === 'external') {
            throw new Error('Simulated external providers failure');
          }
          const externalQuery = intel.recognizedEntity?.targetDomain || retrievalQuery;
          const ext = await fetchPermittedExternalProviders(externalQuery, {
            type: rawType,
            limit: 35,
            timeoutMs: 3600,
            intelligence: intel
          });
          externalResults = ext.results;
          subProviderMetrics = ext.subProviderMetrics;
          externalMetric.count = externalResults.length;
          externalMetric.status =
            externalResults.length > 0 ? (ext.errors.length > 0 ? 'partial' : 'success') : ext.errors.length > 0 ? 'error' : 'success';
          if (ext.errors.length > 0) externalMetric.error = ext.errors.join('; ');
        } catch (err: any) {
          externalMetric.status = 'error';
          externalMetric.error = err?.message || 'External provider error';
        } finally {
          externalMetric.latencyMs = Math.round((performance.now() - t0) * 10) / 10;
        }
      })()
    );
  }

  let officialDiscovery: OfficialDiscoveryBundle | null = null;
  if (
    intel.recognizedEntity?.isSpecificEntityQuery &&
    !params.disableEntityDiscovery &&
    enabledProviders.has('pendulum') &&
    params.forceProviderFailure !== 'pendulum'
  ) {
    providerTasks.push(
      (async () => {
        try {
          officialDiscovery = await discoverAndVerifyOfficialWebsite(intel.recognizedEntity!, intel, {
            timeoutMs: 3200
          });
        } catch {}
      })()
    );
  }

  await Promise.allSettled(providerTasks);

  if (officialDiscovery && (officialDiscovery as OfficialDiscoveryBundle).results.length > 0) {
    const bundle = officialDiscovery as OfficialDiscoveryBundle;
    pendulumResults = [...bundle.results, ...pendulumResults];
    pendulumMetric.count = pendulumResults.length;
    if (pendulumMetric.status === 'disabled') pendulumMetric.status = 'success';

    // Continuously ingest newly discovered official homepage & subpages into Pendulum's index
    for (const offRes of bundle.results) {
      if (!pendulumDocs.some((d) => d.url === offRes.url)) {
        const docId = ++nextDocId;
        pendulumDocs.unshift({
          id: docId,
          url: offRes.url,
          domain: offRes.domain,
          title: offRes.title,
          headings: offRes.headings,
          snippet: offRes.snippet,
          content_text: offRes.content,
          published_at: null,
          indexed_at: offRes.indexedAt || nowIso(),
          crawled_at: offRes.crawledAt || nowIso(),
          category: offRes.category || 'official',
          language: offRes.language || 'en',
          source_type: 'hs_indexed',
          source_provider: 'Pendulum Official Discovery',
          source_category: 'hs_indexed',
          original_publisher: offRes.officialOrganizationName || offRes.domain,
          source_attribution: 'Pendulum Indexed',
          credibility_score: Math.max(0.88, offRes.officialConfidence || 0.9),
          is_live: Boolean(offRes.isLive),
          images: [],
          videos: []
        });
      }
    }
    registerCorpusVocabulary(bundle.results.map((r) => `${r.title} ${r.snippet}`));
  }

  // Aggregate external metrics cleanly without private provider leakage
  const combinedExternalMetric: ProviderStatusMetric = {
    status:
      externalMetric.status === 'error' && supplementalMetric.status === 'error'
        ? 'error'
        : externalMetric.status === 'error' || supplementalMetric.status === 'error' || externalMetric.status === 'partial' || supplementalMetric.status === 'partial'
        ? 'partial'
        : externalMetric.status === 'disabled' && supplementalMetric.status === 'disabled'
        ? 'disabled'
        : 'success',
    count: externalMetric.count + supplementalMetric.count,
    latencyMs: Math.max(externalMetric.latencyMs, supplementalMetric.latencyMs),
    error: [externalMetric.error, supplementalMetric.error].filter(Boolean).join('; ') || undefined
  };

  // Annotate any matching external candidates belonging to the verified official domain
  const verifiedDomain = (officialDiscovery as OfficialDiscoveryBundle | null)?.verifiedRecord?.isOfficialWebsite
    ? (officialDiscovery as OfficialDiscoveryBundle).verifiedRecord!.domain
    : undefined;
  const verifiedRecord = (officialDiscovery as OfficialDiscoveryBundle | null)?.verifiedRecord;
  const primaryRootItem = pendulumResults.find((r) => r.isOfficialWebsite);
  const primaryRootCanonical = primaryRootItem ? (primaryRootItem.canonicalUrl || primaryRootItem.url) : undefined;

  // Phase 4: Annotate verified official domain matches -> Run PendulumResultEnhancer -> Deduplicate
  const preEnhancementCombined = [...pendulumResults, ...supplementalResults, ...externalResults].map((item) => {
    if (verifiedDomain && verifiedRecord && extractRegistrableHost(item.domain) === verifiedDomain && !item.isOfficialWebsite && !item.isOfficialSubpage) {
      let isRoot = false;
      try {
        const u = new URL(item.url);
        const p = u.pathname.replace(/\/+$/, '');
        isRoot = p === '' || p === '/2023' || p === '/en-us' || p === '/en-in' || (Boolean(primaryRootItem) && item.url === primaryRootItem!.url);
      } catch {}
      return {
        ...item,
        canonicalUrl: isRoot && primaryRootCanonical ? primaryRootCanonical : item.canonicalUrl,
        isOfficialWebsite: isRoot,
        isOfficialSubpage: !isRoot,
        officialConfidence: verifiedRecord.confidence,
        officialOrganizationName: verifiedRecord.organizationName,
        officialVerifiedBy: verifiedRecord.verifiedBy,
        sourceClass: (isRoot ? 'official_website' : 'official_subpage') as 'official_website' | 'official_subpage'
      };
    }
    return item;
  });

  const enhancerBatch = await enhanceSearchResults(preEnhancementCombined, query, intel, {
    enableLiveFetch: params.enhancerOptions?.enableLiveFetch ?? !params.forceProviderFailure,
    maxLiveFetches: params.enhancerOptions?.maxLiveFetches ?? 5,
    perPageTimeoutMs: params.enhancerOptions?.perPageTimeoutMs ?? 1400,
    fetchPage: params.enhancerOptions?.fetchPage
  });

  const deduped = deduplicateResults(enhancerBatch.candidates);

  const hasExplicitImageIntent = /\b(images?|photos?|pictures?|wallpapers?|diagrams?|screenshots?|infographics?)\b/i.test(query);
  const hasExplicitVideoIntent = /\b(videos?|watch|clips?|documentary|lectures?|trailers?)\b/i.test(query);

  let tabFiltered = deduped.items;
  if (rawType === 'images' || rawType === 'image') {
    const withImgs = deduped.items.filter(
      (i) => i.resultType === 'image' || i.category === 'image' || (i.media?.images && i.media.images.length > 0)
    );
    tabFiltered = withImgs;
  } else if (rawType === 'videos' || rawType === 'video') {
    const withVids = deduped.items.filter(
      (i) => i.resultType === 'video' || i.category === 'video' || (i.media?.videos && i.media.videos.length > 0)
    );
    tabFiltered = withVids;
  } else if (rawType === 'maps') {
    const withMaps = deduped.items.filter((i) => i.location !== undefined || i.category === 'map' || i.resultType === 'map');
    if (withMaps.length > 0) tabFiltered = withMaps;
  } else {
    // Web/All/News/Research/Books/Shopping: never leak standalone image/video items into organic web results
    tabFiltered = deduped.items.filter((i) => {
      if ((i.resultType === 'image' || i.category === 'image') && !hasExplicitImageIntent) return false;
      if ((i.resultType === 'video' || i.category === 'video') && !hasExplicitVideoIntent) return false;
      return true;
    });
  }

  // Phase 4 + 6 + 7 + 8: Quality Filter -> Pure RRF -> Intent-Aware Scoring -> Domain Diversity
  const { ranked, analysis, filteredOutCount } = rankHybridResults(tabFiltered, query, {
    location: params.location,
    sort,
    intelligence: intel
  });

  // Phase 5: July AI Reranking over top candidates (<= 10)
  let finalRanked = ranked;
  let aiReranked = false;
  let julyRerankLatencyMs = 0;
  if (params.rerank !== false && sort === 'relevance' && ranked.length >= 2) {
    const rr = await rerankCandidatesWithJuly(query, analysis, ranked, params.location);
    finalRanked = rr.reranked;
    aiReranked = rr.applied;
    julyRerankLatencyMs = rr.latencyMs;
  }

  if (timeRange !== 'any') {
    finalRanked = filterResultsByTimeRange(finalRanked, timeRange);
  }

  const slicedInternal = finalRanked.slice(0, limit);
  const allowMediaImages = rawType === 'images' || rawType === 'image' || (rawType === 'all' && hasExplicitImageIntent);
  const allowMediaVideos = rawType === 'videos' || rawType === 'video' || (rawType === 'all' && hasExplicitVideoIntent);

  const slicedPublic = slicedInternal.map((item) => {
    const pub = sanitizePublicResult(item);
    if (!allowMediaImages && !allowMediaVideos) {
      pub.media = undefined;
      pub.images = [];
      pub.videos = [];
    } else {
      if (!allowMediaImages) pub.images = [];
      if (!allowMediaVideos) pub.videos = [];
    }
    return pub;
  });
  registerRetrievedSources(slicedPublic);

  // Strict media isolation: only attach images/videos in explicit media tabs or explicit media-intent queries
  let enrichedVideos: any[] = [];
  if (allowMediaVideos) {
    try {
      const vRes = await videoSearchProvider.search(retrievalQuery, 8);
      enrichedVideos = vRes.items;
    } catch {}
  }

  let images: any[] = [];
  if (allowMediaImages) {
    images = slicedPublic
      .flatMap((r) =>
        (r.media?.images || []).map((img) => ({
          ...img,
          sourceUrl: r.url,
          sourceTitle: r.title,
          domain: r.domain
        }))
      )
      .slice(0, 12);

    if (images.length < 4) {
      try {
        const iRes = await imageSearchProvider.search(retrievalQuery, { limit: 12 });
        images = iRes.items.map((im) => ({
          id: im.id,
          src: im.thumbnailUrl,
          thumbnailUrl: im.thumbnailUrl,
          originalUrl: im.originalUrl,
          alt: im.title,
          title: im.title,
          width: im.width,
          height: im.height,
          creator: im.creator,
          license: im.license,
          sourceUrl: im.sourceUrl,
          sourceTitle: im.title,
          domain: im.domain,
          sourceProvider: im.sourceProvider,
          provider: im.provider || im.sourceProvider
        }));
      } catch {}
    }
  }

  const baseVideos = allowMediaVideos
    ? slicedPublic.flatMap((r) =>
        (r.media?.videos || []).map((v) => ({
          ...v,
          sourceUrl: r.url,
          sourceTitle: r.title,
          domain: r.domain
        }))
      )
    : [];
  const videos = allowMediaVideos ? [...enrichedVideos, ...baseVideos].slice(0, 8) : [];

  const maps =
    rawType === 'maps' || analysis.hasLocalIntent
      ? slicedPublic
          .filter((r) => r.location && Number.isFinite(Number(r.location.lat)) && Number.isFinite(Number(r.location.lon)))
          .map((r) => ({
            title: r.title,
            url: r.url,
            lat: Number(r.location!.lat),
            lon: Number(r.location!.lon),
            address: r.location!.address || r.snippet,
            distanceKm: r.distanceKm
          }))
          .slice(0, 8)
      : [];

  // Phase 9: Grounded July / Gravity AI Overview
  let overview: AiOverviewPayload | null = null;
  if (params.aiOverview !== false) {
    overview = await generateAiOverview({
      query,
      sources: slicedPublic,
      analysis,
      requestedModel: params.aiModel,
      directAnswer,
      abstractText
    });
  }

  const kgHaystacks = [
    retrievalQuery.toLowerCase(),
    (intel.recognizedEntity?.targetDomain || '').toLowerCase(),
    (verifiedRecord?.organizationName || '').toLowerCase()
  ].filter(Boolean);

  const matchedEntity = KG_ENTITIES.find((e) =>
    kgHaystacks.some(
      (h) => h.includes(e.name.toLowerCase()) || e.aliases.some((a) => h.includes(a.toLowerCase()))
    )
  );

  const citations = slicedPublic.slice(0, 6).map((r, idx) => ({
    id: r.id,
    index: idx + 1,
    title: r.title,
    url: r.url,
    domain: r.domain,
    favicon: r.favicon,
    snippet: r.snippet,
    publishedAt: r.publishedAt,
    published_str: r.publishedAt || undefined,
    indexed_str: r.sourceLabel,
    sourceLabel: r.sourceLabel,
    credibility_score: r.scores.authority
  }));

  const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
  systemStats.totalLatenciesMs.push(elapsedMs);
  if (systemStats.totalLatenciesMs.length > 100) systemStats.totalLatenciesMs.shift();

  const partial =
    pendulumMetric.status === 'error' ||
    pendulumMetric.status === 'timeout' ||
    combinedExternalMetric.status === 'error' ||
    combinedExternalMetric.status === 'partial';

  // Build Original vs. Pendulum Enhanced Comparison telemetry for Admin Diagnostics
  const originalCandidatesPool = supplementalResults
    .filter((r) => typeof r.originalRank === 'number' || r.subProvider === 'primary_web_organic' || r.subProvider === 'searxng_web');
  const baselineOriginalList = (originalCandidatesPool.length > 0 ? originalCandidatesPool : supplementalResults).slice(0, 10);

  const originalTop10 = baselineOriginalList.map((r, idx) => ({
    originalRank: r.originalRank || idx + 1,
    title: r.title,
    url: r.url,
    domain: r.domain,
    snippet: r.snippet.slice(0, 220),
    subProvider: r.subProvider || 'knowledge_ia'
  }));

  const origCanonToRank = new Map<string, { originalRank: number; title: string; url: string; domain: string }>();
  for (const o of originalTop10) {
    origCanonToRank.set(normalizeUrl(o.url), {
      originalRank: o.originalRank,
      title: o.title,
      url: o.url,
      domain: o.domain
    });
  }

  const enhancedTop10 = slicedInternal.slice(0, 10).map((r, idx) => {
    const finalRank = idx + 1;
    const origEntry = origCanonToRank.get(r.canonicalUrl) || origCanonToRank.get(normalizeUrl(r.url));
    const originalRank = r.providerRanks.primaryWeb ?? origEntry?.originalRank ?? null;
    const rankDelta = originalRank !== null ? originalRank - finalRank : null;
    const changeType: OriginalVsEnhancedComparison['enhancedTop10'][number]['changeType'] =
      originalRank === null
        ? 'added_by_pendulum'
        : rankDelta! > 0
        ? 'promoted'
        : rankDelta! < 0
        ? 'demoted'
        : 'unchanged';

    const reasons = [
      ...(r._diagnostics?.promotionReasons || []),
      ...(r._diagnostics?.demotionReasons || []).map((d) => `demoted:${d}`)
    ].slice(0, 4);

    return {
      finalRank,
      originalRank,
      rankDelta,
      changeType,
      title: r.title,
      url: r.url,
      domain: r.domain,
      sourceLabel: r.sourceLabel,
      sourceClass: r.sourceClass,
      isOfficialWebsite: Boolean(r.isOfficialWebsite),
      isEnriched: Boolean(r.isEnriched),
      finalScore: r.scores.final,
      reasons
    };
  });

  const enhancedCanonSet = new Set(enhancedTop10.map((e) => normalizeUrl(e.url)));
  const rejectedCanonMap = new Map(enhancerBatch.rejectedPages.map((p) => [normalizeUrl(p.url), p.reason]));

  const gainedResults = enhancedTop10
    .filter((e) => e.originalRank === null || !origCanonToRank.has(normalizeUrl(e.url)))
    .map((e) => ({
      title: e.title,
      url: e.url,
      domain: e.domain,
      finalRank: e.finalRank,
      reason: e.isOfficialWebsite
        ? 'official_website_discovered'
        : e.sourceLabel === 'Pendulum Indexed'
        ? 'pendulum_index_addition'
        : 'enhanced_top10_promotion'
    }));

  const lostResults = originalTop10
    .filter((o) => !enhancedCanonSet.has(normalizeUrl(o.url)))
    .map((o) => {
      const cUrl = normalizeUrl(o.url);
      const rejReason = rejectedCanonMap.get(cUrl);
      const reason = rejReason
        ? `rejected:${rejReason}`
        : deduped.items.some((d) => d.canonicalUrl === cUrl)
        ? 'outranked_below_top10'
        : 'filtered_or_deduplicated';
      return {
        originalRank: o.originalRank,
        title: o.title,
        url: o.url,
        domain: o.domain,
        reason
      };
    });

  // Phase 11: Build Admin-Only Diagnostic Record
  const diagnosticRecord: AdminDiagnosticRecord = {
    timestamp: nowIso(),
    query,
    originalQuery: query,
    primaryProviderQuery: primaryProviderTelemetry.providerQuery || query,
    queryIntelligence: intel,
    executionTimeMs: elapsedMs,
    julyRerankLatencyMs,
    julyRerankApplied: aiReranked,
    primaryProviderTelemetry,
    enhancerTelemetry: {
      attempted: enhancerBatch.attempted,
      enrichedCount: enhancerBatch.enrichedCount,
      rejectedCount: enhancerBatch.rejectedCount,
      rejectedPages: enhancerBatch.rejectedPages,
      skippedReasons: enhancerBatch.skippedReasons,
      latencyMs: enhancerBatch.latencyMs
    },
    providers: {
      pendulum: pendulumMetric,
      supplemental_web: supplementalMetric,
      external_apis: externalMetric,
      ...Object.fromEntries(
        Object.entries(subProviderMetrics).map(([k, v]) => [
          `sub_${k}`,
          { status: v.status === 'ok' ? 'success' : 'error', count: v.count, latencyMs: v.latencyMs } as ProviderStatusMetric
        ])
      )
    },
    deduplication: {
      rawTotal: deduped.rawCount,
      pendulumCandidatesCount: pendulumResults.length,
      primaryOrganicCount: primaryProviderTelemetry.genuineWebUrlCount,
      filteredOutLowQuality: filteredOutCount + deduped.invalidRejected + enhancerBatch.rejectedCount,
      uniqueTotal: ranked.length,
      duplicatesRemoved: deduped.duplicatesRemoved
    },
    comparison: {
      originalQuery: query,
      primaryProviderQuery: primaryProviderTelemetry.providerQuery || query,
      originalTop10,
      enhancedTop10,
      gainedResults,
      lostResults
    },
    results: slicedInternal.map((r, idx) => ({
      rank: idx + 1,
      id: r.id,
      title: r.title,
      url: r.url,
      domain: r.domain,
      sourceLabel: r.sourceLabel,
      finalScore: r.scores.final,
      scores: r.scores,
      diagnostics: r._diagnostics!
    }))
  };

  evaluationMetrics.recordSearch({
    query,
    category: analysis.intentCategory,
    totalLatencyMs: elapsedMs,
    pendulumMetric,
    externalMetric: combinedExternalMetric,
    uniqueCount: ranked.length,
    duplicatesRemoved: deduped.duplicatesRemoved,
    topScore: slicedPublic[0]?.scores.final || 0,
    diagnosticRecord
  });

  evaluationMetrics.recordQualitySample({
    results: slicedPublic,
    isSpecificEntityQuery: Boolean(intel.recognizedEntity?.isSpecificEntityQuery),
    hasOfficialHit: slicedPublic.some((r) => Boolean(r.isOfficialWebsite && (r.officialConfidence || 0) >= 0.62)),
    isAllNonMediaMode: rawType === 'all' && !hasExplicitImageIntent && !hasExplicitVideoIntent,
    mediaImagesCount: images.length,
    mediaVideosCount: videos.length
  });

  const recognizedEntityPayload = intel.recognizedEntity
    ? {
        ...intel.recognizedEntity,
        possibleMatches:
          (officialDiscovery as OfficialDiscoveryBundle | null)?.possibleMatches?.length
            ? (officialDiscovery as OfficialDiscoveryBundle).possibleMatches
            : intel.recognizedEntity.possibleMatches,
        discoveryQueries: (officialDiscovery as OfficialDiscoveryBundle | null)?.discoveryQueries || [],
        verifiedOfficialWebsite:
          verifiedRecord?.isOfficialWebsite
            ? {
                domain: verifiedRecord.domain,
                url: verifiedRecord.url,
                organizationName: verifiedRecord.organizationName,
                confidence: verifiedRecord.confidence,
                verifiedBy: verifiedRecord.verifiedBy
              }
            : undefined
      }
    : undefined;

  const payload: any = {
    engine: 'Pendulum Search',
    company: 'HS AI Solutions',
    founder: 'Harshan Seliyan',
    query,
    correctedQueryHint: intel.correctionApplied ? intel.correctedQuery : undefined,
    mode: rawType,
    type: rawType,
    sort,
    timeRange,
    total: finalRanked.length,
    total_results: finalRanked.length,
    execution_time_ms: elapsedMs,
    partial,
    deduplication: {
      rawTotal: deduped.rawCount,
      uniqueTotal: ranked.length,
      duplicatesRemoved: deduped.duplicatesRemoved,
      duplicatePercentage: deduped.rawCount > 0 ? Math.round((deduped.duplicatesRemoved / deduped.rawCount) * 1000) / 10 : 0
    },
    providers: {
      pendulum: pendulumMetric,
      external: combinedExternalMetric
    },
    ranking: {
      algorithm: 'hybrid_pure_rrf_v2',
      version: '2.0',
      aiReranked
    },
    location: params.location,
    answer: overview?.answer || null,
    overview,
    sources: citations,
    relatedQuestions: overview?.relatedQuestions || [],
    media: {
      images,
      videos,
      maps
    },
    ai_intelligence: overview
      ? {
          model: overview.modelLabel,
          modelChoice: overview.modelUsed,
          query,
          direct_answer: overview.directAnswer || directAnswer,
          summary: overview.answer,
          key_takeaways: overview.keyPoints,
          disagreements: overview.disagreements,
          insufficient_evidence: overview.insufficientEvidence,
          confidence: overview.confidence,
          layout_type: overview.layoutType,
          citations,
          knowledge_graph_card: matchedEntity
            ? {
                entity_id: matchedEntity.entity_id,
                name: matchedEntity.name,
                entity_type: matchedEntity.entity_type,
                description: matchedEntity.description,
                source_url: matchedEntity.source_url,
                relations: KG_RELATIONS.filter((r) => r.source_entity_id === matchedEntity.entity_id)
              }
            : undefined,
          confidence_score: overview.confidence === 'high' ? 0.92 : overview.confidence === 'medium' ? 0.72 : 0.42
        }
      : null,
    geo_metadata: {
      is_geo_query: analysis.hasLocalIntent,
      intent_type: analysis.isNearMe ? 'near_me' : analysis.explicitPlace ? 'place_targeted' : 'general',
      target_place: analysis.explicitPlace?.name || (analysis.hasLocalIntent ? params.location?.city : undefined),
      target_lat: analysis.explicitPlace?.lat || (analysis.hasLocalIntent ? params.location?.lat : undefined),
      target_lon: analysis.explicitPlace?.lon || (analysis.hasLocalIntent ? params.location?.lon : undefined)
    },
    recognized_entity: recognizedEntityPayload,
    attribution: {
      primaryProvider: 'DuckDuckGo',
      enhancementEngine: 'Pendulum Search',
      badgeText: 'Based on DuckDuckGo results · Enhanced by Pendulum',
      mode: primaryProviderTelemetry.hasFullOrganicResults ? 'duckduckgo_organic_plus_pendulum' : 'duckduckgo_ia_plus_pendulum',
      duckduckgoResultsCount: supplementalMetric.count,
      pendulumEnhancedCount:
        enhancerBatch.enrichedCount +
        slicedPublic.filter((r) => r.sourceLabel === 'DuckDuckGo · Pendulum Enhanced').length
    },
    sources_used: [
      ...(supplementalMetric.count > 0 || enabledProviders.has('duckduckgo') ? ['DuckDuckGo (Primary)'] : []),
      ...(pendulumMetric.count > 0 || enhancerBatch.enrichedCount > 0 ? ['Pendulum Enhancement & Index'] : []),
      ...(externalMetric.count > 0 ? ['External Web Sources'] : [])
    ],
    query_intent: analysis.intent,
    is_hybrid: true,
    results: slicedPublic
  };

  if (params.includeDiagnostics) {
    payload.adminDiagnostics = diagnosticRecord;
  }

  if (!params.forceProviderFailure && !params.includeDiagnostics) {
    hybridCache.set(cacheKey, payload);
  }

  return payload;
}

export async function runHybridSearch(params: {
  query: string;
  type?: string;
  mode?: string;
  aiOverview?: boolean;
  aiMode?: string;
  limit?: number;
  page?: number;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  location?: string | GeoLocationContext;
  sort?: SearchSortMode;
  timeRange?: TimeRangeFilter;
  rerank?: boolean;
}) {
  const locObj: GeoLocationContext | undefined =
    typeof params.location === 'object'
      ? params.location
      : params.lat !== undefined || params.lon !== undefined || params.location
      ? {
          city: typeof params.location === 'string' ? params.location : undefined,
          lat: params.lat,
          lon: params.lon,
          enabled: true
        }
      : undefined;

  const modelChoice: AiModelChoice | 'auto' =
    params.aiMode === 'gravity' ? 'gravity' : params.aiMode === 'july' ? 'july' : 'auto';

  return executeHybridEngine({
    query: params.query,
    type: params.type,
    mode: params.mode,
    sort: params.sort || 'relevance',
    timeRange: params.timeRange || 'any',
    limit: params.limit || 20,
    location: locObj,
    aiOverview: params.aiOverview !== false && params.aiMode !== 'none',
    aiModel: modelChoice,
    rerank: params.rerank
  });
}

export async function executeAiStreamSearch(
  params: {
    query: string;
    model?: AiModelChoice | 'auto';
    location?: GeoLocationContext;
    type?: string;
    sort?: SearchSortMode;
    timeRange?: TimeRangeFilter;
    limit?: number;
    conversationContext?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
  callbacks: {
    onSources: (meta: any) => void;
    onDelta: (chunk: string) => void;
    onDone: (finalPayload: any) => void;
  }
) {
  const searchData = await executeHybridEngine({
    query: params.query,
    type: params.type || 'All',
    sort: params.sort || 'relevance',
    timeRange: params.timeRange || 'any',
    limit: Math.min(Math.max(Number(params.limit) || 20, 1), 50),
    location: params.location,
    aiOverview: false,
    aiModel: params.model || 'auto',
    rerank: true
  });

  const analysis = analyzeQuery(params.query, params.location, { type: params.type });
  callbacks.onSources({
    query: params.query,
    correctedQueryHint: searchData.correctedQueryHint,
    query_intent: searchData.query_intent,
    recognized_entity: searchData.recognized_entity,
    attribution: searchData.attribution,
    sources_used: searchData.sources_used,
    results: searchData.results,
    total: searchData.total,
    sources: searchData.sources,
    media: searchData.media,
    providers: searchData.providers,
    deduplication: searchData.deduplication,
    partial: searchData.partial,
    ranking: searchData.ranking,
    geo_metadata: searchData.geo_metadata,
    ai_intelligence: searchData.ai_intelligence,
    timeRange: searchData.timeRange
  });

  const overview = await streamAiOverviewText(
    {
      query: params.query,
      sources: searchData.results,
      analysis,
      requestedModel: params.model,
      directAnswer: evaluateSafeMath(params.query) ? `Direct Computation: ${evaluateSafeMath(params.query)}` : undefined,
      conversationContext: params.conversationContext
    },
    callbacks.onDelta
  );

  callbacks.onDone({
    query: params.query,
    correctedQueryHint: searchData.correctedQueryHint,
    query_intent: searchData.query_intent,
    recognized_entity: searchData.recognized_entity,
    attribution: searchData.attribution,
    sources_used: searchData.sources_used,
    overview: {
      answer: overview.answer,
      directAnswer: overview.directAnswer,
      keyPoints: overview.keyPoints,
      confidence: overview.confidence,
      layoutType: overview.layoutType,
      modelUsed: overview.modelUsed,
      modelLabel: overview.modelLabel,
      disagreements: overview.disagreements,
      insufficientEvidence: overview.insufficientEvidence
    },
    sources: searchData.sources,
    relatedQuestions: overview.relatedQuestions,
    media: searchData.media,
    results: searchData.results,
    total: searchData.total,
    providers: searchData.providers,
    partial: searchData.partial,
    ranking: searchData.ranking,
    timeRange: searchData.timeRange
  });
}

async function prepareFollowupRetrieval(params: {
  query: string;
  followupQuery: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  existingSources?: HybridSearchResult[];
  model?: AiModelChoice | 'auto';
  location?: GeoLocationContext;
  skipCache?: boolean;
}) {
  const rootAnalysis = analyzeQuery(params.query, params.location);
  const contextualized = await contextualizeFollowupQuery({
    rootQuery: params.query,
    followupQuery: params.followupQuery,
    history: params.history,
    entityName: rootAnalysis.recognizedEntity?.name
  });

  const retrievalQuery = contextualized.resolvedQuery || params.followupQuery;
  const freshSearch = await executeHybridEngine({
    query: retrievalQuery,
    limit: 10,
    location: params.location,
    aiOverview: false,
    aiModel: params.model || 'auto',
    rerank: true,
    skipCache: params.skipCache
  });

  const mergedPool = [...freshSearch.results, ...(params.existingSources || [])];
  const deduped = deduplicateResults(
    mergedPool.map((m, idx) => ({
      id: m.id,
      title: m.title,
      url: m.url,
      canonicalUrl: m.canonicalUrl,
      snippet: m.snippet,
      domain: m.domain,
      content: m.content || m.snippet || '',
      headings: m.headings,
      publishedAt: m.publishedAt ?? null,
      updatedAt: m.updatedAt ?? null,
      indexedAt: m.indexedAt ?? null,
      crawledAt: m.crawledAt ?? null,
      source: (Array.isArray(m.sources) && m.sources[0]) || 'pendulum',
      subProvider: Object.keys(m.providerSubRanks || {})[0] || 'followup',
      providerDetail: m.domain || 'Web',
      rank: idx + 1,
      rawScore: m.scores?.final || 0.7,
      resultType: m.resultType,
      category: m.category,
      language: m.language,
      favicon: m.favicon,
      isLive: m.isLive,
      location: m.location,
      isOfficialWebsite: m.isOfficialWebsite,
      isOfficialSubpage: m.isOfficialSubpage,
      officialConfidence: m.officialConfidence,
      officialOrganizationName: m.officialOrganizationName,
      officialVerifiedBy: m.officialVerifiedBy,
      sourceClass: m.sourceClass,
      discoveredSubpageType: m.discoveredSubpageType
    }))
  );

  const analysis = analyzeQuery(retrievalQuery, params.location);
  const { ranked } = rankHybridResults(deduped.items, retrievalQuery, {
    location: params.location,
    intelligence: analysis
  });
  const topSources = ranked.slice(0, 8).map(sanitizePublicResult);
  registerRetrievedSources(topSources);

  const formattedCitations = topSources.map((r, i) => ({
    id: r.id,
    index: i + 1,
    title: r.title,
    url: r.url,
    domain: r.domain,
    favicon: r.favicon,
    snippet: r.snippet,
    publishedAt: r.publishedAt,
    sourceLabel: r.sourceLabel,
    isOfficialWebsite: Boolean(r.isOfficialWebsite),
    sourceClass: r.sourceClass
  }));

  const conversationContext: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: params.query },
    ...(params.history || [])
  ];

  return {
    retrievalQuery,
    usedContextRewrite: contextualized.usedContextRewrite,
    analysis,
    topSources,
    formattedCitations,
    conversationContext,
    freshSearch
  };
}

export async function executeAiFollowup(params: {
  query: string;
  followupQuery: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  existingSources?: HybridSearchResult[];
  model?: AiModelChoice | 'auto';
  location?: GeoLocationContext;
  responseStyle?: FollowupResponseStyle;
  regenerate?: boolean;
}) {
  const prep = await prepareFollowupRetrieval({
    query: params.query,
    followupQuery: params.followupQuery,
    history: params.history,
    existingSources: params.existingSources,
    model: params.model,
    location: params.location,
    skipCache: params.regenerate
  });

  const overview = await generateAiOverview({
    query: params.followupQuery,
    sources: prep.topSources,
    analysis: prep.analysis,
    requestedModel: params.model,
    conversationContext: prep.conversationContext,
    isFollowup: true,
    rootQuery: params.query,
    resolvedSearchQuery: prep.retrievalQuery,
    responseStyle: params.responseStyle
  });

  return {
    query: params.followupQuery,
    originalQuery: params.query,
    resolvedQuery: prep.retrievalQuery,
    usedContextRewrite: prep.usedContextRewrite,
    overview: {
      answer: overview.answer,
      directAnswer: overview.directAnswer,
      keyPoints: overview.keyPoints,
      confidence: overview.confidence,
      layoutType: overview.layoutType,
      modelUsed: overview.modelUsed,
      modelLabel: overview.modelLabel,
      disagreements: overview.disagreements,
      insufficientEvidence: overview.insufficientEvidence
    },
    sources: prep.formattedCitations,
    relatedQuestions: overview.relatedQuestions,
    media: prep.freshSearch.media
  };
}

export async function executeAiFollowupStream(
  params: {
    query: string;
    followupQuery: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    existingSources?: HybridSearchResult[];
    model?: AiModelChoice | 'auto';
    location?: GeoLocationContext;
    responseStyle?: FollowupResponseStyle;
    regenerate?: boolean;
  },
  callbacks: {
    onSources: (meta: any) => void;
    onDelta: (chunk: string) => void;
    onDone: (finalPayload: any) => void;
  }
) {
  const prep = await prepareFollowupRetrieval({
    query: params.query,
    followupQuery: params.followupQuery,
    history: params.history,
    existingSources: params.existingSources,
    model: params.model,
    location: params.location,
    skipCache: params.regenerate
  });

  const resolvedModel = resolveModelChoice(params.model, prep.analysis);
  callbacks.onSources({
    query: params.followupQuery,
    originalQuery: params.query,
    resolvedQuery: prep.retrievalQuery,
    usedContextRewrite: prep.usedContextRewrite,
    sources: prep.formattedCitations,
    modelUsed: resolvedModel.choice,
    modelLabel: resolvedModel.label,
    media: prep.freshSearch.media
  });

  const overview = await streamAiOverviewText(
    {
      query: params.followupQuery,
      sources: prep.topSources,
      analysis: prep.analysis,
      requestedModel: params.model,
      conversationContext: prep.conversationContext,
      isFollowup: true,
      rootQuery: params.query,
      resolvedSearchQuery: prep.retrievalQuery,
      responseStyle: params.responseStyle
    },
    callbacks.onDelta
  );

  callbacks.onDone({
    query: params.followupQuery,
    originalQuery: params.query,
    resolvedQuery: prep.retrievalQuery,
    usedContextRewrite: prep.usedContextRewrite,
    overview: {
      answer: overview.answer,
      directAnswer: overview.directAnswer,
      keyPoints: overview.keyPoints,
      confidence: overview.confidence,
      layoutType: overview.layoutType,
      modelUsed: overview.modelUsed,
      modelLabel: overview.modelLabel,
      disagreements: overview.disagreements,
      insufficientEvidence: overview.insufficientEvidence
    },
    sources: prep.formattedCitations,
    relatedQuestions: overview.relatedQuestions,
    media: prep.freshSearch.media
  });
}

export async function fetchSuggestions(prefix: string): Promise<string[]> {
  const clean = prefix.trim().toLowerCase();
  if (!clean) return [];
  const suggestions: string[] = [];

  for (const doc of pendulumDocs) {
    if (doc.title.toLowerCase().includes(clean) && !suggestions.includes(doc.title)) {
      suggestions.push(doc.title);
    }
  }
  for (const h of searchHistoryLog) {
    if (h.query.toLowerCase().startsWith(clean) && !suggestions.includes(h.query)) {
      suggestions.push(h.query);
    }
  }

  try {
    const res = await fetchWithTimeout(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(prefix)}&limit=6&format=json`,
      {},
      1200
    );
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data?.[1])) {
        for (const s of data[1]) {
          if (typeof s === 'string' && !suggestions.includes(s)) {
            suggestions.push(s);
          }
        }
      }
    }
  } catch {}

  return suggestions.slice(0, 8);
}

export async function crawlUrlNow(targetUrl: string) {
  return crawlUrlAndRecord(targetUrl, { category: 'general', respectPolitenessDelay: false, timeoutMs: 6000 });
}

export async function runAcceptanceSuite() {
  const cases: Array<{ name: string; passed: boolean; details: string }> = [];

  // Core 5 invariants
  const q1 = await executeHybridEngine({ query: 'Quantum computing', aiOverview: true, limit: 10, skipCache: true, includeDiagnostics: true });
  const hasMultipleSources = q1.results.some((r: HybridSearchResult) => r.sources.length > 1 || r.sourceLabel === 'Multiple Sources');
  const uniqueUrls = new Set(q1.results.map((r: HybridSearchResult) => r.canonicalUrl)).size === q1.results.length;
  cases.push({
    name: 'Pendulum + External Merge & Deduplication',
    passed: q1.results.length > 0 && uniqueUrls && q1.providers.pendulum.count > 0,
    details: `Retrieved ${q1.results.length} unique results (deduped ${q1.deduplication.duplicatesRemoved}, multi-source: ${hasMultipleSources})`
  });

  const qLoc = await executeHybridEngine({
    query: 'Tamil Nadu government schemes',
    location: { country: 'India', region: 'Tamil Nadu', city: 'Chennai', lat: 13.0827, lon: 80.2707, enabled: true },
    aiOverview: false,
    limit: 6,
    skipCache: true
  });
  cases.push({
    name: 'Regional Geographic Relevance',
    passed: qLoc.results.length > 0 && qLoc.results[0].scores.geographic >= 0.45,
    details: `Top result: "${qLoc.results[0]?.title}" (geo score: ${qLoc.results[0]?.scores.geographic})`
  });

  const qGlobal = await executeHybridEngine({
    query: 'What is a database?',
    location: { country: 'India', region: 'Tamil Nadu', city: 'Chennai', lat: 13.0827, lon: 80.2707, enabled: true },
    aiOverview: false,
    limit: 5,
    skipCache: true
  });
  cases.push({
    name: 'Global Query Zero Local Distortion',
    passed: qGlobal.results.length > 0 && qGlobal.results[0].scores.geographic === 0 && !qGlobal.geo_metadata.is_geo_query,
    details: `Top result: "${qGlobal.results[0]?.title}" (geo score: ${qGlobal.results[0]?.scores.geographic})`
  });

  const qFail = await executeHybridEngine({
    query: 'Pendulum Search',
    forceProviderFailure: 'duckduckgo',
    aiOverview: true,
    limit: 5,
    skipCache: true
  });
  cases.push({
    name: 'Provider Outage Resilience',
    passed: qFail.partial === true && qFail.providers.external.status !== 'disabled' && qFail.results.length > 0,
    details: `Partial mode active; served ${qFail.results.length} results cleanly without crashing.`
  });

  const qEmpty = await executeHybridEngine({
    query: 'zxqvbnm_nonexistent_xyzzy_9948172',
    providers: ['pendulum'],
    aiOverview: true,
    limit: 5,
    skipCache: true
  });
  cases.push({
    name: 'No-Result Honesty (No Fabricated Citations)',
    passed: qEmpty.results.length === 0 && Boolean(qEmpty.overview?.insufficientEvidence),
    details: `Returned ${qEmpty.results.length} results; insufficientEvidence=${qEmpty.overview?.insufficientEvidence}`
  });

  // Phase 10: Required 10-Query Acceptance Suite with Exact Query Preservation & Pipeline Audit
  const requiredQueries = [
    'RMK Engineering College',
    'RMK College admissions',
    'Anna University',
    'Latest AI research',
    'Python documentation',
    'NVIDIA RTX architecture',
    'How does a search engine work?',
    'Best laptops under ₹70,000',
    'Tamil Nadu government schemes',
    'Quantum computing'
  ];

  const queryReports = await Promise.all(
    requiredQueries.map(async (qText) => {
      const res = await executeHybridEngine({
        query: qText,
        limit: 10,
        aiOverview: false,
        rerank: false,
        skipCache: true,
        includeDiagnostics: true,
        enhancerOptions: { enableLiveFetch: false }
      });
      const diag: AdminDiagnosticRecord | undefined = res.adminDiagnostics;
      const top10: HybridSearchResult[] = res.results || [];
      const wikiCount = top10.filter((r) => (r.domain || '').includes('wikipedia.org')).length;
      const queryPreserved = diag?.primaryProviderQuery === qText;
      const mediaLeaked = (res.media?.images?.length || 0) > 0 || (res.media?.videos?.length || 0) > 0;
      const passed = top10.length > 0 && queryPreserved && !mediaLeaked && wikiCount <= 2;

      return {
        query: qText,
        passed,
        queryPreserved,
        top1Title: top10[0]?.title || null,
        top1Domain: top10[0]?.domain || null,
        totalResults: top10.length,
        wikipediaInTop10: wikiCount,
        primaryStrategy: diag?.primaryProviderTelemetry?.strategyUsed || 'unknown',
        rawOrganicCount: diag?.primaryProviderTelemetry?.rawOrganicCount || 0,
        parsedCount: diag?.primaryProviderTelemetry?.parsedCount || 0,
        pendulumCandidates: diag?.deduplication?.pendulumCandidatesCount || 0,
        duplicatesRemoved: diag?.deduplication?.duplicatesRemoved || 0,
        limitationNotice: diag?.primaryProviderTelemetry?.limitationNotice || null
      };
    })
  );

  for (const qr of queryReports) {
    cases.push({
      name: `Phase 10 Query: ${qr.query}`,
      passed: qr.passed,
      details: `Top1="${qr.top1Title}" (${qr.top1Domain}) | Results=${qr.totalResults}, Wiki=${qr.wikipediaInTop10}, Primary=${qr.primaryStrategy}, QueryPreserved=${qr.queryPreserved}`
    });
  }

  return {
    executedAt: nowIso(),
    passedCount: cases.filter((c) => c.passed).length,
    totalCount: cases.length,
    cases,
    phase10Queries: queryReports
  };
}
