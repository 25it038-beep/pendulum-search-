import {
  GeoLocationContext,
  HybridRankingWeights,
  HybridSearchResult,
  QueryIntelligence,
  ResultQualityAssessment,
  SearchSortMode
} from '../types';
import { haversineKm } from '../geoData';
import { classifyNonOfficialSource, extractRegistrableHost } from '../entity/officialDiscovery';
import { analyzeQueryIntelligence, tokenizeBoundary } from '../query/intelligence';
import { assessResultQuality, filterLowQualityResults } from './qualityFilter';

export const DEFAULT_RANKING_WEIGHTS: HybridRankingWeights = {
  lexical: 0.34,
  semantic: 0.20,
  authority: 0.16,
  freshness: 0.10,
  geographic: 0.08,
  rrf: 0.08,
  completeness: 0.04,
  pendulumRrfWeight: 1.0,
  externalRrfWeight: 1.0
};

let activeWeights: HybridRankingWeights = { ...DEFAULT_RANKING_WEIGHTS };

export function getRankingWeights(): HybridRankingWeights {
  return { ...activeWeights };
}

export function updateRankingWeights(patch: Partial<HybridRankingWeights>): HybridRankingWeights {
  activeWeights = { ...activeWeights, ...patch };
  return getRankingWeights();
}

export type QueryAnalysis = QueryIntelligence;

export function analyzeQuery(query: string, location?: GeoLocationContext, options?: { type?: string; mode?: string }): QueryIntelligence {
  return analyzeQueryIntelligence(query, location, options);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasExactPhrase(haystackLower: string, phraseLower: string): boolean {
  if (!phraseLower || phraseLower.length < 3) return false;
  const rx = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(phraseLower)}($|[^\\p{L}\\p{N}])`, 'iu');
  return rx.test(haystackLower);
}

function computeLexicalScore(
  item: HybridSearchResult,
  intel: QueryIntelligence
): {
  score: number;
  matchedCore: number;
  matchedNonGeoCore: number;
  matchedNonGeoExpanded: number;
  nonGeoTokenCount: number;
  exactTitleMatch: boolean;
} {
  const rawCoreTokens = intel.tokens.length > 0 ? intel.tokens : tokenizeBoundary(intel.correctedQuery, true);
  const targetDomain = intel.recognizedEntity?.targetDomain;
  const filteredUrlTokens = targetDomain
    ? rawCoreTokens.filter((t) => !['http', 'https', 'www'].includes(t))
    : rawCoreTokens;
  const coreTokens = filteredUrlTokens.length > 0 ? filteredUrlTokens : rawCoreTokens;
  if (coreTokens.length === 0) {
    return {
      score: 0.5,
      matchedCore: 0,
      matchedNonGeoCore: 0,
      matchedNonGeoExpanded: 0,
      nonGeoTokenCount: 0,
      exactTitleMatch: false
    };
  }

  const regionalSet = new Set(intel.regionalHints.map((h) => h.toLowerCase()));
  const nonGeoTokens = coreTokens.filter((t) => !regionalSet.has(t) && t !== 'near' && t !== 'nearby');
  const nonGeoExpanded = intel.expandedTokens.filter((t) => !regionalSet.has(t) && t !== 'near' && t !== 'nearby');

  const titleLower = (item.title || '').toLowerCase();
  const headingsText = (item.headings || []).join(' ').toLowerCase();
  const snippetLower = (item.snippet || '').toLowerCase();
  const contentLower = (item.content || '').slice(0, 2500).toLowerCase();
  const domainLower = (item.domain || '').toLowerCase();

  const titleSet = new Set(tokenizeBoundary(titleLower, false));
  const headingSet = new Set(tokenizeBoundary(headingsText, false));
  const snippetSet = new Set(tokenizeBoundary(snippetLower, false));
  const contentSet = new Set(tokenizeBoundary(contentLower, false));
  const domainSet = new Set(tokenizeBoundary(domainLower.replace(/\./g, ' '), true));

  let titleHits = 0;
  let headingHits = 0;
  let snippetHits = 0;
  let contentHits = 0;
  let anyCoreHits = 0;
  let matchedNonGeoCore = 0;
  let matchedNonGeoExpanded = 0;
  let domainHits = 0;

  for (const tok of coreTokens) {
    let hit = false;
    if (titleSet.has(tok)) {
      titleHits++;
      hit = true;
    }
    if (headingSet.has(tok)) {
      headingHits++;
      hit = true;
    }
    if (snippetSet.has(tok)) {
      snippetHits++;
      hit = true;
    }
    if (contentSet.has(tok)) {
      contentHits++;
      hit = true;
    }
    if (domainSet.has(tok)) {
      domainHits++;
      hit = true;
    }
    if (hit) {
      anyCoreHits++;
      if (!regionalSet.has(tok) && tok !== 'near' && tok !== 'nearby') {
        matchedNonGeoCore++;
      }
    }
  }

  for (const etok of nonGeoExpanded) {
    if (titleSet.has(etok) || headingSet.has(etok) || snippetSet.has(etok) || contentSet.has(etok) || domainSet.has(etok)) {
      matchedNonGeoExpanded++;
    }
  }

  const n = coreTokens.length;
  const titleCov = titleHits / n;
  const headingCov = headingHits / n;
  const snippetCov = snippetHits / n;
  const contentCov = contentHits / n;
  const allCorePresentBonus = anyCoreHits === n && n >= 2 ? 0.14 : 0;

  const phraseTarget = (intel.exactPhrases[0] || intel.cleanQuery).toLowerCase();
  const isTargetHostMatch = Boolean(targetDomain && extractRegistrableHost(item.domain || item.url) === targetDomain);
  const exactTitleMatch = hasExactPhrase(titleLower, phraseTarget) || isTargetHostMatch;
  const exactBodyMatch = hasExactPhrase(`${snippetLower} ${contentLower}`, phraseTarget);

  let score =
    titleCov * 0.42 +
    (headingHits > 0 ? headingCov * 0.14 : snippetCov * 0.08) +
    snippetCov * 0.22 +
    contentCov * 0.14 +
    allCorePresentBonus +
    (intel.intent === 'navigational' ? (domainHits / n) * 0.16 : (domainHits / n) * 0.04);

  if (exactTitleMatch) score += 0.22;
  else if (exactBodyMatch) score += 0.10;
  if (isTargetHostMatch) score = Math.max(score, 0.92);

  // Hard ceiling when zero core tokens matched lexically
  if (anyCoreHits === 0 && !exactTitleMatch && !exactBodyMatch) {
    score = Math.min(score, 0.12);
  }

  return {
    score: clamp01(score),
    matchedCore: anyCoreHits,
    matchedNonGeoCore,
    matchedNonGeoExpanded,
    nonGeoTokenCount: nonGeoTokens.length,
    exactTitleMatch
  };
}

function buildDocIdfMap(items: HybridSearchResult[]): Map<string, number> {
  const df = new Map<string, number>();
  const N = Math.max(1, items.length);
  for (const item of items) {
    const toks = new Set(
      tokenizeBoundary(`${item.title} ${(item.headings || []).join(' ')} ${item.snippet} ${item.content.slice(0, 900)}`, false)
    );
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, c] of df.entries()) {
    idf.set(t, Math.max(0.2, Math.log(1 + (N - c + 0.5) / (c + 0.5))));
  }
  return idf;
}

function computeSemanticScore(
  item: HybridSearchResult,
  intel: QueryIntelligence,
  idfMap: Map<string, number>
): number {
  const expanded = intel.expandedTokens;
  if (expanded.length === 0) return 0.5;

  const docTokens = tokenizeBoundary(
    `${item.title} ${(item.headings || []).join(' ')} ${item.snippet} ${item.content.slice(0, 1400)} ${item.category}`,
    false
  );
  if (docTokens.length === 0) return 0.0;

  const docTf = new Map<string, number>();
  for (const t of docTokens) docTf.set(t, (docTf.get(t) || 0) + 1);

  const qVec = new Map<string, number>();
  const coreSet = new Set(intel.tokens);
  for (const t of expanded) {
    const idf = idfMap.get(t) || 0.7;
    const weight = coreSet.has(t) ? idf * 1.25 : idf * 0.55;
    qVec.set(t, weight);
  }

  let dot = 0;
  let qNormSq = 0;
  for (const [t, qw] of qVec.entries()) {
    qNormSq += qw * qw;
    const tf = docTf.get(t) || 0;
    if (tf > 0) {
      const dw = (1 + Math.log(tf)) * (idfMap.get(t) || 0.7);
      dot += qw * dw;
    }
  }

  let dNormSq = 0;
  for (const [t, tf] of docTf.entries()) {
    const dw = (1 + Math.log(tf)) * (idfMap.get(t) || 0.7);
    dNormSq += dw * dw;
  }

  const denom = Math.sqrt(qNormSq) * Math.sqrt(dNormSq);
  const cosine = denom > 1e-6 ? dot / denom : 0;
  // Rescale cosine softly into informative [0,1] band
  return clamp01(Math.min(1, cosine * 1.45));
}

function computeAuthorityScore(
  item: HybridSearchResult,
  intel: QueryIntelligence
): { score: number; reason?: string } {
  const domain = (item.domain || '').toLowerCase();
  const url = (item.url || '').toLowerCase();
  let score = 0.58; // Neutral fair baseline — small/new independent sites are not crushed
  let reason: string | undefined;

  const isGov = /\.(gov|gov\.in|gov\.uk|nic\.in|mil)$/i.test(domain) || /(who\.int|un\.org|europa\.eu|scholarships\.gov\.in)/i.test(domain);
  const isAcademic =
    /\.(edu|ac\.in|ac\.uk|edu\.au)$/i.test(domain) ||
    /(arxiv\.org|openalex\.org|doi\.org|nature\.com|science\.org|nih\.gov|pubmed|ieee\.org|acm\.org|springer\.com|mit\.edu|stanford\.edu|nirfindia\.org)/i.test(domain);
  const isOfficialTech =
    /(docs\.python\.org|python\.org|developer\.mozilla\.org|nodejs\.org|w3\.org|rfc-editor\.org|typescriptlang\.org|kubernetes\.io|react\.dev|github\.com|stackoverflow\.com|npmjs\.com|pypi\.org|nvidia\.com|developers\.google\.com|postgresql\.org|docker\.com|ibm\.com|computerhistory\.org)/i.test(
      domain
    );
  const isWikipedia = /(wikipedia\.org|wikidata\.org|wikimedia\.org)/i.test(domain);
  const isReferenceTrusted = /(britannica\.com|hsaisolutions\.com|hs-ai-studio-4i7i\.vercel\.app|openlibrary\.org|openstreetmap\.org)/i.test(domain);
  const isMajorNews =
    /(reuters\.com|apnews\.com|bbc\.com|bbc\.co\.uk|theguardian\.com|nytimes\.com|arstechnica\.com|technologyreview\.com|thehindu\.com|indianexpress\.com|nature\.com|iea\.org|spaceflightnow\.com)/i.test(
      domain
    );

  const isDefOrHist = intel.intent === 'definition' || intel.intent === 'historical';
  const wikiScore = isDefOrHist ? 0.78 : intel.intent === 'navigational' ? 0.56 : 0.62;

  if (intel.credibilityProfile === 'scientific') {
    if (isAcademic) {
      score = 0.96;
      reason = 'Peer-reviewed / academic authority match';
    } else if (isGov) {
      score = 0.88;
    } else if (isReferenceTrusted) {
      score = 0.84;
    } else if (isOfficialTech) {
      score = 0.80;
    } else if (isWikipedia) {
      score = wikiScore;
    }
  } else if (intel.credibilityProfile === 'government') {
    if (isGov) {
      score = 0.97;
      reason = 'Official government domain match';
    } else if (isAcademic || isReferenceTrusted) {
      score = 0.86;
    } else if (isMajorNews) {
      score = 0.80;
    } else if (isWikipedia) {
      score = wikiScore;
    }
  } else if (intel.credibilityProfile === 'technical') {
    if (isOfficialTech) {
      score = 0.96;
      reason = 'Official technical documentation / repository';
    } else if (url.includes('/docs/') || domain.startsWith('docs.') || domain.startsWith('developer.')) {
      score = 0.90;
    } else if (isAcademic || isReferenceTrusted) {
      score = 0.85;
    } else if (isWikipedia) {
      score = wikiScore;
    }
  } else if (intel.credibilityProfile === 'news') {
    if (isMajorNews) {
      score = 0.94;
      reason = 'Established journalism / primary news source';
    } else if (isGov || isAcademic) {
      score = 0.86;
    } else if (isReferenceTrusted) {
      score = 0.78;
    } else if (isWikipedia) {
      score = Math.min(wikiScore, 0.56);
    }
  } else {
    if (isGov || isAcademic) score = 0.94;
    else if (isOfficialTech) score = 0.92;
    else if (isMajorNews || isReferenceTrusted) score = 0.87;
    else if (isWikipedia) score = wikiScore;
    else if (/\.org$/i.test(domain)) score = 0.74;
  }

  if (item.isOfficialWebsite && (item.officialConfidence || 0) >= 0.62) {
    score = Math.max(score, 0.96);
    reason = 'Verified official organization website';
  } else if (item.isOfficialSubpage && (item.officialConfidence || 0) >= 0.62) {
    score = Math.max(score, 0.91);
    reason = 'Verified official organization subpage';
  }

  const subCount = Object.keys(item.providerSubRanks || {}).length;
  if (subCount > 1) {
    score += Math.min(0.06, (subCount - 1) * 0.03);
  }
  if (item.location?.verified_status === 'verified_physical') {
    score += 0.04;
  }

  return { score: clamp01(score), reason };
}

function computeFreshnessScore(item: HybridSearchResult, intel: QueryIntelligence): number {
  if (intel.freshnessNeed === 'historical') {
    // Historical queries should NOT penalize older authoritative/archival pages
    return 0.80;
  }

  const dateStr = item.updatedAt || item.publishedAt;
  if (!dateStr) {
    if (intel.freshnessNeed === 'high') return item.isLive ? 0.58 : 0.25;
    if (intel.freshnessNeed === 'low') return 0.65;
    return item.isLive ? 0.62 : 0.48;
  }

  const ts = Date.parse(dateStr);
  if (!Number.isFinite(ts)) {
    return intel.freshnessNeed === 'low' ? 0.65 : 0.40;
  }

  const ageDays = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24));

  if (intel.freshnessNeed === 'high') {
    if (ageDays <= 1) return 1.0;
    if (ageDays <= 3) return 0.94;
    if (ageDays <= 7) return 0.88;
    if (ageDays <= 30) return 0.72;
    if (ageDays <= 90) return 0.54;
    if (ageDays <= 365) return 0.36;
    return 0.18;
  }

  if (intel.freshnessNeed === 'low') {
    // Evergreen definitions & tutorials retain high standing regardless of age
    if (ageDays <= 365) return 0.85;
    if (ageDays <= 1095) return 0.78;
    return 0.70;
  }

  // Medium freshness curve
  if (ageDays <= 7) return 0.94;
  if (ageDays <= 30) return 0.84;
  if (ageDays <= 180) return 0.74;
  if (ageDays <= 365) return 0.64;
  if (ageDays <= 1095) return 0.52;
  return 0.40;
}

function computeGeographicScore(
  item: HybridSearchResult,
  intel: QueryIntelligence,
  location?: GeoLocationContext
): { score: number; distanceKm?: number } {
  // Never boost local results for global/scientific/historical/general queries
  if (intel.locationNeed === 'none') {
    return { score: 0.0 };
  }

  const refLat = intel.explicitPlace?.lat ?? (location?.enabled !== false ? location?.lat : undefined);
  const refLon = intel.explicitPlace?.lon ?? (location?.enabled !== false ? location?.lon : undefined);

  let distanceKm: number | undefined;
  if (refLat !== undefined && refLon !== undefined && item.location?.lat !== undefined && item.location?.lon !== undefined) {
    distanceKm = haversineKm(refLat, refLon, Number(item.location.lat), Number(item.location.lon));
  }

  const text = `${item.title} ${item.snippet} ${item.domain} ${JSON.stringify(item.location || {})}`.toLowerCase();
  let hintScore = 0.25;
  for (const hint of intel.regionalHints) {
    if (hint && text.includes(hint)) {
      hintScore += 0.26;
    }
  }
  if (item.domain.endsWith('.in') && intel.regionalHints.includes('india')) {
    hintScore += 0.20;
  }

  if (distanceKm !== undefined) {
    const proximity =
      distanceKm <= 5 ? 1.0 : distanceKm <= 25 ? 0.90 : distanceKm <= 60 ? 0.72 : distanceKm <= 250 ? 0.48 : 0.22;
    return { score: clamp01(Math.max(proximity, hintScore)), distanceKm };
  }

  return { score: clamp01(hintScore) };
}

function computeCompletenessScore(item: HybridSearchResult): number {
  const snippetLen = (item.snippet || '').trim().length;
  const contentLen = (item.content || '').trim().length;
  let score = 0.22;
  if (snippetLen >= 60) score += 0.24;
  if (snippetLen >= 140) score += 0.16;
  if (contentLen >= 200) score += 0.18;
  if ((item.headings?.length || 0) > 0) score += 0.08;
  if (item.publishedAt) score += 0.06;
  if (item.title.length >= 10) score += 0.06;
  return clamp01(score);
}

function buildIntentWeightProfile(intel: QueryIntelligence, base: HybridRankingWeights) {
  let lexical = base.lexical;
  let semantic = base.semantic;
  let authority = base.authority;
  let freshness = base.freshness;
  let geographic = base.geographic;
  const rrf = base.rrf;
  const completeness = base.completeness;

  // Strictly intent-dependent freshness weighting
  if (intel.freshnessNeed === 'high') {
    freshness = 0.28;
    lexical = 0.30;
    semantic = 0.14;
    authority = 0.16;
  } else if (intel.freshnessNeed === 'low') {
    freshness = 0.03;
    lexical = 0.37;
    semantic = 0.22;
    authority = 0.22;
  } else if (intel.freshnessNeed === 'historical') {
    freshness = 0.00;
    lexical = 0.38;
    semantic = 0.22;
    authority = 0.24;
  }

  // Strictly intent-dependent location weighting
  if (intel.locationNeed === 'none') {
    geographic = 0.00;
  } else if (intel.locationNeed === 'explicit_place' || intel.locationNeed === 'near_me') {
    geographic = 0.24;
    lexical = Math.max(0.24, lexical - 0.07);
    semantic = Math.max(0.14, semantic - 0.05);
  } else if (intel.locationNeed === 'regional') {
    geographic = 0.12;
  }

  const total = lexical + semantic + authority + freshness + geographic + rrf + completeness;
  return {
    lexical: lexical / total,
    semantic: semantic / total,
    authority: authority / total,
    freshness: freshness / total,
    geographic: geographic / total,
    rrf: rrf / total,
    completeness: completeness / total
  };
}

/**
 * Pure Stage 1 Reciprocal Rank Fusion over independent sub-provider rank lists:
 * RRF(d) = SUM_{p in subProviders(d)} (1 / (60 + rank_p(d)))
 */
export function computePureRrf(item: HybridSearchResult): number {
  const k = 60;
  let rrf = 0;
  const subEntries = Object.entries(item.providerSubRanks || {});
  if (subEntries.length > 0) {
    for (const [subKey, rank] of subEntries) {
      if (typeof rank === 'number' && rank >= 1) {
        const subWeight =
          subKey === 'primary_web_organic' || subKey === 'searxng_web'
            ? 1.5
            : subKey === 'knowledge_ia'
            ? 1.25
            : 1.0;
        rrf += subWeight / (k + rank);
      }
    }
    return rrf;
  }
  if (item.providerRanks.primaryWeb) rrf += 1.5 / (k + item.providerRanks.primaryWeb);
  if (item.providerRanks.pendulum) rrf += 1 / (k + item.providerRanks.pendulum);
  if (item.providerRanks.external) rrf += 1.15 / (k + item.providerRanks.external);
  return rrf;
}

function computeOriginalRankScore(item: HybridSearchResult): number {
  const pRank = item.providerRanks?.primaryWeb;
  if (typeof pRank === 'number' && pRank >= 1) {
    return clamp01(1 / (1 + 0.14 * (pRank - 1)));
  }
  return 0;
}

export function rankHybridResults(
  items: HybridSearchResult[],
  query: string,
  options: {
    location?: GeoLocationContext;
    sort?: SearchSortMode;
    weights?: HybridRankingWeights;
    intelligence?: QueryIntelligence;
    applyQualityFilter?: boolean;
    applyDomainDiversity?: boolean;
  } = {}
): {
  ranked: HybridSearchResult[];
  analysis: QueryIntelligence;
  filteredOutCount: number;
} {
  const baseWeights = options.weights || activeWeights;
  const analysis = options.intelligence || analyzeQueryIntelligence(query, options.location);

  // Quality assessment & filtering before ranking (Phase 6)
  let candidates = items;
  let filteredOutCount = 0;
  let assessments: Map<string, ResultQualityAssessment>;

  if (options.applyQualityFilter !== false) {
    const qRes = filterLowQualityResults(items, analysis);
    candidates = qRes.kept;
    filteredOutCount = qRes.removedCount;
    assessments = qRes.assessments;
  } else {
    assessments = new Map(items.map((it) => [it.id, assessResultQuality(it, analysis)]));
  }

  // Stage 1: Pure RRF calculation (without mixing incompatible scales)
  const rawRrfScores = candidates.map((item) => computePureRrf(item));
  // Normalize against realistic reference scale (1/(61) * 2.5 ≈ 0.041) rather than noisy pool max alone
  const poolMaxRrf = Math.max(0.033, ...rawRrfScores);

  const idfMap = buildDocIdfMap(candidates);
  const w = buildIntentWeightProfile(analysis, baseWeights);
  const isNavigationalOrg = Boolean(
    analysis.recognizedEntity?.isSpecificEntityQuery || analysis.intent === 'navigational'
  );
  const hasVerifiedOfficialInPool =
    isNavigationalOrg &&
    candidates.some((c) => Boolean(c.isOfficialWebsite && (c.officialConfidence || 0) >= 0.62));
  const targetSubpageIntent = analysis.recognizedEntity?.targetSubpageIntent;
  const hasPrimaryOrganicInPool = candidates.some((c) => typeof c.providerRanks?.primaryWeb === 'number');

  // Stage 2: Intent-aware Multi-Factor Scoring
  const scored = candidates.map((item, idx) => {
    if (!item.sourceClass) {
      item.sourceClass = classifyNonOfficialSource(item.url, item.category);
    }

    const lex = computeLexicalScore(item, analysis);
    const semantic = computeSemanticScore(item, analysis, idfMap);
    const auth = computeAuthorityScore(item, analysis);
    const freshness = computeFreshnessScore(item, analysis);
    const geo = computeGeographicScore(item, analysis, options.location);
    const rawRrf = rawRrfScores[idx];
    const rrf = clamp01(rawRrf / poolMaxRrf);
    const completeness = computeCompletenessScore(item);
    const qualityAssess = assessments.get(item.id) || { passed: true, qualityScore: 0.78, spamRisk: 0, flags: [] };
    const originalRankScore = computeOriginalRankScore(item);

    const baseComposite =
      w.lexical * lex.score +
      w.semantic * semantic +
      w.authority * auth.score +
      w.freshness * freshness +
      w.geographic * geo.score +
      w.rrf * rrf +
      w.completeness * completeness;

    // Relevance gate: prevent high-authority or fresh off-topic pages from outranking genuine answers
    let relevanceGate = 1.0;
    const demotionReasons: string[] = [];
    const promotionReasons: string[] = [];

    const isVerifiedOfficialRoot = Boolean(item.isOfficialWebsite && (item.officialConfidence || 0) >= 0.62);
    const isVerifiedOfficialSub = Boolean(item.isOfficialSubpage && (item.officialConfidence || 0) >= 0.62);

    if (lex.matchedCore === 0 && semantic < 0.16 && !isVerifiedOfficialRoot && !isVerifiedOfficialSub) {
      relevanceGate = 0.32;
      demotionReasons.push('low_lexical_and_semantic_overlap');
    } else if (lex.nonGeoTokenCount > 0 && lex.matchedNonGeoExpanded === 0 && !isVerifiedOfficialRoot && !isVerifiedOfficialSub) {
      relevanceGate = 0.24;
      demotionReasons.push('location_only_match_missing_topic');
    } else if (lex.exactTitleMatch) {
      promotionReasons.push('exact_title_phrase_match');
    }

    if (item.enhancementMeta?.relevanceSignals?.surfaceMentionOnly && !isVerifiedOfficialRoot) {
      relevanceGate = Math.min(relevanceGate, 0.68);
      demotionReasons.push('surface_mention_only');
    }

    if (auth.reason) promotionReasons.push(auth.reason);
    if (Object.keys(item.providerSubRanks || {}).length > 1) {
      promotionReasons.push(`corroborated_across_${Object.keys(item.providerSubRanks).length}_sources`);
    }

    // Quality multiplier derived strictly from Phase 6 quality assessment (0.55 to 1.06)
    let qualityMultiplier = Math.max(0.55, Math.min(1.06, 0.58 + qualityAssess.qualityScore * 0.48));
    if (item.isEnriched && (item.enhancementMeta?.relevanceSignals?.relevanceScore || 0) >= 0.4) {
      qualityMultiplier = Math.min(1.08, qualityMultiplier + 0.03);
      promotionReasons.push('content_enriched_and_verified');
    }
    if (qualityAssess.flags.length > 0) {
      demotionReasons.push(...qualityAssess.flags);
    }

    // Blend primary organic rank preservation carefully when genuine primary organic results exist
    let finalRaw = baseComposite * relevanceGate * qualityMultiplier;
    if (hasPrimaryOrganicInPool) {
      if (originalRankScore > 0 && relevanceGate > 0.5) {
        // Primary organic ranking acts as an important anchor so relevant top organic hits stay strong
        const rankAnchorWeight = item.sourceClass === 'wikipedia' && analysis.intent !== 'definition' && analysis.intent !== 'historical' ? 0.14 : 0.26;
        finalRaw = finalRaw * (1 - rankAnchorWeight) + originalRankScore * rankAnchorWeight;
        promotionReasons.push(`primary_web_rank_#${item.providerRanks.primaryWeb}`);
      } else if (!item.providerRanks.primaryWeb && !isVerifiedOfficialRoot && !isVerifiedOfficialSub && lex.score < 0.72) {
        // Prevent weak local/secondary index records from displacing genuinely relevant primary organic hits
        finalRaw *= 0.84;
        demotionReasons.push('secondary_below_primary_relevance_threshold');
      }
    }

    let final = clamp01(finalRaw);

    // Special Navigational Ranking for Verified Official Organization Websites, Direct Target URLs & Subpages
    const targetDomain = analysis.recognizedEntity?.targetDomain;
    const isDirectTargetDomain = Boolean(targetDomain && extractRegistrableHost(item.domain || item.url) === targetDomain);

    if (targetDomain) {
      if (isDirectTargetDomain) {
        let isTargetPathRoot = Boolean(item.isOfficialWebsite);
        if (!isTargetPathRoot && analysis.recognizedEntity?.targetUrl) {
          try {
            const reqPath = new URL(analysis.recognizedEntity.targetUrl).pathname.replace(/\/+$/, '');
            const itemPath = new URL(item.url).pathname.replace(/\/+$/, '');
            isTargetPathRoot = reqPath === itemPath;
          } catch {}
        }
        const directFloor = isTargetPathRoot ? 0.98 : 0.90;
        final = clamp01(Math.max(final, directFloor));
        promotionReasons.push(isTargetPathRoot ? 'direct_target_url_exact_match' : 'direct_target_domain_subpage');
      } else {
        final = clamp01(final * 0.62);
        demotionReasons.push('non_target_domain_on_direct_url_query');
      }
    }

    if (isNavigationalOrg && (relevanceGate > 0.5 || isDirectTargetDomain)) {
      const offConf = item.officialConfidence || 0.7;
      if (isVerifiedOfficialRoot) {
        const floorScore = targetSubpageIntent ? 0.87 + offConf * 0.06 : 0.90 + offConf * 0.09;
        final = clamp01(Math.max(final, floorScore));
        promotionReasons.push(`official_website_verified(${offConf})`);
      } else if (isVerifiedOfficialSub) {
        const matchesSubIntent = Boolean(targetSubpageIntent && item.discoveredSubpageType === targetSubpageIntent);
        if (matchesSubIntent) {
          final = clamp01(Math.max(final, 0.92 + offConf * 0.07));
          promotionReasons.push(`official_targeted_subpage(${targetSubpageIntent})`);
        } else {
          const rankOrder = Math.max(0, (item.providerRanks.pendulum || 2) - 2);
          final = clamp01(Math.max(final, 0.84 - rankOrder * 0.02));
          promotionReasons.push('official_internal_subpage');
        }
      } else if (hasVerifiedOfficialInPool) {
        if (item.sourceClass === 'wikipedia') {
          final = clamp01(final * 0.74);
          demotionReasons.push('navigational_wikipedia_below_official');
        } else if (item.sourceClass === 'educational_portal' || item.sourceClass === 'directory') {
          final = clamp01(final * 0.52);
          demotionReasons.push(`navigational_${item.sourceClass}_below_official`);
        }
      }
    }

    item.scores = {
      lexical: lex.score,
      semantic,
      freshness,
      authority: auth.score,
      geographic: geo.score,
      rrf,
      completeness,
      quality: qualityAssess.qualityScore,
      originalRank: originalRankScore,
      final
    };

    item.distanceKm = geo.distanceKm;
    item.distance_km = geo.distanceKm;
    item.distance_str = geo.distanceKm !== undefined ? `${geo.distanceKm.toFixed(1)} km` : undefined;
    item.geo_score = geo.score;

    item.score = final;
    item.text_score = lex.score;
    item.semantic_score = semantic;
    item.freshness_score = freshness;
    item.credibility_score = auth.score;

    item._diagnostics = {
      rawRrf: Math.round(rawRrf * 100000) / 100000,
      rrfNormalized: rrf,
      originalRank: item.providerRanks.primaryWeb ?? null,
      originalRankScore,
      providerSubRanks: { ...(item.providerSubRanks || {}) },
      provenance: [...(item.providerDetails || [])],
      qualityFlags: qualityAssess.flags,
      qualityMultiplier: Math.round(qualityMultiplier * 1000) / 1000,
      spamRisk: qualityAssess.spamRisk,
      domainDiversityMultiplier: 1.0,
      promotionReasons,
      demotionReasons,
      isEnriched: Boolean(item.isEnriched),
      validationEvidence: item.enhancementMeta?.validationEvidence,
      weightedComponents: {
        lexical: Math.round(w.lexical * lex.score * 1000) / 1000,
        semantic: Math.round(w.semantic * semantic * 1000) / 1000,
        authority: Math.round(w.authority * auth.score * 1000) / 1000,
        freshness: Math.round(w.freshness * freshness * 1000) / 1000,
        geographic: Math.round(w.geographic * geo.score * 1000) / 1000,
        rrf: Math.round(w.rrf * rrf * 1000) / 1000,
        completeness: Math.round(w.completeness * completeness * 1000) / 1000,
        originalRank: originalRankScore
      }
    };

    return item;
  });

  // Sort Mode Filters
  const sortMode: SearchSortMode = options.sort || 'relevance';
  let filtered = scored;

  if (sortMode === 'pendulum') {
    filtered = scored.filter((r) => r.sources.includes('pendulum'));
  } else if (sortMode === 'external') {
    filtered = scored.filter((r) => r.sources.includes('external'));
  } else if (sortMode === 'local') {
    filtered = scored
      .filter((r) => r.location !== undefined || r.scores.geographic >= 0.45)
      .sort((a, b) => b.scores.geographic - a.scores.geographic || b.scores.final - a.scores.final);
  }

  if (sortMode === 'latest') {
    filtered.sort((a, b) => {
      const tA = a.publishedAt ? Date.parse(a.publishedAt) || 0 : 0;
      const tB = b.publishedAt ? Date.parse(b.publishedAt) || 0 : 0;
      return tB - tA || b.scores.freshness - a.scores.freshness || b.scores.final - a.scores.final;
    });
  } else if (sortMode === 'authority') {
    filtered.sort((a, b) => b.scores.authority - a.scores.authority || b.scores.final - a.scores.final);
  } else if (sortMode !== 'local') {
    filtered.sort((a, b) => b.scores.final - a.scores.final);
  }

  // Stage 3: Controlled Domain Diversity & Wikipedia Non-Dominance on Page 1
  if (options.applyDomainDiversity !== false && sortMode === 'relevance' && filtered.length > 3) {
    const domainSeen = new Map<string, number>();
    let wikiSeen = 0;
    const allowTwoWiki = analysis.intent === 'definition' || analysis.intent === 'historical';
    const wikiCap = allowTwoWiki ? 2 : 1;
    const nonWikiCount = filtered.filter(
      (item) => !(item.sourceClass === 'wikipedia' || (item.domain || '').toLowerCase().includes('wikipedia.org'))
    ).length;

    const kept: HybridSearchResult[] = [];
    for (const item of filtered) {
      const dom = (item.domain || 'unknown').toLowerCase();
      const count = domainSeen.get(dom) || 0;
      domainSeen.set(dom, count + 1);

      const isVerifiedOfficialItem = Boolean(
        (item.isOfficialWebsite || item.isOfficialSubpage) && (item.officialConfidence || 0) >= 0.62
      );
      const isWiki = item.sourceClass === 'wikipedia' || dom.includes('wikipedia.org');

      if (isWiki) {
        wikiSeen += 1;
        if (wikiSeen > wikiCap) {
          // When primary non-Wikipedia sources exist, suppress redundant Wikipedia articles beyond Page 1 cap
          if (nonWikiCount >= 2) {
            filteredOutCount += 1;
            continue;
          }
          const wExcess = wikiSeen - wikiCap;
          const wMult = wExcess === 1 ? 0.50 : 0.34;
          item.scores.final = clamp01(item.scores.final * wMult);
          item.score = item.scores.final;
          if (item._diagnostics) {
            item._diagnostics.domainDiversityMultiplier = wMult;
            item._diagnostics.demotionReasons.push(`wikipedia_page1_cap_${wikiSeen}`);
          }
          kept.push(item);
          continue;
        } else if (!allowTwoWiki && wikiSeen === 1) {
          item.scores.final = clamp01(item.scores.final * 0.84);
          item.score = item.scores.final;
        }
      }

      // Verified official organization domains keep root + 1 targeted subpage at top, then yield Page 1 slots to diverse independent domains
      const softCap = isVerifiedOfficialItem ? 2 : isWiki ? 1 : 2;

      if (count >= softCap) {
        const excess = count - softCap + 1;
        const mult = isVerifiedOfficialItem
          ? excess === 1
            ? 0.56
            : 0.36
          : excess === 1
          ? 0.72
          : excess === 2
          ? 0.55
          : 0.42;
        item.scores.final = clamp01(item.scores.final * mult);
        item.score = item.scores.final;
        if (item._diagnostics) {
          item._diagnostics.domainDiversityMultiplier = mult;
          item._diagnostics.demotionReasons.push(`domain_diversity_soft_cap_${count + 1}`);
        }
      }
      kept.push(item);
    }

    filtered = kept;
    filtered.sort((a, b) => b.scores.final - a.scores.final);
  }

  return { ranked: filtered, analysis, filteredOutCount };
}
