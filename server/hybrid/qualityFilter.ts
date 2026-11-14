import { HybridSearchResult, QueryIntelligence, ResultQualityAssessment } from '../types';
import { tokenizeBoundary } from '../query/intelligence';
import { isValidPublicUrl } from './deduplicator';
import { extractRegistrableHost } from '../entity/officialDiscovery';

const AD_SPAM_PATTERNS = [
  /\b(buy cheap|click here now|limited time offer|act now|free money|guaranteed winner|100% free download|crypto giveaway|casino bonus)\b/i,
  /\b(sponsored post|advertisement|paid partnership|affiliate disclosure|buy now discount code)\b/i,
  /(🔥|💰|🚀|✅){3,}/
];

const ERROR_PAGE_TITLES = [
  /^(404|403|500|502|503)\b/i,
  /\b(page not found|access denied|just a moment\.\.\.|attention required|enable javascript|captcha|robot check)\b/i,
  /^(untitled|home|index of \/|welcome to nginx)$/i
];

/**
 * Phase 6 — Quality Filtering & Low-Value / Spam Detection.
 * Evaluates actual content signals (information density, duplication, spam/ad patterns, URL integrity)
 * WITHOUT unfairly penalizing small or newly launched independent sites.
 */
export function assessResultQuality(
  item: HybridSearchResult,
  intel: QueryIntelligence
): ResultQualityAssessment {
  const flags: string[] = [];
  let qualityScore = 0.78;
  let spamRisk = 0.0;

  // 1. Broken / invalid URL check
  if (!isValidPublicUrl(item.url)) {
    return { passed: false, removeReason: 'invalid_url', qualityScore: 0, spamRisk: 1, flags: ['invalid_url'] };
  }

  const title = (item.title || '').trim();
  const snippet = (item.snippet || '').trim();
  const content = (item.content || '').trim();
  const combinedText = `${snippet} ${content}`.trim();

  // 2. Empty or error-stub page check
  if (!title || title.length < 3) {
    return { passed: false, removeReason: 'empty_title', qualityScore: 0, spamRisk: 0.9, flags: ['empty_title'] };
  }
  if (ERROR_PAGE_TITLES.some((rx) => rx.test(title))) {
    return { passed: false, removeReason: 'error_or_stub_page', qualityScore: 0.05, spamRisk: 0.85, flags: ['error_page'] };
  }
  if (combinedText.length < 18 && !item.location) {
    return { passed: false, removeReason: 'empty_content', qualityScore: 0.1, spamRisk: 0.7, flags: ['empty_content'] };
  }

  // 3. Thin / near-empty snippet penalty (still keeps if title is exact navigational match)
  if (combinedText.length < 45 && !item.location) {
    qualityScore -= 0.22;
    flags.push('thin_content');
  } else if (combinedText.length >= 160) {
    qualityScore += 0.10;
  }

  // 4. Ad-heavy / SEO-spam detection
  for (const rx of AD_SPAM_PATTERNS) {
    if (rx.test(title) || rx.test(combinedText)) {
      spamRisk += 0.42;
      qualityScore -= 0.35;
      flags.push('ad_or_promotional_spam');
      break;
    }
  }

  // 5. Keyword stuffing detection (abnormal token repetition ratio)
  const allTokens = tokenizeBoundary(`${title} ${snippet}`, true);
  if (allTokens.length >= 10) {
    const counts = new Map<string, number>();
    for (const t of allTokens) counts.set(t, (counts.get(t) || 0) + 1);
    const maxFreq = Math.max(...counts.values());
    const uniqueRatio = counts.size / allTokens.length;
    if (maxFreq >= 6 && maxFreq / allTokens.length > 0.28) {
      spamRisk += 0.38;
      qualityScore -= 0.32;
      flags.push('keyword_stuffing');
    } else if (uniqueRatio < 0.32 && allTokens.length > 16) {
      spamRisk += 0.25;
      qualityScore -= 0.20;
      flags.push('repetitive_text');
    }
  }

  // 6. Excessive ALL-CAPS or punctuation noise in title
  const upperChars = (title.match(/[A-Z]/g) || []).length;
  const letterChars = (title.match(/[A-Za-z]/g) || []).length;
  if (letterChars >= 12 && upperChars / letterChars > 0.78) {
    qualityScore -= 0.15;
    spamRisk += 0.15;
    flags.push('excessive_caps_title');
  }

  // 7. Unrelated page from high-volume domain guard:
  // If a high-volume generic site appears in results with zero core token overlap, downrank sharply
  const targetDomain = intel.recognizedEntity?.targetDomain;
  const itemHost = extractRegistrableHost(item.domain || item.url);
  const isTargetDomainMatch = Boolean(targetDomain && itemHost === targetDomain);
  if (intel.tokens.length > 0 && !isTargetDomainMatch && !item.isOfficialWebsite && !item.isOfficialSubpage) {
    const docTokenSet = new Set(tokenizeBoundary(`${title} ${combinedText.slice(0, 800)} ${item.domain}`, true));
    const coreHits = intel.tokens.filter((t) => docTokenSet.has(t)).length;
    const expandedHits = intel.expandedTokens.filter((t) => docTokenSet.has(t)).length;
    if (coreHits === 0 && expandedHits === 0 && !item.location) {
      qualityScore -= 0.35;
      flags.push('zero_topic_overlap');
    }
  }

  // Hard drop clear spam/broken garbage before ranking
  if (spamRisk >= 0.75 || qualityScore <= 0.12) {
    return {
      passed: false,
      removeReason: flags[0] || 'low_quality_spam',
      qualityScore: Math.max(0, qualityScore),
      spamRisk: Math.min(1, spamRisk),
      flags
    };
  }

  return {
    passed: true,
    qualityScore: Math.max(0.15, Math.min(1.0, Math.round(qualityScore * 1000) / 1000)),
    spamRisk: Math.min(1, Math.round(spamRisk * 1000) / 1000),
    flags
  };
}

export function filterLowQualityResults(
  items: HybridSearchResult[],
  intel: QueryIntelligence
): {
  kept: HybridSearchResult[];
  removedCount: number;
  assessments: Map<string, ResultQualityAssessment>;
} {
  const kept: HybridSearchResult[] = [];
  const assessments = new Map<string, ResultQualityAssessment>();
  let removedCount = 0;

  for (const item of items) {
    const q = assessResultQuality(item, intel);
    assessments.set(item.id, q);
    if (!q.passed) {
      removedCount++;
      continue;
    }
    kept.push(item);
  }

  return { kept, removedCount, assessments };
}
