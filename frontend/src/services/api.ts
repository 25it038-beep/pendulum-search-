import { SearchResponse, HybridSearchResponse, SystemMetrics, LiveFeed, SearchMode, SortOrder } from '../types';

const API_BASE = '/api';

export async function searchAPI(
  query: string,
  mode: SearchMode = 'general',
  sort: SortOrder = 'relevance',
  page: number = 1,
  limit: number = 15,
  aiMode: string = 'auto',
  filters?: {
    domainFilter?: string;
    contentTypeFilter?: string;
    languageFilter?: string;
    categoryFilter?: string;
    freshnessFilter?: string;
  },
  geo?: {
    lat?: number;
    lon?: number;
    radiusKm?: number;
    location?: string;
    locationMode?: string;
    rankingMode?: string;
  }
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    mode,
    sort,
    page: page.toString(),
    limit: limit.toString(),
    ai_mode: aiMode
  });
  if (filters?.domainFilter) params.set('domain_filter', filters.domainFilter);
  if (filters?.contentTypeFilter) params.set('content_type_filter', filters.contentTypeFilter);
  if (filters?.languageFilter) params.set('language_filter', filters.languageFilter);
  if (filters?.categoryFilter) params.set('category_filter', filters.categoryFilter);
  if (filters?.freshnessFilter) params.set('freshness_filter', filters.freshnessFilter);

  // Geolocation parameters
  if (geo?.lat !== undefined && geo?.lon !== undefined) {
    params.set('lat', geo.lat.toString());
    params.set('lon', geo.lon.toString());
  }
  if (geo?.radiusKm !== undefined) params.set('radius_km', geo.radiusKm.toString());
  if (geo?.location) params.set('location', geo.location);
  if (geo?.locationMode) params.set('location_mode', geo.locationMode);
  if (geo?.rankingMode) params.set('ranking_mode', geo.rankingMode);
  params.set('use_hybrid', 'true');

  const res = await fetch(`${API_BASE}/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Search failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function hybridSearchAPI(
  query: string,
  mode: SearchMode = 'general',
  sort: SortOrder = 'relevance',
  page: number = 1,
  limit: number = 15,
  aiMode: string = 'auto',
  filters?: {
    domainFilter?: string;
    contentTypeFilter?: string;
    languageFilter?: string;
    categoryFilter?: string;
    freshnessFilter?: string;
  },
  geo?: {
    lat?: number;
    lon?: number;
    radiusKm?: number;
    location?: string;
    locationMode?: string;
    rankingMode?: string;
  }
): Promise<HybridSearchResponse> {
  const result = await searchAPI(query, mode, sort, page, limit, aiMode, filters, geo);
  return result as HybridSearchResponse;
}

export function streamSearchAPI(
  query: string,
  options?: {
    mode?: string;
    ai_mode?: string;
    lat?: number;
    lon?: number;
    location?: string;
    radius_km?: number;
  }
): EventSource | null {
  if (typeof window === 'undefined' || !window.EventSource) return null;
  const params = new URLSearchParams({ q: query });
  if (options?.mode) params.set('mode', options.mode);
  if (options?.ai_mode) params.set('ai_mode', options.ai_mode);
  if (options?.lat !== undefined && options?.lon !== undefined) {
    params.set('lat', options.lat.toString());
    params.set('lon', options.lon.toString());
  }
  if (options?.location) params.set('location', options.location);
  if (options?.radius_km) params.set('radius_km', options.radius_km.toString());

  return new EventSource(`${API_BASE}/search/stream?${params.toString()}`);
}

export async function fetchSuggestionsAPI(prefix: string): Promise<string[]> {
  if (!prefix || prefix.trim().length === 0) return [];
  try {
    const res = await fetch(`${API_BASE}/suggestions?q=${encodeURIComponent(prefix)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.suggestions || [];
  } catch {
    return [];
  }
}

export async function fetchResearchAPI(query: string): Promise<any> {
  const res = await fetch(`${API_BASE}/research?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Research failed');
  return res.json();
}

export async function fetchMetricsAPI(): Promise<{ status: string; metrics: SystemMetrics; crawler_running: boolean; live_monitor_running: boolean }> {
  const res = await fetch(`${API_BASE}/monitor/metrics`);
  if (!res.ok) throw new Error('Failed to load metrics');
  return res.json();
}

export async function fetchFeedsAPI(): Promise<{ total_active_feeds: number; feeds: LiveFeed[] }> {
  const res = await fetch(`${API_BASE}/live/feeds`);
  if (!res.ok) throw new Error('Failed to fetch feeds');
  return res.json();
}

export async function addFeedAPI(payload: { name: string; feed_url: string; priority_level: string; interval_sec: number; category: string }): Promise<any> {
  const res = await fetch(`${API_BASE}/live/feeds/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function fetchLiveStreamAPI(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}/live/stream`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

export async function seedCrawlerAPI(urls: string[], priority: number = 3): Promise<any> {
  const res = await fetch(`${API_BASE}/crawler/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, priority })
  });
  return res.json();
}

export async function crawlNowAPI(url: string): Promise<any> {
  const res = await fetch(`${API_BASE}/crawler/crawl-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  return res.json();
}

export async function toggleCrawlerAPI(start: boolean): Promise<any> {
  const endpoint = start ? `${API_BASE}/crawler/start` : `${API_BASE}/crawler/stop`;
  const res = await fetch(endpoint, { method: 'POST' });
  return res.json();
}

export async function fetchSourcesAPI(): Promise<{ total_sources: number; sources: any[]; manager_stats: any }> {
  const res = await fetch(`${API_BASE}/acquisition/sources`);
  if (!res.ok) throw new Error('Failed to fetch sources');
  return res.json();
}

export async function triggerConnectorAPI(connector: string, limit: number = 10): Promise<any> {
  const res = await fetch(`${API_BASE}/acquisition/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connector, limit })
  });
  return res.json();
}

export async function fetchDiscoveryGapsAPI(): Promise<{ total_gaps: number; gaps: any[] }> {
  const res = await fetch(`${API_BASE}/discovery/gaps`);
  if (!res.ok) throw new Error('Failed to fetch discovery gaps');
  return res.json();
}

export async function fetchCoverageAPI(): Promise<{ categories: Record<string, number>; total_documents: number }> {
  const res = await fetch(`${API_BASE}/discovery/coverage`);
  if (!res.ok) throw new Error('Failed to fetch knowledge coverage');
  return res.json();
}

export async function fetchSystemHealthAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/health`);
  if (!res.ok) throw new Error('Failed to fetch system health');
  return res.json();
}

export async function triggerBackupAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/system/backup`, { method: 'POST' });
  return res.json();
}

export async function fetchKnowledgeEntityAPI(name: string): Promise<any> {
  const res = await fetch(`${API_BASE}/knowledge/entity/${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  return res.json();
}

// HS MegaCrawler API Methods
export async function fetchMegaCrawlerEcosystem(): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/ecosystem`);
  if (!res.ok) throw new Error('Failed to fetch MegaCrawler ecosystem');
  return res.json();
}

export async function fetchMegaCrawlerWorkers(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/megacrawler/workers`);
  if (!res.ok) throw new Error('Failed to fetch MegaCrawler workers');
  return res.json();
}

export async function controlMegaCrawlerAPI(
  crawlerType: string,
  action: 'pause' | 'resume' | 'concurrency',
  concurrencyLimit?: number
): Promise<any> {
  let url = `${API_BASE}/megacrawler/control?crawler_type=${encodeURIComponent(crawlerType)}&action=${action}`;
  if (concurrencyLimit) {
    url += `&concurrency_limit=${concurrencyLimit}`;
  }
  const res = await fetch(url, { method: 'POST' });
  return res.json();
}

export async function runMegaCrawlerBenchmarkAPI(durationSec: number = 5): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/benchmark?duration_sec=${durationSec}`);
  if (!res.ok) throw new Error('Failed to run MegaCrawler benchmark');
  return res.json();
}

export async function fetchMegaCrawlerScalingAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/scaling`);
  if (!res.ok) throw new Error('Failed to fetch MegaCrawler scaling');
  return res.json();
}

export async function submitJulyCrawlRequestAPI(payload: {
  query: string;
  suggested_urls?: string[];
  target_domains?: string[];
  urgency?: string;
  reason: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/request-crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}


export async function fetchMegaCrawlerFrontierAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/frontier`);
  if (!res.ok) throw new Error('Failed to fetch frontier');
  return res.json();
}

export async function enqueueMegaCrawlerURLAPI(payload: {
  url: string;
  crawler_type?: string;
  priority?: number;
  depth?: number;
  discovery_source?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/frontier/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function fetchMegaCrawlerDiscoveryAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/discovery`);
  if (!res.ok) throw new Error('Failed to fetch discovery metrics');
  return res.json();
}

export async function submitIndexNowAPI(payload: {
  host: string;
  urlList: string[];
  key?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/indexnow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function fetchMegaCrawlerStorageAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/storage`);
  if (!res.ok) throw new Error('Failed to fetch storage stats');
  return res.json();
}

export async function fetchMegaCrawlerOptimizerAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/optimizer`);
  if (!res.ok) throw new Error('Failed to fetch optimizer report');
  return res.json();
}

export async function triggerMegaCrawlerTuneAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/optimizer/tune`, {
    method: 'POST'
  });
  return res.json();
}

export async function submitJulyUnifiedSearchAPI(payload: {
  query: string;
  mode: string;
  max_results?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/megacrawler/july-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

// ==============================================================================
// HS SEARCH - Global Geolocation Intelligence API Services
// ==============================================================================

export async function detectLocationAPI(): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/geo/detect`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchLocationAutocompleteAPI(prefix: string): Promise<any[]> {
  if (!prefix || prefix.trim().length === 0) return [];
  try {
    const res = await fetch(`${API_BASE}/geo/autocomplete?q=${encodeURIComponent(prefix)}&limit=8`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.suggestions || [];
  } catch {
    return [];
  }
}

export async function geocodePlaceAPI(placeName: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/geo/geocode?q=${encodeURIComponent(placeName)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function reverseGeocodeAPI(lat: number, lon: number): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/geo/reverse?lat=${lat}&lon=${lon}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchGeoHierarchyAPI(params?: {
  continent?: string;
  countryCode?: string;
  state?: string;
  city?: string;
}): Promise<any> {
  const queryParams = new URLSearchParams();
  if (params?.continent) queryParams.set('continent', params.continent);
  if (params?.countryCode) queryParams.set('country_code', params.countryCode);
  if (params?.state) queryParams.set('state', params.state);
  if (params?.city) queryParams.set('city', params.city);

  const res = await fetch(`${API_BASE}/geo/hierarchy?${queryParams.toString()}`);
  if (!res.ok) throw new Error('Failed to load hierarchy');
  return res.json();
}

export async function fetchNearbyAPI(
  lat: number,
  lon: number,
  radiusKm: number = 25.0,
  category?: string
): Promise<any> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    radius_km: radiusKm.toString()
  });
  if (category) params.set('category', category);

  const res = await fetch(`${API_BASE}/geo/nearby?${params.toString()}`);
  if (!res.ok) throw new Error('Nearby retrieval failed');
  return res.json();
}

export async function fetchLocalDiscoveryAPI(params: {
  city?: string;
  lat?: number;
  lon?: number;
  category?: string;
  radiusKm?: number;
  q?: string;
}): Promise<any> {
  const queryParams = new URLSearchParams();
  if (params.city) queryParams.set('city', params.city);
  if (params.lat !== undefined) queryParams.set('lat', params.lat.toString());
  if (params.lon !== undefined) queryParams.set('lon', params.lon.toString());
  if (params.category) queryParams.set('category', params.category);
  if (params.radiusKm !== undefined) queryParams.set('radius_km', params.radiusKm.toString());
  if (params.q) queryParams.set('q', params.q);

  const res = await fetch(`${API_BASE}/geo/local-discovery?${queryParams.toString()}`);
  if (!res.ok) throw new Error('Local discovery query failed');
  return res.json();
}

export async function fetchLiveLocalAPI(city: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/geo/live-local?city=${encodeURIComponent(city)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function updateLocationPreferenceAPI(data: any): Promise<any> {
  const res = await fetch(`${API_BASE}/geo/preference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function sendJulyCloudChatAPI(
  messages: Array<{ role: string; content: string }>,
  model: string = 'july-lite'
): Promise<any> {
  const res = await fetch(`${API_BASE}/july/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model,
      stream: false
    })
  });
  if (!res.ok) throw new Error(`July Cloud chat failed: HTTP ${res.status}`);
  return res.json();
}

export async function* streamJulyCloudChatAPI(
  messages: Array<{ role: string; content: string }>,
  model: string = 'july-lite',
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${API_BASE}/july/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model,
      stream: true
    }),
    signal
  });

  if (!res.ok) throw new Error(`Streaming failed: HTTP ${res.status}`);
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {}
      }
    }
  }
}

// Private AI Inference Gateway & Multi-Source Provider APIs (Admin)
export async function fetchAdminGatewayHealthAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/gateway/health`);
  if (!res.ok) throw new Error('Failed to load gateway health');
  return res.json();
}

export async function fetchAdminGatewayStatsAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/gateway/stats`);
  if (!res.ok) throw new Error('Failed to load gateway stats');
  return res.json();
}

export async function testAdminGatewayInferenceAPI(tier: string, prompt: string): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/gateway/test-inference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, prompt })
  });
  if (!res.ok) throw new Error('Inference test probe failed');
  return res.json();
}

export async function fetchAdminQualityDashboardAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/quality-dashboard`);
  if (!res.ok) throw new Error('Failed to load IR quality dashboard');
  return res.json();
}

export async function fetchAdminDiagnosticsAPI(query?: string): Promise<any> {
  const url = query && query.trim()
    ? `${API_BASE}/admin/diagnostics?q=${encodeURIComponent(query.trim())}`
    : `${API_BASE}/admin/diagnostics`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load search diagnostics');
  return res.json();
}

// =============================================================================
// Unified Pendulum Search Client APIs (SSE AI Search, Hybrid, Media, Maps, Eval)
// =============================================================================
import type {
  AiFollowupStyle,
  AiModelSelection,
  PendulumDirections,
  PendulumFollowupResponse,
  PendulumImageItem,
  PendulumMapPlace,
  PendulumSort,
  PendulumUnifiedResponse,
  PendulumUserSettings,
  PendulumVideoItem,
  TimeRangeFilter
} from '../types';

function buildLocationPayload(settings?: Partial<PendulumUserSettings>) {
  if (!settings) return { enabled: true };
  if (!settings.locationEnabled) return { enabled: false };
  return {
    city: settings.city || 'Chennai',
    country: settings.country || 'India',
    lat: settings.lat,
    lon: settings.lon,
    enabled: true
  };
}

export async function streamAiSearchSSE(
  params: {
    query: string;
    model?: AiModelSelection;
    type?: string;
    sort?: PendulumSort;
    timeRange?: TimeRangeFilter;
    limit?: number;
    settings?: Partial<PendulumUserSettings>;
  },
  callbacks: {
    onSources: (meta: Partial<PendulumUnifiedResponse>) => void;
    onDelta: (delta: string) => void;
    onDone: (finalPayload: Partial<PendulumUnifiedResponse>) => void;
  },
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify({
      query: params.query,
      model: params.model || params.settings?.aiModel || 'auto',
      type: params.type || 'All',
      sort: params.sort || 'relevance',
      timeRange: params.timeRange || 'any',
      limit: params.limit || params.settings?.limit || 20,
      location: buildLocationPayload(params.settings),
      stream: true
    }),
    signal
  });

  if (!res.ok) {
    let errDetail = `Search failed (HTTP ${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.detail || errJson?.error) errDetail = errJson.detail || errJson.error;
    } catch {}
    throw new Error(errDetail);
  }
  if (!res.body) {
    throw new Error('Streaming response body unavailable');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchFrame = (rawFrame: string) => {
    const lines = rawFrame.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;

    const rawData = dataLines.join('\n');
    try {
      const parsed = JSON.parse(rawData);
      if (eventName === 'sources') {
        callbacks.onSources(parsed);
      } else if (eventName === 'delta' && typeof parsed.delta === 'string') {
        callbacks.onDelta(parsed.delta);
      } else if (eventName === 'done') {
        callbacks.onDone(parsed);
      }
    } catch {}
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    for (const frame of frames) {
      if (frame.trim()) dispatchFrame(frame);
    }
  }
  if (buffer.trim()) {
    dispatchFrame(buffer);
  }
}

export async function postHybridSearchAPI(
  params: {
    query: string;
    type?: string;
    sort?: PendulumSort;
    timeRange?: TimeRangeFilter;
    limit?: number;
    aiOverview?: boolean;
    model?: AiModelSelection;
    settings?: Partial<PendulumUserSettings>;
  },
  signal?: AbortSignal
): Promise<PendulumUnifiedResponse> {
  const res = await fetch(`${API_BASE}/search/hybrid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: params.query,
      location: buildLocationPayload(params.settings),
      options: {
        type: params.type || 'All',
        sort: params.sort || 'relevance',
        timeRange: params.timeRange || 'any',
        limit: params.limit || params.settings?.limit || 20,
        safeSearch: params.settings?.safeSearch !== false,
        aiOverview: params.aiOverview ?? false,
        model: params.model || params.settings?.aiModel || 'auto'
      }
    }),
    signal
  });
  if (!res.ok) {
    let errDetail = `Search failed (HTTP ${res.status})`;
    try {
      const e = await res.json();
      if (e?.detail || e?.error) errDetail = e.detail || e.error;
    } catch {}
    throw new Error(errDetail);
  }
  return res.json();
}

export async function postAiFollowupAPI(
  params: {
    query: string;
    followupQuery: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    existingSources?: any[];
    model?: AiModelSelection;
    responseStyle?: AiFollowupStyle;
    regenerate?: boolean;
    settings?: Partial<PendulumUserSettings>;
  },
  signal?: AbortSignal
): Promise<PendulumFollowupResponse> {
  const res = await fetch(`${API_BASE}/ai/followup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: params.query,
      followupQuery: params.followupQuery,
      history: params.history || [],
      existingSources: params.existingSources || [],
      model: params.model || params.settings?.aiModel || 'auto',
      responseStyle: params.responseStyle || 'auto',
      regenerate: Boolean(params.regenerate),
      location: buildLocationPayload(params.settings)
    }),
    signal
  });
  if (!res.ok) {
    let errDetail = `Follow-up request failed (HTTP ${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.detail || errJson?.error) errDetail = errJson.detail || errJson.error;
    } catch {}
    throw new Error(errDetail);
  }
  return res.json();
}

export async function streamAiFollowupSSE(
  params: {
    query: string;
    followupQuery: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    existingSources?: any[];
    model?: AiModelSelection;
    responseStyle?: AiFollowupStyle;
    regenerate?: boolean;
    settings?: Partial<PendulumUserSettings>;
  },
  callbacks: {
    onSources: (meta: Partial<PendulumFollowupResponse>) => void;
    onDelta: (delta: string) => void;
    onDone: (finalPayload: PendulumFollowupResponse) => void;
  },
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/followup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify({
      query: params.query,
      followupQuery: params.followupQuery,
      history: params.history || [],
      existingSources: params.existingSources || [],
      model: params.model || params.settings?.aiModel || 'auto',
      responseStyle: params.responseStyle || 'auto',
      regenerate: Boolean(params.regenerate),
      location: buildLocationPayload(params.settings),
      stream: true
    }),
    signal
  });

  if (!res.ok) {
    let errDetail = `Follow-up stream failed (HTTP ${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.detail || errJson?.error) errDetail = errJson.detail || errJson.error;
    } catch {}
    throw new Error(errDetail);
  }
  if (!res.body) {
    throw new Error('Streaming response body unavailable');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchFrame = (rawFrame: string) => {
    const lines = rawFrame.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;

    const rawData = dataLines.join('\n');
    let parsed: any;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return;
    }

    if (eventName === 'error') {
      throw new Error(parsed?.detail || 'Follow-up stream error');
    } else if (eventName === 'sources') {
      callbacks.onSources(parsed);
    } else if (eventName === 'delta' && typeof parsed.delta === 'string') {
      callbacks.onDelta(parsed.delta);
    } else if (eventName === 'done') {
      callbacks.onDone(parsed);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    for (const frame of frames) {
      if (frame.trim()) dispatchFrame(frame);
    }
  }
  if (buffer.trim()) {
    dispatchFrame(buffer);
  }
}

export async function postAiOverviewAPI(
  params: {
    query: string;
    type?: string;
    model?: AiModelSelection;
    regenerate?: boolean;
    settings?: Partial<PendulumUserSettings>;
  },
  signal?: AbortSignal
): Promise<any> {
  const res = await fetch(`${API_BASE}/ai/overview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: params.query,
      type: params.type || 'All',
      model: params.model || params.settings?.aiModel || 'auto',
      regenerate: Boolean(params.regenerate),
      location: buildLocationPayload(params.settings)
    }),
    signal
  });
  if (!res.ok) throw new Error(`Overview generation failed (HTTP ${res.status})`);
  return res.json();
}

export async function searchVideosAPI(
  query: string,
  limit: number = 16,
  signal?: AbortSignal
): Promise<{ query: string; total: number; partial?: boolean; errors?: string[]; results: PendulumVideoItem[] }> {
  const res = await fetch(`${API_BASE}/videos/search?q=${encodeURIComponent(query)}&limit=${limit}`, { signal });
  if (!res.ok) throw new Error(`Video search failed (HTTP ${res.status})`);
  return res.json();
}

export async function searchImagesAPI(
  query: string,
  opts?: { limit?: number; license?: string; orientation?: string; source?: string },
  signal?: AbortSignal
): Promise<{
  query: string;
  total: number;
  partial?: boolean;
  errors?: string[];
  attribution?: { primaryProvider?: string; enhancedBy?: string };
  results: PendulumImageItem[];
}> {
  const params = new URLSearchParams({
    q: query,
    limit: String(opts?.limit || 24),
    license: opts?.license || 'all',
    orientation: opts?.orientation || 'all',
    source: opts?.source || 'all'
  });
  const res = await fetch(`${API_BASE}/images/search?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Image search failed (HTTP ${res.status})`);
  return res.json();
}

export async function getMapConfigAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/maps/config`);
  if (!res.ok) throw new Error('Failed to load map tile config');
  return res.json();
}

export async function searchMapsAPI(
  query: string,
  limit: number = 12,
  signal?: AbortSignal
): Promise<{ query: string; total: number; error?: string; results: PendulumMapPlace[] }> {
  const res = await fetch(`${API_BASE}/maps/search?q=${encodeURIComponent(query)}&limit=${limit}`, { signal });
  if (!res.ok) throw new Error(`Map search failed (HTTP ${res.status})`);
  return res.json();
}

export async function searchNearbyMapsAPI(
  lat: number,
  lon: number,
  type: string = 'restaurant',
  radius: number = 4000,
  signal?: AbortSignal
): Promise<{ center: { lat: number; lon: number }; type: string; total: number; error?: string; results: PendulumMapPlace[] }> {
  const res = await fetch(
    `${API_BASE}/maps/nearby?lat=${lat}&lon=${lon}&type=${encodeURIComponent(type)}&radius=${radius}`,
    { signal }
  );
  if (!res.ok) throw new Error(`Nearby search failed (HTTP ${res.status})`);
  return res.json();
}

export async function getDirectionsAPI(
  params: { fromLat: number; fromLon: number; toLat: number; toLon: number; mode?: 'driving' | 'foot' | 'bike' },
  signal?: AbortSignal
): Promise<PendulumDirections> {
  const q = new URLSearchParams({
    fromLat: String(params.fromLat),
    fromLon: String(params.fromLon),
    toLat: String(params.toLat),
    toLon: String(params.toLon),
    mode: params.mode || 'driving'
  });
  const res = await fetch(`${API_BASE}/maps/directions?${q.toString()}`, { signal });
  if (!res.ok) throw new Error(`Directions request failed (HTTP ${res.status})`);
  return res.json();
}

export async function detectGeoAPI(): Promise<{
  country_name?: string;
  country_code?: string;
  state?: string;
  city?: string;
  locality?: string;
  lat?: number;
  lon?: number;
}> {
  const res = await fetch(`${API_BASE}/geo/detect`);
  if (!res.ok) throw new Error('Geo detection failed');
  return res.json();
}

export async function fetchEvalMetricsAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/eval/metrics`);
  if (!res.ok) throw new Error('Failed to load evaluation metrics');
  return res.json();
}

export async function runAcceptanceAPI(): Promise<any> {
  const res = await fetch(`${API_BASE}/eval/acceptance`);
  if (!res.ok) throw new Error('Failed to run acceptance suite');
  return res.json();
}

export async function trackClickAPI(category: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/metrics/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category })
    });
  } catch {}
}

export async function sendFeedbackAPI(helpful: boolean): Promise<void> {
  try {
    await fetch(`${API_BASE}/metrics/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ helpful })
    });
  } catch {}
}

export async function fetchUserWorkspaceAPI(token: string): Promise<{
  user: { id: number; uid: string; email: string; displayName?: string | null; photoUrl?: string | null };
  preferences: {
    aiOverview: boolean;
    aiModel: string;
    resultLimit: number;
    safeSearch: boolean;
    locationEnabled: boolean;
    city: string;
    country: string;
  } | null;
  history: Array<{ id: number; query: string; category: string; createdAt: string }>;
  saved: Array<{ id: number; url: string; title: string; snippet: string; domain: string; category: string; createdAt: string }>;
}> {
  const res = await fetch(`${API_BASE}/user/workspace`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Unable to load your workspace');
  return res.json();
}

export async function saveUserPreferencesAPI(
  token: string,
  prefs: {
    aiOverview: boolean;
    aiModel: string;
    limit: number;
    safeSearch: boolean;
    locationEnabled: boolean;
    city: string;
    country: string;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/user/preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(prefs)
  });
  if (!res.ok) throw new Error('Unable to save preferences');
}

export async function recordUserHistoryAPI(token: string, query: string, category: string): Promise<void> {
  const res = await fetch(`${API_BASE}/user/history`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, category })
  });
  if (!res.ok) throw new Error('Unable to save search history');
}

export async function clearUserHistoryAPI(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/user/history`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Unable to clear search history');
}

export async function saveSearchResultAPI(
  token: string,
  item: { url: string; title: string; snippet?: string; domain?: string; category?: string }
): Promise<{ saved: { id: number; url: string; title: string; snippet: string; domain: string; category: string; createdAt: string } }> {
  const res = await fetch(`${API_BASE}/user/saved`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(item)
  });
  if (!res.ok) throw new Error('Unable to bookmark result');
  return res.json();
}

export async function removeSavedResultAPI(token: string, url: string): Promise<void> {
  const res = await fetch(`${API_BASE}/user/saved`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error('Unable to remove bookmark');
}



