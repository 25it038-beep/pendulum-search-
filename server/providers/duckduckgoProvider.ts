import { PrimaryProviderTelemetry, ProviderRawResult, QueryIntelligence, ResultType } from '../types';
import {
  fetchAcademicWeb,
  fetchDeveloperDocsAndPackages,
  fetchDirectoryAndInstitutionalWeb,
  fetchLiveJournalismFeeds,
  fetchWikipediaSecondary
} from './webProviders';
import { ingestRssArticleAsCrawledDoc } from '../crawler/crawlerEngine';

export interface DuckDuckGoSearchResponse {
  results: ProviderRawResult[];
  directAnswer?: string;
  abstractText?: string;
  engineLabel: string;
  partial: boolean;
  error?: string;
  telemetry?: PrimaryProviderTelemetry;
}

export interface DuckDuckGoProvider {
  readonly name: string;
  search(
    query: string,
    options?: {
      limit?: number;
      safeSearch?: boolean;
      timeoutMs?: number;
      regionCode?: string;
      language?: string;
    }
  ): Promise<DuckDuckGoSearchResponse>;
}

export function isBlockedHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (!['http:', 'https:'].includes(u.protocol)) return true;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 3500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'PendulumSearchBot/2.1 (+https://hsaisolutions.com)',
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function domainOf(urlStr: string, fallback = 'web.source'): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return fallback;
  }
}

function faviconFor(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export interface RawOrganicCandidateInput {
  title?: string;
  url?: string;
  snippet?: string;
  content?: string;
  publishedDate?: string | null;
  category?: string;
  score?: number;
  language?: string;
}

const AD_OR_TRACKING_HOST_RE = /(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google|taboola\.com|outbrain\.com)/i;
const MEDIA_ONLY_EXT_RE = /\.(jpe?g|png|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav)(\?.*)?$/i;

function unwrapSafeRedirectUrl(rawUrl: string): { url: string; wasRejectedRedirect: boolean } {
  try {
    const u = new URL(rawUrl.trim());
    if (u.hostname.toLowerCase().endsWith('duckduckgo.com') && u.pathname === '/l/') {
      const target = u.searchParams.get('uddg');
      if (target && /^https?:\/\//i.test(target) && !isBlockedHost(target)) {
        return { url: target, wasRejectedRedirect: false };
      }
      return { url: rawUrl, wasRejectedRedirect: true };
    }
    return { url: u.toString(), wasRejectedRedirect: false };
  } catch {
    return { url: rawUrl, wasRejectedRedirect: false };
  }
}

/**
 * Strict Primary Organic Result Parser & Validator.
 * Tracks every raw organic item, validates scheme/host/title/non-ad/non-media/dedupe,
 * preserves `originalRank` (1-indexed raw position), and records explicit rejection reasons.
 */
export function parseAndValidateOrganicItems(
  rawItems: RawOrganicCandidateInput[],
  options: { limit?: number; subProvider?: string } = {}
): {
  parsed: ProviderRawResult[];
  rawOrganicCount: number;
  parsedCount: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
  genuineWebUrlCount: number;
} {
  const limit = Math.min(options.limit || 25, 40);
  const subProvider = options.subProvider || 'primary_web_organic';
  const parsed: ProviderRawResult[] = [];
  const rejectionReasons: Record<string, number> = {};
  const seenUrls = new Set<string>();
  let rejectedCount = 0;

  const reject = (reason: string) => {
    rejectedCount += 1;
    rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
  };

  for (let i = 0; i < rawItems.length && parsed.length < limit; i++) {
    const raw = rawItems[i];
    const rawUrl = String(raw?.url || '').trim();
    if (!rawUrl) {
      reject('missing_url');
      continue;
    }

    const unwrapped = unwrapSafeRedirectUrl(rawUrl);
    if (unwrapped.wasRejectedRedirect) {
      reject('ad_or_invalid_redirect');
      continue;
    }

    const candidateUrl = unwrapped.url;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(candidateUrl);
    } catch {
      reject('invalid_url_syntax');
      continue;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      reject('invalid_scheme');
      continue;
    }

    if (!parsedUrl.hostname || !parsedUrl.hostname.includes('.') || isBlockedHost(candidateUrl)) {
      reject('blocked_host');
      continue;
    }

    const dom = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
    if (AD_OR_TRACKING_HOST_RE.test(dom) || (dom.endsWith('duckduckgo.com') && parsedUrl.pathname !== '/')) {
      reject('ad_or_provider_internal_url');
      continue;
    }

    if (MEDIA_ONLY_EXT_RE.test(parsedUrl.pathname)) {
      reject('media_file_in_web_stream');
      continue;
    }

    const title = stripHtml(String(raw?.title || '')).trim();
    if (!title || title.length < 2) {
      reject('missing_title');
      continue;
    }

    const canonicalKey = `${dom}${parsedUrl.pathname.replace(/\/+$/, '') || '/'}${parsedUrl.search}`.toLowerCase();
    if (seenUrls.has(canonicalKey)) {
      reject('duplicate_url');
      continue;
    }
    seenUrls.add(canonicalKey);

    const originalRank = i + 1;
    const rawContent = stripHtml(String(raw?.content || raw?.snippet || '')).trim();
    const snippet = rawContent.slice(0, 420);

    parsed.push({
      id: `ext-primary-${originalRank}-${Buffer.from(candidateUrl).toString('base64').slice(0, 10)}`,
      title,
      url: candidateUrl,
      canonicalUrl: candidateUrl,
      snippet,
      domain: dom,
      content: rawContent,
      publishedAt: raw?.publishedDate || null,
      indexedAt: new Date().toISOString(),
      source: 'external',
      subProvider,
      providerDetail: 'DuckDuckGo',
      providerType: 'primary_web_search',
      rank: originalRank,
      originalRank,
      rawScore: typeof raw?.score === 'number' ? Math.min(1, Math.max(0.2, raw.score / 10)) : Math.max(0.45, 0.96 - (originalRank - 1) * 0.03),
      resultType: 'web',
      category: raw?.category || 'general',
      language: raw?.language || 'en',
      favicon: faviconFor(dom)
    });
  }

  return {
    parsed,
    rawOrganicCount: rawItems.length,
    parsedCount: parsed.length,
    rejectedCount,
    rejectionReasons,
    genuineWebUrlCount: parsed.length
  };
}

export const INSTANT_ANSWER_LIMITATION_NOTICE =
  'Full organic web search requires SEARXNG_URL (e.g. DuckDuckGo engine enabled) or an authorized search API key (BRAVE_SEARCH_API_KEY / SERPER_API_KEY). https://api.duckduckgo.com/ only returns Instant Answer encyclopedic abstracts/related topics, not full organic web results.';

/**
 * Primary Web Search & Instant Knowledge Adapter:
 * Passes the exact original user query untouched (only URL-encoded + supported regional/safe params):
 * 1) If SEARXNG_URL is configured by the operator, queries self-hosted SearXNG JSON API (optionally SEARXNG_ENGINES=duckduckgo).
 * 2) If BRAVE_SEARCH_API_KEY or SERPER_API_KEY is configured, queries the official authorized JSON search API.
 * 3) Queries documented DuckDuckGo Instant Answer API strictly as encyclopedic/direct-answer supplement (`knowledge_ia`),
 *    NEVER misrepresenting Instant Answer abstracts as full organic web results.
 */
export class PermittedDuckDuckGoProvider implements DuckDuckGoProvider {
  readonly name = 'DuckDuckGo';

  async search(
    query: string,
    options: {
      limit?: number;
      safeSearch?: boolean;
      timeoutMs?: number;
      regionCode?: string;
      language?: string;
    } = {}
  ): Promise<DuckDuckGoSearchResponse> {
    const t0 = performance.now();
    const limit = Math.min(options.limit || 25, 40);
    const timeoutMs = options.timeoutMs || 3400;
    const exactQuery = query; // Preserve exact original query — never rewrite or append keywords
    const results: ProviderRawResult[] = [];
    let directAnswer: string | undefined;
    let abstractText: string | undefined;
    let engineLabel = 'DuckDuckGo (Primary Web Search)';
    let partial = false;
    const errors: string[] = [];

    let strategyUsed: PrimaryProviderTelemetry['strategyUsed'] = 'instant_answer_fallback';
    let rawStatus: number | null = null;
    let contentType: string | null = null;
    let rawOrganicCount = 0;
    let parsedCount = 0;
    let rejectedCount = 0;
    let rejectionReasons: Record<string, number> = {};
    let genuineWebUrlCount = 0;
    let hasFullOrganicResults = false;
    let limitationNotice: string | undefined;

    const tasks: Array<Promise<void>> = [];

    const searxUrl = process.env.SEARXNG_URL?.trim();
    const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
    const serperKey = process.env.SERPER_API_KEY?.trim();

    // Path 1A: Self-hosted SearXNG full organic web search (when SEARXNG_URL is configured)
    if (searxUrl && !isBlockedHost(searxUrl)) {
      strategyUsed = 'searxng';
      tasks.push(
        (async () => {
          try {
            const safeParam = options.safeSearch === false ? '0' : '1';
            const params = new URLSearchParams({
              q: exactQuery,
              format: 'json',
              safesearch: safeParam
            });
            const engines = process.env.SEARXNG_ENGINES?.trim() || 'duckduckgo';
            params.set('engines', engines);
            if (options.language) params.set('language', options.language);

            const endpoint = `${searxUrl.replace(/\/$/, '')}/search?${params.toString()}`;
            const res = await fetchWithTimeout(endpoint, {}, timeoutMs);
            rawStatus = res.status;
            contentType = res.headers.get('content-type');
            if (!res.ok) throw new Error(`Web Meta HTTP ${res.status}`);
            const data: any = await res.json();

            if (Array.isArray(data?.unresponsive_engines) && data.unresponsive_engines.length > 0) {
              errors.push(`Unresponsive engines: ${data.unresponsive_engines.map((e: any) => Array.isArray(e) ? e.join(':') : String(e)).join(', ')}`);
            }

            const rawItems: RawOrganicCandidateInput[] = Array.isArray(data?.results)
              ? data.results.map((item: any) => ({
                  title: item?.title,
                  url: item?.url,
                  content: item?.content,
                  publishedDate: item?.publishedDate || item?.published_date || null,
                  category: item?.category,
                  score: item?.score,
                  language: item?.language
                }))
              : [];

            const parsedRes = parseAndValidateOrganicItems(rawItems, { limit, subProvider: 'primary_web_organic' });
            rawOrganicCount += parsedRes.rawOrganicCount;
            parsedCount += parsedRes.parsedCount;
            rejectedCount += parsedRes.rejectedCount;
            rejectionReasons = { ...rejectionReasons, ...parsedRes.rejectionReasons };
            genuineWebUrlCount += parsedRes.genuineWebUrlCount;
            if (parsedRes.parsed.length > 0) {
              hasFullOrganicResults = true;
              engineLabel = 'DuckDuckGo Web Search (Primary)';
              results.push(...parsedRes.parsed);
            }
          } catch (err: any) {
            partial = true;
            errors.push(`SearXNG: ${err?.message || 'unavailable'}`);
          }
        })()
      );
    } else if (braveKey) {
      // Path 1B: Official Brave Search JSON API (exact original query + country/safesearch)
      strategyUsed = 'brave_api';
      tasks.push(
        (async () => {
          try {
            const params = new URLSearchParams({
              q: exactQuery,
              count: String(Math.min(limit, 20)),
              safesearch: options.safeSearch === false ? 'off' : 'moderate'
            });
            if (options.regionCode && /^[A-Za-z]{2}$/.test(options.regionCode)) {
              params.set('country', options.regionCode.toLowerCase());
            }
            const res = await fetchWithTimeout(
              `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
              { headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' } },
              timeoutMs
            );
            rawStatus = res.status;
            contentType = res.headers.get('content-type');
            if (!res.ok) throw new Error(`Brave Search API HTTP ${res.status}`);
            const data: any = await res.json();
            const rawItems: RawOrganicCandidateInput[] = Array.isArray(data?.web?.results)
              ? data.web.results.map((item: any) => ({
                  title: item?.title,
                  url: item?.url,
                  content: item?.description,
                  publishedDate: item?.page_age || item?.age || null,
                  category: 'general',
                  language: 'en'
                }))
              : [];
            const parsedRes = parseAndValidateOrganicItems(rawItems, { limit, subProvider: 'primary_web_organic' });
            rawOrganicCount += parsedRes.rawOrganicCount;
            parsedCount += parsedRes.parsedCount;
            rejectedCount += parsedRes.rejectedCount;
            rejectionReasons = { ...rejectionReasons, ...parsedRes.rejectionReasons };
            genuineWebUrlCount += parsedRes.genuineWebUrlCount;
            if (parsedRes.parsed.length > 0) {
              hasFullOrganicResults = true;
              engineLabel = 'Primary Organic Web Search';
              results.push(...parsedRes.parsed);
            }
          } catch (err: any) {
            partial = true;
            errors.push(`PrimaryWebAPI: ${err?.message || 'unavailable'}`);
          }
        })()
      );
    } else if (serperKey) {
      // Path 1C: Official Serper Google JSON API
      strategyUsed = 'serper_api';
      tasks.push(
        (async () => {
          try {
            const bodyPayload: Record<string, any> = {
              q: exactQuery,
              num: Math.min(limit, 20)
            };
            if (options.regionCode && /^[A-Za-z]{2}$/.test(options.regionCode)) {
              bodyPayload.gl = options.regionCode.toLowerCase();
            }
            const res = await fetchWithTimeout(
              'https://google.serper.dev/search',
              {
                method: 'POST',
                headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(bodyPayload)
              },
              timeoutMs
            );
            rawStatus = res.status;
            contentType = res.headers.get('content-type');
            if (!res.ok) throw new Error(`Serper API HTTP ${res.status}`);
            const data: any = await res.json();
            const rawItems: RawOrganicCandidateInput[] = Array.isArray(data?.organic)
              ? data.organic.map((item: any) => ({
                  title: item?.title,
                  url: item?.link,
                  content: item?.snippet,
                  publishedDate: item?.date || null,
                  category: 'general',
                  language: 'en'
                }))
              : [];
            const parsedRes = parseAndValidateOrganicItems(rawItems, { limit, subProvider: 'primary_web_organic' });
            rawOrganicCount += parsedRes.rawOrganicCount;
            parsedCount += parsedRes.parsedCount;
            rejectedCount += parsedRes.rejectedCount;
            rejectionReasons = { ...rejectionReasons, ...parsedRes.rejectionReasons };
            genuineWebUrlCount += parsedRes.genuineWebUrlCount;
            if (parsedRes.parsed.length > 0) {
              hasFullOrganicResults = true;
              engineLabel = 'Primary Organic Web Search';
              results.push(...parsedRes.parsed);
            }
          } catch (err: any) {
            partial = true;
            errors.push(`PrimaryWebAPI: ${err?.message || 'unavailable'}`);
          }
        })()
      );
    } else {
      limitationNotice = INSTANT_ANSWER_LIMITATION_NOTICE;
    }

    // Path 2: Documented DuckDuckGo Instant Answer API (encyclopedic reference & direct answers ONLY)
    // Strictly tagged `knowledge_ia` — NEVER counted as genuine full organic web results
    tasks.push(
      (async () => {
        try {
          const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(exactQuery)}&format=json&no_html=1&skip_disambig=1`;
          const res = await fetchWithTimeout(url, {}, timeoutMs);
          if (rawStatus === null) rawStatus = res.status;
          if (!contentType) contentType = res.headers.get('content-type');
          if (!res.ok) throw new Error(`Knowledge API HTTP ${res.status}`);
          const data: any = await res.json();

          const abs = String(data.AbstractText || data.Abstract || '').trim();
          const absUrl = String(data.AbstractURL || '').trim();
          const heading = String(data.Heading || exactQuery).trim();
          const ans = String(data.Answer || data.Definition || '').trim();
          if (ans) directAnswer = ans;
          if (abs) abstractText = abs;

          let iaRank = 0;
          if (abs && absUrl && !isBlockedHost(absUrl)) {
            const dom = domainOf(absUrl);
            if (!dom.endsWith('duckduckgo.com')) {
              iaRank++;
              results.push({
                id: `ext-ref-${dom}`,
                title: heading,
                url: absUrl,
                snippet: abs.slice(0, 440),
                domain: dom,
                content: abs,
                publishedAt: null,
                indexedAt: new Date().toISOString(),
                source: 'external',
                subProvider: 'knowledge_ia',
                providerDetail: 'DuckDuckGo',
                providerType: 'external_supplement',
                rank: iaRank,
                rawScore: 0.68,
                resultType: 'web',
                category: 'reference',
                language: 'en',
                favicon: faviconFor(dom)
              });
            }
          }

          if (Array.isArray(data.Results)) {
            data.Results.forEach((r: any, idx: number) => {
              const rUrl = String(r?.FirstURL || '');
              if (!rUrl || isBlockedHost(rUrl)) return;
              const dom = domainOf(rUrl);
              if (dom.endsWith('duckduckgo.com')) return;
              const txt = stripHtml(String(r?.Text || ''));
              iaRank++;
              results.push({
                id: `ext-ans-${idx}-${dom}`,
                title: txt.slice(0, 84) || dom,
                url: rUrl,
                snippet: txt,
                domain: dom,
                content: txt,
                publishedAt: null,
                indexedAt: new Date().toISOString(),
                source: 'external',
                subProvider: 'knowledge_ia',
                providerDetail: 'DuckDuckGo',
                providerType: 'external_supplement',
                rank: iaRank,
                rawScore: Math.max(0.55, 0.84 - idx * 0.04),
                category: 'general',
                language: 'en',
                favicon: faviconFor(dom)
              });
            });
          }

          const flatTopics: any[] = [];
          for (const t of data.RelatedTopics || []) {
            if (Array.isArray(t?.Topics)) flatTopics.push(...t.Topics);
            else flatTopics.push(t);
          }

          flatTopics.slice(0, Math.min(limit, 10)).forEach((t: any, idx: number) => {
            const firstUrl = String(t?.FirstURL || '');
            if (!t?.Text || !firstUrl || isBlockedHost(firstUrl)) return;
            const dom = domainOf(firstUrl);
            if (dom.endsWith('duckduckgo.com')) return;
            const rawText = stripHtml(String(t.Text));
            const parts = rawText.split(' - ');
            const title = parts.length > 1 ? parts[0].trim() : rawText.slice(0, 72);
            const snippet = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rawText;
            iaRank++;
            results.push({
              id: `ext-topic-${idx}-${Buffer.from(firstUrl).toString('base64').slice(0, 8)}`,
              title,
              url: firstUrl,
              snippet: snippet.slice(0, 320),
              domain: dom,
              content: snippet,
              publishedAt: null,
              indexedAt: new Date().toISOString(),
              source: 'external',
              subProvider: 'knowledge_ia',
              providerDetail: 'DuckDuckGo',
              providerType: 'external_supplement',
              rank: iaRank,
              rawScore: Math.max(0.45, 0.74 - idx * 0.03),
              category: 'general',
              language: 'en',
              favicon: faviconFor(dom)
            });
          });
        } catch (err: any) {
          partial = true;
          errors.push(`KnowledgeIA: ${err?.message || 'timeout/error'}`);
        }
      })()
    );

    await Promise.allSettled(tasks);

    const latencyMs = Math.round((performance.now() - t0) * 10) / 10;
    const telemetry: PrimaryProviderTelemetry = {
      strategyUsed,
      providerQuery: exactQuery,
      rawStatus,
      contentType,
      rawOrganicCount,
      parsedCount,
      rejectedCount,
      rejectionReasons,
      genuineWebUrlCount,
      hasFullOrganicResults,
      limitationNotice,
      errors,
      latencyMs
    };

    return {
      results: results.slice(0, limit),
      directAnswer,
      abstractText,
      engineLabel,
      partial: partial && results.length > 0,
      error: results.length === 0 && errors.length > 0 ? errors.join('; ') : undefined,
      telemetry
    };
  }
}

export async function fetchPermittedExternalProviders(
  query: string,
  options: {
    type?: string;
    limit?: number;
    timeoutMs?: number;
    intelligence?: QueryIntelligence;
  } = {}
): Promise<{
  results: ProviderRawResult[];
  status: 'success' | 'partial' | 'error';
  errors: string[];
  subProviderMetrics: Record<string, { count: number; latencyMs: number; status: string }>;
}> {
  const limit = Math.min(options.limit || 24, 40);
  const timeoutMs = options.timeoutMs || 3800;
  const rawType = (options.type || 'All').toLowerCase();
  const intel = options.intelligence;
  const effectiveQuery = intel?.correctedQuery || query;
  const results: ProviderRawResult[] = [];
  const errors: string[] = [];
  const subProviderMetrics: Record<string, { count: number; latencyMs: number; status: string }> = {};

  const fetchOpenLibrary = async () => {
    const t0 = performance.now();
    try {
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(effectiveQuery)}&limit=${Math.min(limit, 15)}`;
      const res = await fetchWithTimeout(url, {}, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const docs = data?.docs || [];
      docs.forEach((b: any, idx: number) => {
        const bookUrl = b.key ? `https://openlibrary.org${b.key}` : 'https://openlibrary.org';
        const authors = Array.isArray(b.author_name) ? b.author_name.slice(0, 3).join(', ') : 'Unknown Author';
        const year = b.first_publish_year ? String(b.first_publish_year) : null;
        const desc = `By ${authors}${year ? ` · First published ${year}` : ''}${b.edition_count ? ` · ${b.edition_count} editions` : ''}.`;
        results.push({
          id: `ext-book-${idx}`,
          title: b.title || 'Book',
          url: bookUrl,
          snippet: desc,
          domain: 'openlibrary.org',
          content: desc,
          publishedAt: year ? `${year}-01-01` : null,
          indexedAt: new Date().toISOString(),
          source: 'external',
          subProvider: 'openlibrary',
          providerDetail: 'Open Library',
          rank: idx + 1,
          rawScore: Math.max(0.55, 0.88 - idx * 0.02),
          resultType: 'web',
          category: 'books',
          language: 'en',
          favicon: faviconFor('openlibrary.org'),
          media: b.cover_i
            ? { images: [{ src: `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`, alt: b.title || 'Book cover' }] }
            : undefined
        });
      });
      subProviderMetrics.openlibrary = { count: docs.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch (e: any) {
      errors.push(`OpenLibrary: ${e?.message || 'failed'}`);
      subProviderMetrics.openlibrary = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'error' };
    }
  };

  const fetchWikimediaMedia = async (mediaFilter: 'image' | 'video' | 'any' = 'any') => {
    const t0 = performance.now();
    try {
      const searchSuffix = mediaFilter === 'video' ? `${effectiveQuery} filetype:video` : effectiveQuery;
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(searchSuffix)}&gsrlimit=${Math.min(limit, 12)}&prop=imageinfo&iiprop=url|size|mime|timestamp&iiurlwidth=640&format=json`;
      const res = await fetchWithTimeout(url, {}, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const pages = Object.values(data?.query?.pages || {}) as any[];
      let count = 0;
      pages
        .filter((p) => p?.imageinfo?.[0]?.url)
        .forEach((p, idx) => {
          const info = p.imageinfo[0];
          const mime = String(info.mime || '');
          const isVideo = mime.startsWith('video/') || /\.(webm|ogv|mp4)$/i.test(info.url);
          if (mediaFilter === 'video' && !isVideo) return;
          if (mediaFilter === 'image' && isVideo) return;

          const title = String(p.title || 'Media').replace(/^File:/, '').replace(/\.[^.]+$/, '');
          const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}`;
          const thumb = info.thumburl || info.url;
          count++;
          results.push({
            id: `ext-wikimedia-${idx}`,
            title,
            url: pageUrl,
            snippet: `Wikimedia Commons ${isVideo ? 'video' : 'image'} (${info.width || '?'}x${info.height || '?'}px, ${mime || 'media'}).`,
            domain: 'commons.wikimedia.org',
            content: `${title} Wikimedia Commons ${mime}`,
            publishedAt: info.timestamp || null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'wikimedia',
            providerDetail: 'Wikimedia Commons',
            rank: idx + 1,
            rawScore: Math.max(0.55, 0.86 - idx * 0.02),
            resultType: isVideo ? 'video' : 'image',
            category: isVideo ? 'video' : 'image',
            language: 'en',
            favicon: faviconFor('commons.wikimedia.org'),
            media: isVideo
              ? { videos: [{ src: info.url, type: mime || 'video/webm', title }] }
              : { images: [{ src: thumb, alt: title, title, width: info.width, height: info.height }] }
          });
        });
      subProviderMetrics.wikimedia = { count, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch (e: any) {
      errors.push(`Wikimedia: ${e?.message || 'failed'}`);
      subProviderMetrics.wikimedia = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'error' };
    }
  };

  const fetchOpenverse = async () => {
    const t0 = performance.now();
    try {
      const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(effectiveQuery)}&page_size=${Math.min(limit, 12)}`;
      const res = await fetchWithTimeout(url, {}, Math.min(timeoutMs, 2600));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const items = data?.results || [];
      let count = 0;
      items.forEach((img: any, idx: number) => {
        if (!img?.url || !img?.foreign_landing_url) return;
        const dom = domainOf(img.foreign_landing_url, 'openverse.org');
        count++;
        results.push({
          id: `ext-openverse-${idx}`,
          title: img.title || 'Openverse Visual Media',
          url: img.foreign_landing_url,
          snippet: `Open-licensed image by ${img.creator || 'contributor'} (${img.license || 'CC'}).`,
          domain: dom,
          content: `${img.title || ''} ${img.creator || ''}`,
          publishedAt: null,
          indexedAt: new Date().toISOString(),
          source: 'external',
          subProvider: 'openverse',
          providerDetail: 'Openverse',
          rank: idx + 1,
          rawScore: Math.max(0.58, 0.87 - idx * 0.02),
          resultType: 'image',
          category: 'image',
          language: 'en',
          favicon: faviconFor(dom),
          media: {
            images: [{ src: img.thumbnail || img.url, alt: img.title || query, title: img.title, width: img.width, height: img.height }]
          }
        });
      });
      subProviderMetrics.openverse = { count, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      subProviderMetrics.openverse = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'skipped' };
    }
  };

  const fetchNominatim = async () => {
    const t0 = performance.now();
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(effectiveQuery)}&format=jsonv2&limit=${Math.min(limit, 12)}`;
      const res = await fetchWithTimeout(url, {}, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items: any[] = await res.json();
      items.forEach((p, idx) => {
        const lat = parseFloat(p.lat);
        const lon = parseFloat(p.lon);
        const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`;
        results.push({
          id: `ext-osm-${idx}`,
          title: p.name || String(p.display_name || 'Place').split(',')[0],
          url: osmUrl,
          snippet: `${p.display_name} (${(p.type || p.category || 'place').replace(/_/g, ' ')}). Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}.`,
          domain: 'openstreetmap.org',
          content: p.display_name,
          publishedAt: null,
          indexedAt: new Date().toISOString(),
          source: 'external',
          subProvider: 'nominatim',
          providerDetail: 'OpenStreetMap',
          rank: idx + 1,
          rawScore: Math.max(0.60, 0.89 - idx * 0.03),
          resultType: 'map',
          category: 'map',
          language: 'en',
          favicon: faviconFor('openstreetmap.org'),
          location: { lat, lon, address: p.display_name }
        });
      });
      subProviderMetrics.nominatim = { count: items.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch (e: any) {
      errors.push(`OpenStreetMap: ${e?.message || 'failed'}`);
      subProviderMetrics.nominatim = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'error' };
    }
  };

  const runWikiSecondary = async (wikiMax: number) => {
    const w = await fetchWikipediaSecondary(effectiveQuery, wikiMax, Math.min(timeoutMs, 2600));
    results.push(...w.results);
    subProviderMetrics.wikipedia = w.metrics;
  };

  const runDevDocs = async () => {
    if (!intel) return;
    const d = await fetchDeveloperDocsAndPackages(effectiveQuery, intel, 16, Math.min(timeoutMs, 2800));
    results.push(...d.results);
    Object.assign(subProviderMetrics, d.metrics);
  };

  const runJournalism = async () => {
    if (!intel) return;
    const j = await fetchLiveJournalismFeeds(effectiveQuery, intel, 16, Math.min(timeoutMs, 2800), (rssItems) => {
      for (const item of rssItems.slice(0, 12)) {
        ingestRssArticleAsCrawledDoc(item);
      }
    });
    results.push(...j.results);
    Object.assign(subProviderMetrics, j.metrics);
  };

  const runAcademic = async (acadLimit = 12) => {
    const a = await fetchAcademicWeb(effectiveQuery, acadLimit, Math.min(timeoutMs, 3000));
    results.push(...a.results);
    Object.assign(subProviderMetrics, a.metrics);
  };

  const runDirectory = async () => {
    if (!intel) return;
    const dir = await fetchDirectoryAndInstitutionalWeb(effectiveQuery, intel, 12, Math.min(timeoutMs, 2800));
    results.push(...dir.results);
    Object.assign(subProviderMetrics, dir.metrics);
  };

  const intent = intel?.intent || 'informational';

  if (rawType === 'images' || rawType === 'image') {
    await Promise.allSettled([fetchWikimediaMedia('image'), fetchOpenverse()]);
  } else if (rawType === 'videos' || rawType === 'video') {
    await Promise.allSettled([fetchWikimediaMedia('video')]);
  } else if (rawType === 'maps' || intent === 'local') {
    await Promise.allSettled([fetchNominatim(), runDirectory()]);
  } else if (rawType === 'books') {
    await Promise.allSettled([fetchOpenLibrary(), runWikiSecondary(3)]);
  } else if (rawType === 'research' || rawType === 'academic' || intent === 'research') {
    await Promise.allSettled([runAcademic(16), runDirectory(), runWikiSecondary(2)]);
  } else if (rawType === 'news' || rawType === 'latest' || rawType === 'realtime' || intent === 'news') {
    await Promise.allSettled([runJournalism(), runAcademic(6), runWikiSecondary(2)]);
  } else if (intent === 'technical' || /\b(docs|documentation|api|sdk|react|python|javascript|typescript|nvidia|rtx|architecture|search engine|how does)\b/i.test(effectiveQuery)) {
    await Promise.allSettled([runDevDocs(), runJournalism(), runDirectory(), runAcademic(6), runWikiSecondary(2)]);
  } else if (intent === 'historical' || intent === 'definition') {
    await Promise.allSettled([runWikiSecondary(4), runAcademic(8), fetchOpenLibrary(), runDirectory()]);
  } else {
    await Promise.allSettled([runDirectory(), runJournalism(), runDevDocs(), runAcademic(6), runWikiSecondary(3)]);
  }

  const status = results.length > 0 ? (errors.length > 0 ? 'partial' : 'success') : errors.length > 0 ? 'error' : 'success';
  return { results, status, errors, subProviderMetrics };
}

export const defaultDuckDuckGoProvider = new PermittedDuckDuckGoProvider();
