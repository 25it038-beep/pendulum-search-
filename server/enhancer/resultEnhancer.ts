import {
  CandidateEnhancementMeta,
  ProviderRawResult,
  QueryIntelligence,
  SourceClass
} from '../types';
import { TtlCache } from '../metrics';
import { checkRobotsAllowed } from '../crawler/crawlerEngine';
import { isBlockedHost, stripHtml } from '../providers/duckduckgoProvider';
import { classifyNonOfficialSource, extractRegistrableHost } from '../entity/officialDiscovery';
import { tokenizeBoundary } from '../query/intelligence';

export interface EnrichedPageData {
  url: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string;
  title: string;
  metaDescription: string;
  headings: string[];
  mainContent: string;
  canonicalUrl?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  author?: string;
  publisher?: string;
  structuredType?: string;
}

export interface EnhancementRunOptions {
  enableLiveFetch?: boolean;
  maxLiveFetches?: number;
  perPageTimeoutMs?: number;
  concurrency?: number;
  fetchPage?: (url: string, timeoutMs: number) => Promise<EnrichedPageData | null>;
}

export interface EnhancerBatchResult {
  candidates: ProviderRawResult[];
  attempted: number;
  enrichedCount: number;
  rejectedCount: number;
  rejectedPages: Array<{ title: string; url: string; domain: string; reason: string }>;
  skippedReasons: Record<string, number>;
  latencyMs: number;
}

const pageEnrichmentCache = new TtlCache<EnrichedPageData>(10 * 60_000, 250);

const CAPTCHA_OR_INTERSTITIAL_RE =
  /\b(enable javascript and cookies|attention required!\s*\|\s*cloudflare|just a moment\.\.\.|verify you are human|access denied|403 forbidden|404 not found|page not found)\b/i;

const AD_SPAM_BODY_RE =
  /\b(buy cheap now|casino bonus|crypto giveaway|click here to claim|limited time miracle offer|sponsored promo code)\b/i;

function decodeHtmlAttr(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchMetaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rxA = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i');
  const mA = html.match(rxA);
  if (mA?.[1]) return decodeHtmlAttr(mA[1]);
  const rxB = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i');
  const mB = html.match(rxB);
  if (mB?.[1]) return decodeHtmlAttr(mB[1]);
  return undefined;
}

function extractCanonicalUrl(html: string, baseUrl: string): string | undefined {
  const m =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (!m?.[1]) return undefined;
  try {
    const resolved = new URL(m[1].trim(), baseUrl).toString();
    return isBlockedHost(resolved) ? undefined : resolved;
  } catch {
    return undefined;
  }
}

function extractJsonLdMetadata(html: string): {
  type?: string;
  author?: string;
  publisher?: string;
  datePublished?: string;
  dateModified?: string;
} {
  const out: {
    type?: string;
    author?: string;
    publisher?: string;
    datePublished?: string;
    dateModified?: string;
  } = {};

  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = (m[1] || '').trim();
    if (!raw || raw.length > 50_000) continue;
    try {
      const parsed = JSON.parse(raw);
      const nodes: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
        ? parsed['@graph']
        : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        if (!out.type && node['@type']) {
          out.type = Array.isArray(node['@type']) ? String(node['@type'][0]) : String(node['@type']);
        }
        if (!out.datePublished && typeof node.datePublished === 'string') {
          out.datePublished = node.datePublished;
        }
        if (!out.dateModified && typeof node.dateModified === 'string') {
          out.dateModified = node.dateModified;
        }
        if (!out.author && node.author) {
          if (typeof node.author === 'string') out.author = node.author;
          else if (typeof node.author?.name === 'string') out.author = node.author.name;
          else if (Array.isArray(node.author) && typeof node.author[0]?.name === 'string') out.author = node.author[0].name;
        }
        if (!out.publisher && node.publisher) {
          if (typeof node.publisher === 'string') out.publisher = node.publisher;
          else if (typeof node.publisher?.name === 'string') out.publisher = node.publisher.name;
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }
  return out;
}

export function parseHtmlToEnrichedPage(html: string, url: string, finalUrl: string, httpStatus: number, contentType: string): EnrichedPageData {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitle = matchMetaContent(html, 'og:title');
  const title = (titleMatch ? stripHtml(titleMatch[1]) : ogTitle || '').slice(0, 180);

  const metaDescription = (
    matchMetaContent(html, 'description') ||
    matchMetaContent(html, 'og:description') ||
    ''
  ).slice(0, 500);

  const headings: string[] = [];
  for (const hm of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const h = stripHtml(hm[1]).slice(0, 140);
    if (h && !headings.includes(h) && headings.length < 15) {
      headings.push(h);
    }
  }

  const ld = extractJsonLdMetadata(html);
  const publishedAt =
    matchMetaContent(html, 'article:published_time') ||
    matchMetaContent(html, 'datePublished') ||
    matchMetaContent(html, 'date') ||
    ld.datePublished ||
    null;
  const updatedAt =
    matchMetaContent(html, 'article:modified_time') ||
    matchMetaContent(html, 'og:updated_time') ||
    ld.dateModified ||
    null;
  const author = matchMetaContent(html, 'author') || ld.author;
  const publisher = matchMetaContent(html, 'og:site_name') || ld.publisher;
  const structuredType = ld.type || matchMetaContent(html, 'og:type');
  const canonicalUrl = extractCanonicalUrl(html, finalUrl || url);

  // Focus on main/article region if available, stripping boilerplate tags
  const mainRegionMatch =
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const contentHtml = mainRegionMatch?.[1] || html;
  const cleanedBody = stripHtml(
    contentHtml
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
  ).slice(0, 8000);

  return {
    url,
    finalUrl,
    httpStatus,
    contentType,
    title,
    metaDescription,
    headings,
    mainContent: cleanedBody,
    canonicalUrl,
    publishedAt,
    updatedAt,
    author,
    publisher,
    structuredType
  };
}

async function defaultFetchPage(targetUrl: string, timeoutMs: number): Promise<EnrichedPageData | null> {
  if (!targetUrl || isBlockedHost(targetUrl)) return null;
  const cacheKey = targetUrl.toLowerCase();
  const cached = pageEnrichmentCache.get(cacheKey);
  if (cached) return cached;

  const allowed = await checkRobotsAllowed(targetUrl);
  if (!allowed) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'PendulumSearchBot/2.1 (+https://hsaisolutions.com)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
      }
    });

    const contentType = res.headers.get('content-type') || '';
    const finalUrl = res.url && !isBlockedHost(res.url) ? res.url : targetUrl;

    if (!res.ok) {
      const errData: EnrichedPageData = {
        url: targetUrl,
        finalUrl,
        httpStatus: res.status,
        contentType,
        title: '',
        metaDescription: '',
        headings: [],
        mainContent: ''
      };
      return errData;
    }

    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      return null;
    }

    const rawText = await res.text();
    const boundedHtml = rawText.slice(0, 350_000);
    const parsed = parseHtmlToEnrichedPage(boundedHtml, targetUrl, finalUrl, res.status, contentType);
    pageEnrichmentCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * B. Relevance Analysis against the exact original query
 */
export function analyzeCandidateRelevance(
  candidate: ProviderRawResult,
  originalQuery: string,
  intel: QueryIntelligence
): CandidateEnhancementMeta['relevanceSignals'] {
  const qLower = originalQuery.trim().toLowerCase();
  const coreTokens = intel.tokens.length > 0 ? intel.tokens : tokenizeBoundary(originalQuery, true);

  const titleSet = new Set(tokenizeBoundary(candidate.title || '', false));
  const headingSet = new Set(tokenizeBoundary((candidate.headings || []).join(' '), false));
  const bodyTokensList = tokenizeBoundary(`${candidate.snippet || ''} ${(candidate.content || '').slice(0, 3000)}`, false);
  const bodyTokenSet = new Set(bodyTokensList);
  const urlSlugSet = new Set(tokenizeBoundary((candidate.url || '').replace(/[/\-_.?=]+/g, ' '), false));
  const coreTokenSet = new Set(coreTokens);
  let bodyOccurrenceCount = 0;
  for (const bt of bodyTokensList) {
    if (coreTokenSet.has(bt)) bodyOccurrenceCount++;
  }

  let titleHits = 0;
  let headingHits = 0;
  let bodyHits = 0;
  let urlHits = 0;
  for (const tok of coreTokens) {
    if (titleSet.has(tok)) titleHits++;
    if (headingSet.has(tok)) headingHits++;
    if (bodyTokenSet.has(tok)) bodyHits++;
    if (urlSlugSet.has(tok)) urlHits++;
  }

  const n = Math.max(1, coreTokens.length);
  const titleCoverage = Math.round((titleHits / n) * 1000) / 1000;
  const headingCoverage = Math.round((headingHits / n) * 1000) / 1000;
  const bodyCoverage = Math.round((bodyHits / n) * 1000) / 1000;
  const urlCoverage = urlHits / n;

  const fullTextLower = `${candidate.title} ${(candidate.headings || []).join(' ')} ${candidate.snippet} ${candidate.content.slice(0, 1500)}`.toLowerCase();
  const exactQueryMatch = qLower.length >= 3 && fullTextLower.includes(qLower);

  const entityName = intel.recognizedEntity?.name?.toLowerCase();
  const entityMatch = Boolean(
    entityName &&
      (fullTextLower.includes(entityName) ||
        (intel.recognizedEntity?.abbreviations || []).some((abbr) => fullTextLower.includes(abbr.toLowerCase())))
  );

  // Surface-mention-only check: keyword appears briefly/once in body/footer, completely absent from title, headings, and URL
  const singleBriefFooterMention = bodyTokensList.length >= 10 && bodyOccurrenceCount <= coreTokens.length;
  const surfaceMentionOnly =
    coreTokens.length >= 2 &&
    titleHits === 0 &&
    headingHits === 0 &&
    urlHits === 0 &&
    bodyHits > 0 &&
    ((bodyCoverage <= 0.5 && !exactQueryMatch) || singleBriefFooterMention);

  const relevanceScore = Math.max(
    0,
    Math.min(
      1,
      Math.round(
        (titleCoverage * 0.42 +
          headingCoverage * 0.16 +
          bodyCoverage * 0.28 +
          urlCoverage * 0.08 +
          (exactQueryMatch ? 0.14 : 0) +
          (entityMatch ? 0.08 : 0) -
          (surfaceMentionOnly ? 0.22 : 0)) *
          1000
      ) / 1000
    )
  );

  return {
    exactQueryMatch,
    titleCoverage,
    headingCoverage,
    bodyCoverage,
    entityMatch,
    surfaceMentionOnly,
    relevanceScore
  };
}

/**
 * C. Source Validation — classifies official sites, gov, edu, tech docs, research, news, directories.
 * Never claims an official website without sufficient multi-signal evidence.
 */
export function validateCandidateSource(
  candidate: ProviderRawResult,
  intel: QueryIntelligence
): {
  sourceClass: SourceClass;
  isOfficialWebsite: boolean;
  isOfficialSubpage: boolean;
  officialConfidence?: number;
  validationEvidence: string[];
} {
  const dom = (candidate.domain || extractRegistrableHost(candidate.url)).toLowerCase();
  const urlLower = (candidate.url || '').toLowerCase();
  const evidence: string[] = [];

  // Preserve verified official discovery output if already established
  if (candidate.isOfficialWebsite && (candidate.officialConfidence || 0) >= 0.62) {
    evidence.push(...(candidate.officialVerifiedBy || ['entity_official_verification']));
    return {
      sourceClass: 'official_website',
      isOfficialWebsite: true,
      isOfficialSubpage: false,
      officialConfidence: candidate.officialConfidence,
      validationEvidence: evidence
    };
  }
  if (candidate.isOfficialSubpage && (candidate.officialConfidence || 0) >= 0.62) {
    evidence.push(...(candidate.officialVerifiedBy || ['entity_official_subpage_verification']));
    return {
      sourceClass: 'official_subpage',
      isOfficialWebsite: false,
      isOfficialSubpage: true,
      officialConfidence: candidate.officialConfidence,
      validationEvidence: evidence
    };
  }

  let sourceClass: SourceClass = classifyNonOfficialSource(candidate.url, candidate.category);
  if (/\.(gov|gov\.in|gov\.uk|nic\.in|mil)$/i.test(dom)) {
    evidence.push('government_tld_verified');
  } else if (/\.(edu|ac\.in|ac\.uk|edu\.au)$/i.test(dom)) {
    evidence.push('accredited_academic_tld');
    if (sourceClass === 'web') sourceClass = 'academic';
  } else if (/^(docs|developer|developers)\./i.test(dom) || /(typescriptlang\.org|nodejs\.org|rfc-editor\.org|postgresql\.org|w3\.org)/i.test(dom)) {
    evidence.push('official_technical_documentation');
  } else if (/NewsArticle/i.test(candidate.structuredType || '')) {
    sourceClass = 'news';
    evidence.push('schema_news_article');
  } else if (/ScholarlyArticle|Academic/i.test(candidate.structuredType || '')) {
    sourceClass = 'academic';
    evidence.push('schema_scholarly_article');
  }

  // Conservative multi-signal official check when query targets a specific organization
  let isOfficialWebsite = false;
  let isOfficialSubpage = false;
  let officialConfidence: number | undefined = candidate.officialConfidence;

  const entity = intel.recognizedEntity;
  const nonOfficialCategory =
    sourceClass === 'wikipedia' || sourceClass === 'directory' || sourceClass === 'educational_portal' || sourceClass === 'news';

  if (entity?.isSpecificEntityQuery && !nonOfficialCategory) {
    const domSlug = dom.split('.')[0].replace(/[^a-z0-9]/g, '');
    const titleLower = candidate.title.toLowerCase();
    const entityTokens = tokenizeBoundary(entity.name, false).filter((t) => t.length >= 2);
    const abbrs = entity.abbreviations.map((a) => a.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const domainMatchesEntity =
      (domSlug.length >= 3 && abbrs.some((a) => domSlug.includes(a))) ||
      entityTokens.filter((t) => t.length >= 4 && domSlug.includes(t)).length >= 1;
    const publisherMatchesEntity =
      Boolean(candidate.publisher) &&
      entityTokens.some((t) => candidate.publisher!.toLowerCase().includes(t));
    const institutionalTld = /\.(edu|ac\.in|edu\.in|gov|gov\.in|nic\.in|org)$/i.test(dom);
    const titleMatchesEntity = entityTokens.filter((t) => titleLower.includes(t)).length >= Math.min(2, entityTokens.length);

    const signalsCount =
      (domainMatchesEntity ? 1 : 0) +
      (publisherMatchesEntity || titleMatchesEntity ? 1 : 0) +
      (institutionalTld ? 1 : 0);

    if (domainMatchesEntity && signalsCount >= 2) {
      let pathDepth = 0;
      try {
        pathDepth = new URL(candidate.url).pathname.split('/').filter(Boolean).length;
      } catch {}
      isOfficialWebsite = pathDepth === 0;
      isOfficialSubpage = pathDepth > 0;
      sourceClass = isOfficialWebsite ? 'official_website' : 'official_subpage';
      officialConfidence = Math.min(0.92, 0.65 + signalsCount * 0.08);
      evidence.push('multi_signal_domain_entity_match');
      if (institutionalTld) evidence.push('institutional_domain_suffix');
      if (publisherMatchesEntity) evidence.push('publisher_metadata_match');
    }
  }

  if (evidence.length === 0) {
    evidence.push(sourceClass === 'web' ? 'independent_web_source' : `classified_${sourceClass}`);
  }

  return {
    sourceClass,
    isOfficialWebsite,
    isOfficialSubpage,
    officialConfidence,
    validationEvidence: evidence
  };
}

/**
 * D. Quality Analysis — checks broken links, misleading titles, empty/thin content, spam, duplicates.
 * Never penalizes independent/small websites solely for domain obscurity.
 */
export function analyzeCandidateQuality(
  candidate: ProviderRawResult,
  relevance: CandidateEnhancementMeta['relevanceSignals'],
  fetched?: EnrichedPageData | null
): { rejected: boolean; rejectReason?: string; flags: string[] } {
  const flags: string[] = [];

  if (fetched && fetched.httpStatus >= 400) {
    return { rejected: true, rejectReason: `broken_http_${fetched.httpStatus}`, flags: [`http_${fetched.httpStatus}`] };
  }

  const combined = `${candidate.title} ${candidate.snippet} ${candidate.content}`.trim();
  const fetchedMain = fetched?.mainContent || '';
  if (CAPTCHA_OR_INTERSTITIAL_RE.test(candidate.title) || (fetched && CAPTCHA_OR_INTERSTITIAL_RE.test(fetchedMain.slice(0, 400)))) {
    return { rejected: true, rejectReason: 'captcha_or_error_stub', flags: ['captcha_or_error_stub'] };
  }

  if (AD_SPAM_BODY_RE.test(combined)) {
    return { rejected: true, rejectReason: 'promotional_spam', flags: ['promotional_spam'] };
  }

  if (combined.length < 18 && !candidate.location) {
    return { rejected: true, rejectReason: 'empty_content', flags: ['empty_content'] };
  }

  if (relevance.surfaceMentionOnly) {
    flags.push('surface_mention_only');
  }

  if (fetched && fetchedMain.length > 200) {
    // Check misleading title: title claims core query words but body has zero mention of any core query token
    const titleToks = new Set(tokenizeBoundary(candidate.title, false));
    const bodyToks = new Set(tokenizeBoundary(fetchedMain.slice(0, 3000), false));
    let shared = 0;
    for (const t of titleToks) {
      if (t.length >= 4 && bodyToks.has(t)) shared++;
    }
    if (titleToks.size >= 4 && shared === 0) {
      flags.push('title_content_mismatch');
    }
  } else if ((candidate.content || candidate.snippet || '').trim().length < 48 && !candidate.location) {
    flags.push('thin_snippet');
  }

  return { rejected: false, flags };
}

/**
 * PendulumResultEnhancer:
 * Enhances, enriches (with robots.txt & timeouts), validates, and audits quality
 * across primary web search results and Pendulum candidates.
 */
export async function enhanceSearchResults(
  candidates: ProviderRawResult[],
  originalQuery: string,
  intel: QueryIntelligence,
  options: EnhancementRunOptions = {}
): Promise<EnhancerBatchResult> {
  const t0 = performance.now();
  const enableLiveFetch = options.enableLiveFetch !== false;
  const maxLiveFetches = options.maxLiveFetches ?? 6;
  const perPageTimeoutMs = options.perPageTimeoutMs ?? 1700;
  const fetchFn = options.fetchPage || defaultFetchPage;

  // Select top primary_web_search or external web candidates lacking full content for live page enrichment
  const fetchTargets = new Set<string>();
  if (enableLiveFetch) {
    const primaryCandidates = candidates.filter(
      (c) =>
        (c.providerType === 'primary_web_search' || c.subProvider === 'primary_web_organic' || c.source === 'external') &&
        (c.resultType === 'web' || !c.resultType) &&
        !isBlockedHost(c.url) &&
        c.content.length < 600
    );
    primaryCandidates
      .sort((a, b) => (a.originalRank || a.rank || 99) - (b.originalRank || b.rank || 99))
      .slice(0, maxLiveFetches)
      .forEach((c) => fetchTargets.add(c.id));
  }

  const fetchedMap = new Map<string, EnrichedPageData | null>();
  const skippedReasons: Record<string, number> = {};
  let attempted = 0;
  let enrichedCount = 0;

  if (fetchTargets.size > 0) {
    const targetList = candidates.filter((c) => fetchTargets.has(c.id));
    attempted = targetList.length;
    await Promise.allSettled(
      targetList.map(async (c) => {
        const cached = pageEnrichmentCache.get(c.url.toLowerCase());
        if (cached) {
          fetchedMap.set(c.id, cached);
          return;
        }
        const data = await fetchFn(c.url, perPageTimeoutMs);
        fetchedMap.set(c.id, data);
        if (!data) {
          skippedReasons.fetch_unavailable_or_robots = (skippedReasons.fetch_unavailable_or_robots || 0) + 1;
        }
      })
    );
  }

  const enhancedCandidates: ProviderRawResult[] = [];
  const rejectedPages: Array<{ title: string; url: string; domain: string; reason: string }> = [];

  for (const item of candidates) {
    const itemT0 = performance.now();
    const fetched = fetchedMap.get(item.id) || null;
    const enrichedOk = Boolean(fetched && fetched.httpStatus >= 200 && fetched.httpStatus < 400 && (fetched.mainContent.length >= 60 || fetched.metaDescription.length >= 30));

    let working: ProviderRawResult = { ...item };

    if (fetched && enrichedOk) {
      enrichedCount += 1;
      const betterTitle = fetched.title && fetched.title.length >= 6 ? fetched.title : working.title;
      const betterSnippet =
        fetched.metaDescription && fetched.metaDescription.length >= 45
          ? fetched.metaDescription
          : working.snippet || fetched.mainContent.slice(0, 320);
      const mergedHeadings = fetched.headings.length > 0 ? fetched.headings : working.headings || [];
      const betterContent = fetched.mainContent.length > working.content.length ? fetched.mainContent : working.content;

      working = {
        ...working,
        title: betterTitle,
        snippet: betterSnippet.slice(0, 420),
        content: betterContent,
        headings: mergedHeadings,
        canonicalUrl: fetched.canonicalUrl || working.canonicalUrl || working.url,
        publishedAt: working.publishedAt || fetched.publishedAt || null,
        updatedAt: working.updatedAt || fetched.updatedAt || null,
        author: fetched.author || working.author,
        publisher: fetched.publisher || working.publisher,
        structuredType: fetched.structuredType || working.structuredType,
        isEnriched: true
      };
    }

    const relevance = analyzeCandidateRelevance(working, originalQuery, intel);
    const validation = validateCandidateSource(working, intel);
    const quality = analyzeCandidateQuality(working, relevance, fetched);

    const meta: CandidateEnhancementMeta = {
      enriched: enrichedOk,
      fetchedHttpStatus: fetched?.httpStatus,
      contentType: fetched?.contentType,
      metaDescription: fetched?.metaDescription,
      extractedTitle: fetched?.title,
      canonicalUrl: working.canonicalUrl,
      author: working.author,
      publisher: working.publisher,
      structuredType: working.structuredType,
      contentLength: (working.content || '').length,
      headingsCount: (working.headings || []).length,
      relevanceSignals: relevance,
      validationEvidence: validation.validationEvidence,
      qualityFlags: quality.flags,
      rejected: quality.rejected,
      rejectReason: quality.rejectReason,
      latencyMs: Math.round((performance.now() - itemT0) * 10) / 10
    };

    if (quality.rejected) {
      rejectedPages.push({
        title: working.title,
        url: working.url,
        domain: working.domain,
        reason: quality.rejectReason || 'low_quality'
      });
      continue;
    }

    working.sourceClass = validation.sourceClass;
    working.isOfficialWebsite = validation.isOfficialWebsite;
    working.isOfficialSubpage = validation.isOfficialSubpage;
    working.officialConfidence = validation.officialConfidence;
    working.enhancementMeta = meta;
    enhancedCandidates.push(working);
  }

  return {
    candidates: enhancedCandidates,
    attempted,
    enrichedCount,
    rejectedCount: rejectedPages.length,
    rejectedPages,
    skippedReasons,
    latencyMs: Math.round((performance.now() - t0) * 10) / 10
  };
}
