import { HybridSearchResult, ProviderRawResult, SourceId, SourceLabel } from '../types';
import { tokenizeBoundary } from '../query/intelligence';
import { isBlockedHost } from '../providers/duckduckgoProvider';

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'utm_name', 'utm_reader', 'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid',
  'igshid', 'si', 'ref', 'ref_src', 'referrer', 'source', 'spm', 'yclid', '_hsenc',
  '_hsmi', 'amp', 'output', 'rss'
]);

const REDIRECT_PARAM_KEYS = ['uddg', 'url', 'u', 'redirect', 'redir', 'target', 'dest'];

export function isValidPublicUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length < 10) return false;
  if (/^(javascript|data|vbscript|file|about):/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return false;
    if (isBlockedHost(trimmed)) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(rawUrl: string): string {
  try {
    let parsed = new URL(rawUrl.trim());

    // Unwrap known redirect wrappers safely (e.g., ?uddg= or ?url= when target is valid public http/https)
    const isKnownRedirectPath =
      (parsed.hostname.endsWith('duckduckgo.com') && parsed.pathname === '/l/') ||
      /\/(redirect|out|away|go)\/?$/i.test(parsed.pathname);

    if (isKnownRedirectPath) {
      for (const key of REDIRECT_PARAM_KEYS) {
        const candidate = parsed.searchParams.get(key);
        if (candidate && isValidPublicUrl(candidate)) {
          parsed = new URL(candidate);
          break;
        }
      }
    }

    parsed.protocol = 'https:';
    parsed.hostname = parsed.hostname
      .toLowerCase()
      .replace(/^(www\.|m\.|mobile\.|amp\.)+/, '');
    parsed.hash = '';

    for (const key of Array.from(parsed.searchParams.keys())) {
      const kLower = key.toLowerCase();
      if (TRACKING_PARAMS.has(kLower) || kLower.startsWith('utm_')) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();

    // Strip default index filenames and trailing slashes (except root '/')
    parsed.pathname = parsed.pathname.replace(/\/(index\.(html?|php|aspx?)|default\.aspx?)$/i, '');
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    if (!parsed.pathname) parsed.pathname = '/';

    return parsed.toString();
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function samePathPrefix(urlA: string, urlB: string): boolean {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    if (a.hostname !== b.hostname) return false;
    const pathA = a.pathname.replace(/\/+$/, '').toLowerCase();
    const pathB = b.pathname.replace(/\/+$/, '').toLowerCase();
    if (pathA === pathB) return true;
    const stripIndex = (p: string) => p.replace(/\/(index\.(html?|php|asp))$/i, '');
    return stripIndex(pathA) === stripIndex(pathB);
  } catch {
    return false;
  }
}

function isSamePage(existing: HybridSearchResult, incoming: ProviderRawResult, canonicalIncoming: string): boolean {
  if (existing.canonicalUrl === canonicalIncoming) {
    return true;
  }

  if (samePathPrefix(existing.canonicalUrl, canonicalIncoming)) {
    return true;
  }

  const titleSim = jaccardSimilarity(
    new Set(tokenizeBoundary(existing.title, false)),
    new Set(tokenizeBoundary(incoming.title, false))
  );
  // Do not fuzzy-merge distinct URL paths that have clearly different publication dates (> 30 days apart)
  if (existing.publishedAt && incoming.publishedAt) {
    const tA = Date.parse(existing.publishedAt);
    const tB = Date.parse(incoming.publishedAt);
    if (Number.isFinite(tA) && Number.isFinite(tB) && Math.abs(tA - tB) > 30 * 86_400_000) {
      return false;
    }
  }

  const contentA = existing.content || existing.snippet;
  const contentB = incoming.content || incoming.snippet;
  const contentSim =
    contentA.length > 80 && contentB.length > 80
      ? jaccardSimilarity(
          new Set(tokenizeBoundary(contentA.slice(0, 500), false)),
          new Set(tokenizeBoundary(contentB.slice(0, 500), false))
        )
      : 0;

  if (existing.domain === incoming.domain && titleSim >= 0.88 && contentSim >= 0.72) {
    return true;
  }

  if (titleSim >= 0.93 && contentSim >= 0.86) {
    return true;
  }

  return false;
}

function computeSourceLabel(
  sources: SourceId[],
  subProviders: Record<string, number>,
  providerDetails: string[],
  isEnhanced: boolean
): SourceLabel {
  const hasPendulum = sources.includes('pendulum');
  const hasExternal = sources.includes('external');
  const hasDdg =
    providerDetails.some((d) => /duckduckgo/i.test(d)) ||
    'primary_web_organic' in subProviders ||
    'knowledge_ia' in subProviders ||
    'ext_ia' in subProviders ||
    'ext_topic' in subProviders;

  if (hasDdg) {
    return hasPendulum || isEnhanced ? 'DuckDuckGo · Pendulum Enhanced' : 'DuckDuckGo';
  }
  const uniqueSubCount = Object.keys(subProviders).length;
  if (hasPendulum && hasExternal) return 'Multiple Sources';
  if (uniqueSubCount > 1 && hasExternal && !hasPendulum) return 'Multiple Sources';
  if (hasPendulum) return 'Pendulum Indexed';
  return 'External Search';
}

export function deduplicateResults(rawItems: ProviderRawResult[]): {
  items: HybridSearchResult[];
  duplicatesRemoved: number;
  invalidRejected: number;
  rawCount: number;
} {
  const merged: HybridSearchResult[] = [];
  let duplicatesRemoved = 0;
  let invalidRejected = 0;

  for (const raw of rawItems) {
    if (!isValidPublicUrl(raw.url)) {
      invalidRejected++;
      continue;
    }

    const canonical = normalizeUrl(raw.canonicalUrl || raw.url);
    const subKey = raw.subProvider || raw.source || 'external';
    const match = merged.find((m) => isSamePage(m, raw, canonical));

    if (match) {
      duplicatesRemoved++;
      if (!match.sources.includes(raw.source)) {
        match.sources.push(raw.source);
      }
      if (!match.providerDetails.includes(raw.providerDetail)) {
        match.providerDetails.push(raw.providerDetail);
      }

      const prevMainRank = match.providerRanks[raw.source];
      if (prevMainRank === null || prevMainRank === undefined || raw.rank < prevMainRank) {
        match.providerRanks[raw.source] = raw.rank;
      }

      if (typeof raw.originalRank === 'number') {
        if (match.providerRanks.primaryWeb === null || match.providerRanks.primaryWeb === undefined || raw.originalRank < match.providerRanks.primaryWeb) {
          match.providerRanks.primaryWeb = raw.originalRank;
        }
      }

      const prevSubRank = match.providerSubRanks[subKey];
      if (prevSubRank === undefined || raw.rank < prevSubRank) {
        match.providerSubRanks[subKey] = raw.rank;
      }

      // Enrich metadata cleanly without overwriting higher quality fields
      if (raw.content && raw.content.length > match.content.length) {
        match.content = raw.content;
      }
      if (raw.snippet && raw.snippet.length > match.snippet.length) {
        match.snippet = raw.snippet;
      }
      if (raw.headings && raw.headings.length > (match.headings?.length || 0)) {
        match.headings = raw.headings;
      }
      if (!match.publishedAt && raw.publishedAt) {
        match.publishedAt = raw.publishedAt;
        match.published_str = raw.publishedAt;
      }
      if (!match.updatedAt && raw.updatedAt) {
        match.updatedAt = raw.updatedAt;
      }
      if (!match.crawledAt && raw.crawledAt) {
        match.crawledAt = raw.crawledAt;
      }
      if (!match.location && raw.location) {
        match.location = raw.location;
      }
      if (!match.author && raw.author) {
        match.author = raw.author;
      }
      if (!match.publisher && raw.publisher) {
        match.publisher = raw.publisher;
      }
      if (!match.structuredType && raw.structuredType) {
        match.structuredType = raw.structuredType;
      }
      if (raw.isEnriched) {
        match.isEnriched = true;
      }
      if (raw.enhancementMeta && (!match.enhancementMeta || raw.enhancementMeta.enriched)) {
        match.enhancementMeta = raw.enhancementMeta;
      }
      if (raw.isLive) {
        match.isLive = true;
        match.is_live = true;
      }
      if (raw.isOfficialWebsite) {
        match.isOfficialWebsite = true;
        match.isOfficialSubpage = false;
      } else if (raw.isOfficialSubpage && !match.isOfficialWebsite) {
        match.isOfficialSubpage = true;
      }
      if (
        typeof raw.officialConfidence === 'number' &&
        (match.officialConfidence === undefined || raw.officialConfidence > match.officialConfidence)
      ) {
        match.officialConfidence = raw.officialConfidence;
      }
      if (!match.officialOrganizationName && raw.officialOrganizationName) {
        match.officialOrganizationName = raw.officialOrganizationName;
      }
      if (raw.officialVerifiedBy?.length) {
        match.officialVerifiedBy = Array.from(
          new Set([...(match.officialVerifiedBy || []), ...raw.officialVerifiedBy])
        );
      }
      if (
        raw.sourceClass &&
        (!match.sourceClass ||
          raw.sourceClass === 'official_website' ||
          (raw.sourceClass === 'official_subpage' && match.sourceClass !== 'official_website'))
      ) {
        match.sourceClass = raw.sourceClass;
      }
      if (!match.discoveredSubpageType && raw.discoveredSubpageType) {
        match.discoveredSubpageType = raw.discoveredSubpageType;
      }
      if (raw.media?.images?.length) {
        const existingImgs = match.media?.images || [];
        const newImgs = raw.media.images.filter((i) => !existingImgs.some((e) => e.src === i.src));
        match.media = { ...match.media, images: [...existingImgs, ...newImgs] };
        match.images = match.media.images;
      }
      if (raw.media?.videos?.length) {
        const existingVids = match.media?.videos || [];
        const newVids = raw.media.videos.filter((v) => !existingVids.some((e) => e.src === v.src));
        match.media = { ...match.media, videos: [...existingVids, ...newVids] };
        match.videos = match.media.videos;
      }
      match.sourceLabel = computeSourceLabel(
        match.sources,
        match.providerSubRanks,
        match.providerDetails,
        Boolean(match.isEnriched || match.isOfficialWebsite || match.isOfficialSubpage || match.enhancementMeta?.enriched)
      );
      match.source_attribution = match.sourceLabel;
      match.source_provider = match.providerDetails.join(' + ');
      continue;
    }

    const sources: SourceId[] = [raw.source];
    const providerSubRanks: Record<string, number> = { [subKey]: raw.rank };
    const providerDetails = [raw.providerDetail];
    const isEnhanced = Boolean(raw.isEnriched || raw.isOfficialWebsite || raw.isOfficialSubpage || raw.enhancementMeta?.enriched);
    const sourceLabel = computeSourceLabel(sources, providerSubRanks, providerDetails, isEnhanced);
    const images = raw.media?.images || [];
    const videos = raw.media?.videos || [];

    merged.push({
      id: raw.id,
      title: raw.title,
      url: raw.url,
      canonicalUrl: canonical,
      snippet: raw.snippet,
      domain: raw.domain,
      content: raw.content || raw.snippet,
      headings: raw.headings || [],
      publishedAt: raw.publishedAt || null,
      updatedAt: raw.updatedAt || null,
      indexedAt: raw.indexedAt || null,
      crawledAt: raw.crawledAt || null,
      sources,
      sourceLabel,
      providerDetails: [raw.providerDetail],
      providerRanks: {
        pendulum: raw.source === 'pendulum' ? raw.rank : null,
        external: raw.source === 'external' ? raw.rank : null,
        primaryWeb: typeof raw.originalRank === 'number' ? raw.originalRank : null
      },
      providerSubRanks,
      scores: {
        lexical: 0,
        semantic: 0,
        freshness: 0,
        authority: 0,
        geographic: 0,
        rrf: 0,
        completeness: 0,
        quality: 0,
        final: 0
      },
      favicon: raw.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(raw.domain)}&sz=64`,
      category: raw.category || 'general',
      language: raw.language || 'en',
      isLive: Boolean(raw.isLive),
      location: raw.location,
      isOfficialWebsite: raw.isOfficialWebsite,
      isOfficialSubpage: raw.isOfficialSubpage,
      officialConfidence: raw.officialConfidence,
      officialOrganizationName: raw.officialOrganizationName,
      officialVerifiedBy: raw.officialVerifiedBy,
      sourceClass: raw.sourceClass,
      discoveredSubpageType: raw.discoveredSubpageType,
      author: raw.author,
      publisher: raw.publisher,
      structuredType: raw.structuredType,
      isEnriched: raw.isEnriched,
      enhancementMeta: raw.enhancementMeta,
      media: { images, videos },
      // Legacy aliases
      source: raw.domain,
      score: 0,
      text_score: 0,
      semantic_score: 0,
      freshness_score: 0,
      credibility_score: 0,
      published_str: raw.publishedAt || undefined,
      indexed_str: sourceLabel,
      is_live: Boolean(raw.isLive),
      source_type: raw.source === 'pendulum' ? 'hs_indexed' : 'external_partner',
      source_provider: raw.providerDetail,
      source_category: raw.source === 'pendulum' ? 'hs_indexed' : 'external_partner',
      original_publisher: raw.domain,
      source_attribution: sourceLabel,
      images,
      videos
    });
  }

  return {
    items: merged,
    duplicatesRemoved,
    invalidRejected,
    rawCount: rawItems.length
  };
}
