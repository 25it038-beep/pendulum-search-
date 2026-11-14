import { fetchWithTimeout, isBlockedHost, stripHtml } from '../providers/duckduckgoProvider';
import {
  EntityPossibleMatch,
  OfficialVerificationResult,
  ProviderRawResult,
  QueryIntelligence,
  RecognizedEntity,
  SourceClass
} from '../types';
import {
  isEntityRecordStale,
  lookupPersistedEntities,
  markEntityVerificationStatus,
  normalizeEntityKey,
  PersistedEntityRecord,
  PersistedInternalPage,
  upsertDiscoveredEntity
} from './entityKnowledgeStore';
import { tokenizeBoundary } from '../query/intelligence';
import { TtlCache } from '../metrics';

const WIKIPEDIA_HOSTS = [
  'wikipedia.org',
  'wikidata.org',
  'wikimedia.org',
  'britannica.com'
];

const EDUCATIONAL_PORTAL_HOSTS = [
  'shiksha.com',
  'careers360.com',
  'collegedunia.com',
  'getmyuni.com',
  'collegesearch.in',
  'targetstudy.com',
  'findcollegereviews.com',
  'jagranjosh.com',
  'sarvgyan.com',
  'collegebatch.com',
  'collegedekho.com',
  'admissionnews.com',
  'topuniversities.com',
  'timeshighereducation.com',
  'usnews.com',
  'niche.com',
  'zollege.in',
  'eduvidya.com'
];

const DIRECTORY_AND_SOCIAL_HOSTS = [
  'justdial.com',
  'sulekha.com',
  'indiamart.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'youtu.be',
  'crunchbase.com',
  'glassdoor.com',
  'glassdoor.co.in',
  'ambitionbox.com',
  'zoominfo.com',
  'openstreetmap.org',
  'yelp.com',
  'tripadvisor.com',
  'quora.com',
  'reddit.com',
  'medium.com',
  'mapquest.com',
  'foursquare.com',
  'zaubacorp.com',
  'tofler.in'
];

const ACADEMIC_HOSTS = [
  'arxiv.org',
  'openalex.org',
  'doi.org',
  'crossref.org',
  'ieee.org',
  'acm.org',
  'springer.com',
  'sciencedirect.com',
  'researchgate.net',
  'semanticscholar.org'
];

const MAJOR_NEWS_HOSTS = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'theguardian.com',
  'nytimes.com',
  'thehindu.com',
  'indianexpress.com',
  'timesofindia.indiatimes.com',
  'ndtv.com',
  'techcrunch.com',
  'theverge.com',
  'arstechnica.com',
  'wired.com',
  'bloomberg.com',
  'forbes.com'
];

function hostMatches(domain: string, list: string[]): boolean {
  const clean = domain.toLowerCase().replace(/^www\./, '');
  return list.some((h) => clean === h || clean.endsWith(`.${h}`));
}

export function extractRegistrableHost(urlOrDomain: string): string {
  try {
    const raw = urlOrDomain.includes('://') ? new URL(urlOrDomain).hostname : urlOrDomain;
    return raw.toLowerCase().replace(/^www\./, '');
  } catch {
    return urlOrDomain.toLowerCase().replace(/^www\./, '');
  }
}

export function classifyNonOfficialSource(urlStr: string, category?: string): SourceClass {
  const domain = extractRegistrableHost(urlStr);
  if (hostMatches(domain, WIKIPEDIA_HOSTS)) return 'wikipedia';
  if (hostMatches(domain, EDUCATIONAL_PORTAL_HOSTS)) return 'educational_portal';
  if (hostMatches(domain, DIRECTORY_AND_SOCIAL_HOSTS)) return 'directory';
  if (hostMatches(domain, ACADEMIC_HOSTS)) return 'academic';
  if (hostMatches(domain, MAJOR_NEWS_HOSTS) || category === 'news') return 'news';
  return 'web';
}

const CITATION_AND_ARCHIVE_HOSTS = [
  'archive.org',
  'web.archive.org',
  'toolforge.org',
  'geohack.toolforge.org',
  'wmflabs.org',
  'worldcat.org',
  'viaf.org',
  'orcid.org',
  'isni.org',
  'loc.gov',
  'isteonline.in',
  'aicte-india.org',
  'nirfindia.org',
  'naac.gov.in',
  'ugc.ac.in'
];

export function isDisqualifiedOfficialHost(domain: string): boolean {
  const clean = extractRegistrableHost(domain);
  return (
    hostMatches(clean, WIKIPEDIA_HOSTS) ||
    hostMatches(clean, EDUCATIONAL_PORTAL_HOSTS) ||
    hostMatches(clean, DIRECTORY_AND_SOCIAL_HOSTS) ||
    hostMatches(clean, ACADEMIC_HOSTS) ||
    hostMatches(clean, MAJOR_NEWS_HOSTS) ||
    hostMatches(clean, CITATION_AND_ARCHIVE_HOSTS) ||
    /\.(blogspot|wordpress)\.com$/i.test(clean)
  );
}

/**
 * Computes honest token/abbreviation alignment between an entity name and a candidate org/website label.
 * Prevents false registry matches (e.g. ROR matching "Rems-Murr-Kliniken" for "RMK Engineering College").
 */
export function computeEntityNameSimilarity(entity: RecognizedEntity, candidateLabel: string): number {
  if (!candidateLabel) return 0;
  const cleanEntity = entity.normalizedName;
  const cleanCand = candidateLabel
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanCand) return 0;
  if (cleanCand === cleanEntity) return 1.0;

  const stop = new Set([
    'of', 'the', 'and', 'for', 'in', 'at', 'on', 'welcome', 'to', 'home', 'official', 'website', 'portal',
    'autonomous', 'institution', 'india', 'united', 'states', 'italy', 'uk'
  ]);
  const eTokens = cleanEntity.split(' ').filter((t) => t.length >= 2 && !stop.has(t));
  const cTokens = cleanCand.split(' ').filter((t) => t.length >= 2 && !stop.has(t));
  const cSet = new Set(cTokens);

  if (eTokens.length === 0) return 0;

  if (cleanCand.includes(cleanEntity)) {
    const extraCount = Math.max(0, cTokens.length - eTokens.length);
    return extraCount === 0 ? 1.0 : Math.max(0.72, Math.round((1.0 - extraCount * 0.14) * 100) / 100);
  }

  // Match whole tokens or abbreviations/initials
  let matched = 0;
  const fullPhraseExpansion = entity.abbreviations.some((a) => {
    const na = a.toLowerCase().replace(/\./g, '').trim();
    return na.includes(' ') && cleanCand.includes(na);
  });

  for (const et of eTokens) {
    if (cSet.has(et)) {
      matched += 1;
      continue;
    }
    if (fullPhraseExpansion && et.length <= 4) {
      matched += 0.98;
      continue;
    }
    if (entity.abbreviations.some((a) => cSet.has(a.toLowerCase().replace(/\./g, '')))) {
      matched += 0.65;
    }
  }

  // Also check if candidate's significant initials match any abbreviation of entity
  const candInitials = cTokens.map((t) => t[0]).join('');
  const entityInitials = eTokens.map((t) => t[0]).join('');
  if (
    (entity.abbreviations.some((a) => a.toLowerCase().replace(/\./g, '') === candInitials) && candInitials.length >= 2) ||
    (eTokens[0] && eTokens[0].length >= 2 && eTokens[0] === candInitials)
  ) {
    matched += 1.0;
  }

  // Distinct first identifier check (e.g. "rmk" in "RMK Engineering College" MUST appear in candidate if multi-word institutional name)
  const leadToken = eTokens[0];
  const hasLeadToken =
    cSet.has(leadToken) ||
    cleanCand.includes(leadToken) ||
    candInitials.startsWith(leadToken) ||
    fullPhraseExpansion ||
    (leadToken.length >= 2 && entity.abbreviations.some((a) => cleanCand.includes(a.toLowerCase().replace(/\./g, ''))));

  const candWordInitialsStrict = cleanCand.split(' ').filter(Boolean).map((w) => w[0]).join('');
  const matchesWordInitials = leadToken.length >= 2 && candWordInitialsStrict === leadToken;

  if (!hasLeadToken && !matchesWordInitials && entityInitials !== candInitials) {
    return 0.1;
  }

  // Guard against false acronym coincidence (e.g. "Rems-Murr-Klinikum" for "RMK College")
  const coreInstitutionalWords = eTokens.filter((t) =>
    ['engineering', 'technology', 'university', 'college', 'school', 'hospital', 'government', 'institute', 'madras'].includes(t)
  );
  if (coreInstitutionalWords.length > 0 && !cTokens.includes(leadToken) && !fullPhraseExpansion) {
    const instMatches = coreInstitutionalWords.filter((w) => cSet.has(w)).length;
    if (instMatches === 0) {
      return 0.15;
    }
  }

  const rawRecall = Math.min(1, matched / eTokens.length);
  const extraTokens = Math.max(0, cTokens.length - eTokens.length);
  if (!fullPhraseExpansion && extraTokens >= 2) {
    return Math.max(0.15, Math.round((rawRecall - extraTokens * 0.08) * 100) / 100);
  }
  return rawRecall;
}

export function domainExactAcronymMatch(domain: string, entity: RecognizedEntity): boolean {
  const host = extractRegistrableHost(domain).split('.')[0] || '';
  if (!host) return false;
  const words = entity.normalizedName.split(' ').filter((w) => !['of', 'and', 'the', 'for', 'in', 'at'].includes(w));
  if (words.length >= 2) {
    const firstPlusInitials = `${words[0]}${words.slice(1).map((w) => w[0]).join('')}`;
    const allInitials = words.map((w) => w[0]).join('');
    if (host === firstPlusInitials || (allInitials.length >= 3 && host === allInitials)) {
      return true;
    }
  }
  return false;
}

export function domainContainsEntityIdentity(domain: string, entity: RecognizedEntity): boolean {
  const host = extractRegistrableHost(domain).split('.')[0] || '';
  if (!host) return false;
  const fullHost = extractRegistrableHost(domain);
  const stop = new Set(['of', 'the', 'and', 'for', 'in', 'at', 'college', 'university', 'institute', 'engineering', 'technology', 'school', 'hospital', 'government']);
  const distinctive = entity.normalizedName
    .split(' ')
    .filter((t) => t.length >= 2 && !stop.has(t));

  for (const d of distinctive) {
    if (d.length >= 3 && fullHost.includes(d)) return true;
  }
  for (const abbr of entity.abbreviations) {
    const cleanAbbr = abbr.toLowerCase().replace(/\./g, '');
    if (cleanAbbr.length >= 2 && host.includes(cleanAbbr)) return true;
  }
  // Multi-word initial prefix in host, e.g. RMK Engineering College -> rmkec, IIT Madras -> iitm, Tamil Nadu -> tn
  const words = entity.normalizedName.split(' ').filter((w) => !['of', 'and', 'the', 'for'].includes(w));
  if (words.length >= 2) {
    const firstPlusInitials = `${words[0]}${words.slice(1).map((w) => w[0]).join('')}`;
    const allInitials = words.map((w) => w[0]).join('');
    if (host.includes(firstPlusInitials) || (allInitials.length >= 3 && host.includes(allInitials))) {
      return true;
    }
    if (words[0].length >= 4 && host.includes(words[0].slice(0, 4)) && host.includes(words[1]?.slice(0, 3) || '')) {
      return true;
    }
  }
  return false;
}

export interface VerificationEvidenceInput {
  url: string;
  entity: RecognizedEntity;
  registrySources: string[]; // e.g. ['wikidata_p856', 'openalex_institution', 'wikipedia_extlink']
  registryOrgName?: string;
  wikipediaReferenced?: boolean;
  liveTitle?: string;
  liveH1?: string;
  liveSchemaOrgName?: string;
  liveText?: string;
  liveReachable?: boolean;
  hasMatchingContactEmail?: boolean;
  isSubpage?: boolean;
}

/**
 * Pure, testable Official Domain Verification Component.
 * Evaluates multiple independent verification signals and prevents classifying
 * directories, portals, or lookalikes as official merely due to URL string overlap.
 */
export function verifyOfficialDomainCandidate(input: VerificationEvidenceInput): OfficialVerificationResult {
  const domain = extractRegistrableHost(input.url);
  if (!domain || isBlockedHost(input.url) || isDisqualifiedOfficialHost(domain)) {
    return {
      domain,
      url: input.url,
      isOfficialWebsite: false,
      isOfficialSubpage: false,
      confidence: 0,
      sourceClass: classifyNonOfficialSource(input.url),
      signals: ['disqualified_third_party_or_blocked_host'],
      verifiedBy: []
    };
  }

  const signals: string[] = [];
  const verifiedBy = Array.from(new Set(input.registrySources));
  let confidence = 0;

  // 1. Registry / Directory Authority Linkage (e.g. Wikidata P856, OpenAlex, ROR, OSM website)
  const hasWikidata = verifiedBy.includes('wikidata_p856');
  const hasOpenAlex = verifiedBy.includes('openalex_institution');
  const hasRor = verifiedBy.includes('ror_registry');
  const hasOsm = verifiedBy.includes('osm_website');
  const hasPersisted = verifiedBy.includes('pendulum_verified_store');

  const registryNameSim = input.registryOrgName
    ? computeEntityNameSimilarity(input.entity, input.registryOrgName)
    : 0.7;

  const hasDirectLiveFetch = verifiedBy.includes('direct_url_live_fetch') && Boolean(input.liveReachable);

  if ((hasWikidata || hasOpenAlex || hasRor || hasOsm || hasPersisted || hasDirectLiveFetch) && (registryNameSim >= 0.45 || hasDirectLiveFetch)) {
    const regCount = [hasWikidata, hasOpenAlex, hasRor, hasOsm, hasPersisted, hasDirectLiveFetch].filter(Boolean).length;
    const baseReg = hasDirectLiveFetch ? 0.64 : hasWikidata && registryNameSim >= 0.85 ? 0.40 : 0.36;
    confidence += Math.min(0.72, baseReg + (regCount - 1) * 0.14);
    signals.push(`authoritative_registry_linkage(${verifiedBy.join(',')})`);
  }

  // 2. Encyclopedia / Institutional Reference Link
  if (input.wikipediaReferenced) {
    confidence += 0.18;
    signals.push('wikipedia_external_reference');
    if (!verifiedBy.includes('wikipedia_extlink')) verifiedBy.push('wikipedia_extlink');
  }

  // 3. Live Website Content & Title Identity Verification
  const liveLabel = [input.liveSchemaOrgName, input.liveTitle, input.liveH1].filter(Boolean).join(' ');
  const liveTitleSim = liveLabel ? computeEntityNameSimilarity(input.entity, liveLabel) : 0;
  if (liveTitleSim >= 0.5) {
    confidence += 0.24;
    signals.push('live_page_identifies_organization');
  } else if (input.liveText && computeEntityNameSimilarity(input.entity, input.liveText.slice(0, 800)) >= 0.6) {
    confidence += 0.14;
    signals.push('live_body_identifies_organization');
  }

  // 4. Domain Name Structural Identity
  const domainMatches = domainContainsEntityIdentity(domain, input.entity);
  if (domainMatches) {
    confidence += 0.12;
    signals.push('domain_matches_entity_identity');
  }

  // 5. Institutional TLD & Contact Info Match (.ac.in, .edu, .gov, matching @domain email)
  const hasInstitutionalTld = /\.(gov|gov\.in|nic\.in|ac\.in|edu|edu\.in|ac\.uk|edu\.au)$/i.test(domain);
  if (hasInstitutionalTld) {
    confidence += 0.1;
    signals.push('verified_institutional_tld');
  }
  if (input.hasMatchingContactEmail) {
    confidence += 0.08;
    signals.push('official_domain_contact_match');
  }

  confidence = Math.round(Math.min(0.99, confidence) * 1000) / 1000;

  // CRITICAL: Do NOT classify as official merely because URL contains entity name!
  const hasIndependentEvidence =
    hasWikidata ||
    hasOpenAlex ||
    hasRor ||
    hasOsm ||
    hasPersisted ||
    hasDirectLiveFetch ||
    Boolean(input.wikipediaReferenced && liveTitleSim >= 0.45);

  const isVerified = hasIndependentEvidence && confidence >= 0.62;

  return {
    domain,
    url: input.url,
    isOfficialWebsite: isVerified && !input.isSubpage,
    isOfficialSubpage: isVerified && Boolean(input.isSubpage),
    confidence,
    sourceClass: isVerified
      ? input.isSubpage
        ? 'official_subpage'
        : 'official_website'
      : 'web',
    organizationName: input.registryOrgName || input.liveSchemaOrgName || input.entity.name,
    signals,
    verifiedBy
  };
}

// -----------------------------------------------------------------------------
// Discovery Caches & Robots.txt Policy Helpers
// -----------------------------------------------------------------------------
const discoveryCache = new TtlCache<OfficialDiscoveryBundle>(10 * 60_000, 120);
const robotsCache = new TtlCache<{ disallow: string[]; sitemaps: string[] }>(30 * 60_000, 200);

interface RobotsPolicy {
  disallow: string[];
  sitemaps: string[];
}

export function parseRobotsTxt(raw: string): RobotsPolicy {
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  let inStarGroup = false;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const sitemapMatch = line.match(/^sitemap:\s*(.+)$/i);
    if (sitemapMatch?.[1]) {
      sitemaps.push(sitemapMatch[1].trim());
      continue;
    }
    const uaMatch = line.match(/^user-agent:\s*(.+)$/i);
    if (uaMatch?.[1]) {
      const ua = uaMatch[1].trim().toLowerCase();
      inStarGroup = ua === '*' || ua.includes('pendulumsearchbot');
      continue;
    }
    if (inStarGroup) {
      const disMatch = line.match(/^disallow:\s*(.*)$/i);
      if (disMatch && disMatch[1].trim()) {
        disallow.push(disMatch[1].trim());
      }
    }
  }
  return { disallow, sitemaps };
}

export function isPathAllowedByRobots(pathname: string, disallowRules: string[]): boolean {
  for (const rule of disallowRules) {
    if (rule === '/') return false;
    if (rule && pathname.startsWith(rule)) return false;
  }
  return true;
}

async function fetchRobotsPolicy(origin: string): Promise<RobotsPolicy> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, { headers: { Accept: 'text/plain' } }, 1500);
    if (res.ok) {
      const txt = await res.text();
      const parsed = parseRobotsTxt(txt);
      robotsCache.set(origin, parsed);
      return parsed;
    }
  } catch {}
  const empty = { disallow: [], sitemaps: [] };
  robotsCache.set(origin, empty);
  return empty;
}

const SUBPAGE_LINK_RULES: Array<{ type: string; pattern: RegExp }> = [
  { type: 'admissions', pattern: /admission|apply|cutoff|eligibilit/i },
  { type: 'departments', pattern: /department|academic|school-of|faculty-of|cse|ece/i },
  { type: 'courses', pattern: /course|program|curriculum|degree|syllabus/i },
  { type: 'placements', pattern: /placement|career|recruiter|training/i },
  { type: 'faculty', pattern: /faculty|professor|people|staff/i },
  { type: 'contact', pattern: /contact|reach-us|location/i },
  { type: 'news', pattern: /news|event|announcement|notice|blog/i },
  { type: 'docs', pattern: /docs|documentation|developer|api|guide/i },
  { type: 'about', pattern: /about|overview|accreditation|naac|nirf/i }
];

interface LivePageMetadata {
  reachable: boolean;
  finalUrl: string;
  canonicalUrl: string;
  title: string;
  description: string;
  h1: string;
  schemaOrgName: string;
  bodyText: string;
  hasMatchingContactEmail: boolean;
  discoveredLinks: Array<{ url: string; label: string; subpageType: string }>;
}

async function fetchPageHtmlResilient(candidateUrl: string, timeoutMs = 2600): Promise<{ ok: boolean; finalUrl: string; html: string }> {
  const variants = [candidateUrl];
  if (candidateUrl.startsWith('https://')) {
    variants.push(candidateUrl.replace(/^https:\/\//i, 'http://'));
  } else if (candidateUrl.startsWith('http://')) {
    variants.unshift(candidateUrl.replace(/^http:\/\//i, 'https://'));
  }

  for (const url of variants) {
    if (isBlockedHost(url)) continue;
    try {
      const res = await fetchWithTimeout(
        url,
        { headers: { Accept: 'text/html,application/xhtml+xml' } },
        timeoutMs
      );
      if (res.ok) {
        const html = await res.text();
        if (html && html.length > 80) {
          return { ok: true, finalUrl: res.url || url, html };
        }
      }
    } catch {}
  }
  return { ok: false, finalUrl: candidateUrl, html: '' };
}

function parseLiveHtmlMetadata(rawUrl: string, html: string, hostDomain: string): LivePageMetadata {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]).slice(0, 140) : hostDomain;
  const metaDesc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    '';
  const canonical =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || rawUrl;
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? stripHtml(h1Match[1]).slice(0, 120) : '';

  let schemaOrgName = '';
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1]);
      const items = Array.isArray(obj) ? obj : obj['@graph'] || [obj];
      for (const item of items) {
        if (item?.name && /Organization|College|University|Corporation|Government|Hospital|School/i.test(String(item['@type'] || ''))) {
          schemaOrgName = String(item.name);
          break;
        }
      }
    } catch {}
    if (schemaOrgName) break;
  }

  const bodyText = stripHtml(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  ).slice(0, 3500);

  const hasMatchingContactEmail = new RegExp(`@[a-z0-9.-]*${hostDomain.replace(/\./g, '\\.')}`, 'i').test(html);

  // Extract internal links matching admissions/departments/placements/contact/docs/etc.
  const discoveredLinks: Array<{ url: string; label: string; subpageType: string }> = [];
  const seenUrls = new Set<string>();
  let baseOrigin = '';
  try {
    baseOrigin = new URL(rawUrl).origin;
  } catch {}

  if (baseOrigin) {
    for (const am of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = am[1].trim();
      const label = stripHtml(am[2]).slice(0, 70);
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
      let resolved: URL;
      try {
        resolved = new URL(href, rawUrl);
      } catch {
        continue;
      }
      if (extractRegistrableHost(resolved.hostname) !== extractRegistrableHost(hostDomain)) continue;
      if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|css|js)$/i.test(resolved.pathname)) continue;
      if (resolved.pathname === '/' || resolved.pathname === new URL(rawUrl).pathname) continue;

      const combined = `${resolved.pathname} ${label}`;
      for (const rule of SUBPAGE_LINK_RULES) {
        if (rule.pattern.test(combined)) {
          const cleanUrl = `${resolved.origin}${resolved.pathname}${resolved.search}`;
          if (!seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl);
            discoveredLinks.push({ url: cleanUrl, label: label || rule.type, subpageType: rule.type });
          }
          break;
        }
      }
      if (discoveredLinks.length >= 16) break;
    }
  }

  return {
    reachable: true,
    finalUrl: rawUrl,
    canonicalUrl: canonical.startsWith('http') ? canonical : rawUrl,
    title,
    description: stripHtml(metaDesc).slice(0, 320) || bodyText.slice(0, 260),
    h1,
    schemaOrgName,
    bodyText,
    hasMatchingContactEmail,
    discoveredLinks
  };
}

async function fetchSitemapSubpageLinks(
  origin: string,
  sitemapUrls: string[],
  hostDomain: string,
  disallow: string[]
): Promise<Array<{ url: string; label: string; subpageType: string }>> {
  const targets = sitemapUrls.length > 0 ? sitemapUrls.slice(0, 2) : [`${origin}/sitemap.xml`];
  const found: Array<{ url: string; label: string; subpageType: string }> = [];

  for (const smUrl of targets) {
    if (isBlockedHost(smUrl)) continue;
    try {
      const res = await fetchWithTimeout(smUrl, { headers: { Accept: 'application/xml,text/xml' } }, 1600);
      if (!res.ok) continue;
      const xml = await res.text();
      for (const lm of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        const loc = lm[1].trim();
        try {
          const u = new URL(loc);
          if (extractRegistrableHost(u.hostname) !== extractRegistrableHost(hostDomain)) continue;
          if (!isPathAllowedByRobots(u.pathname, disallow)) continue;
          for (const rule of SUBPAGE_LINK_RULES) {
            if (rule.pattern.test(u.pathname)) {
              found.push({ url: loc, label: rule.type, subpageType: rule.type });
              break;
            }
          }
        } catch {}
        if (found.length >= 10) break;
      }
      if (found.length > 0) break;
    } catch {}
  }
  return found;
}

export interface OfficialDiscoveryBundle {
  entity: RecognizedEntity;
  discoveryQueries: string[];
  possibleMatches: EntityPossibleMatch[];
  verifiedRecord: OfficialVerificationResult | null;
  results: ProviderRawResult[];
  latencyMs: number;
}

interface CandidateAggregation {
  domain: string;
  url: string;
  orgName: string;
  description?: string;
  country?: string;
  region?: string;
  location?: string;
  registrySources: Set<string>;
  wikipediaReferenced: boolean;
  similarity: number;
}

function addCandidate(
  map: Map<string, CandidateAggregation>,
  rawUrl: string,
  sourceTag: string,
  orgName: string,
  entity: RecognizedEntity,
  meta?: { description?: string; country?: string; region?: string; location?: string; wikipediaReferenced?: boolean }
) {
  if (!rawUrl || isBlockedHost(rawUrl)) return;
  let normalizedUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
  const dom = extractRegistrableHost(normalizedUrl);
  if (!dom || isDisqualifiedOfficialHost(dom)) return;

  const sim = computeEntityNameSimilarity(entity, orgName);
  // Strict similarity gate so false-positive fuzzy matches (e.g. Rems-Murr-Kliniken for RMK Engineering College) never enter!
  if (sim < 0.42 && !domainContainsEntityIdentity(dom, entity)) return;

  const existing = map.get(dom);
  if (existing) {
    existing.registrySources.add(sourceTag);
    if (meta?.wikipediaReferenced) existing.wikipediaReferenced = true;
    if (sim > existing.similarity) {
      existing.similarity = sim;
      existing.orgName = orgName;
    }
    if (!existing.description && meta?.description) existing.description = meta.description;
    // Prefer root homepage URL over deep path when aggregating same domain
    try {
      const curPath = new URL(existing.url).pathname;
      const newPath = new URL(normalizedUrl).pathname;
      if (newPath.length < curPath.length) existing.url = normalizedUrl;
    } catch {}
    return;
  }

  map.set(dom, {
    domain: dom,
    url: normalizedUrl,
    orgName,
    description: meta?.description,
    country: meta?.country,
    region: meta?.region,
    location: meta?.location,
    registrySources: new Set([sourceTag]),
    wikipediaReferenced: Boolean(meta?.wikipediaReferenced),
    similarity: sim
  });
}

/**
 * Generates explicit retrieval queries for an identified entity.
 */
export function buildOfficialDiscoveryQueries(entity: RecognizedEntity, candidateDomain?: string): string[] {
  const queries = [
    `${entity.name} official website`,
    `${entity.name} contact`,
    ...(entity.region ? [`${entity.name} ${entity.region}`] : entity.country ? [`${entity.name} ${entity.country}`] : []),
    ...(candidateDomain ? [`site:${candidateDomain} ${entity.name}`] : [])
  ];
  return Array.from(new Set(queries));
}

function persistedRecordToProviderResults(
  rec: PersistedEntityRecord,
  entity: RecognizedEntity
): ProviderRawResult[] {
  const results: ProviderRawResult[] = [];
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(rec.officialDomain)}&sz=64`;

  results.push({
    id: `official-root-${rec.officialDomain}`,
    title: `${rec.name} — Official Website`,
    url: rec.officialUrl,
    canonicalUrl: rec.officialUrl,
    snippet: `Official website of ${rec.name}${rec.location || rec.region ? ` (${[rec.location, rec.region, rec.country].filter(Boolean).join(', ')})` : ''}. Verified domain: ${rec.officialDomain}.`,
    domain: rec.officialDomain,
    content: `${rec.name} official website ${rec.aliases.join(' ')} ${rec.officialDomain}`,
    headings: [rec.name, 'Official Website'],
    publishedAt: null,
    indexedAt: rec.lastVerifiedAt,
    crawledAt: rec.lastVerifiedAt,
    source: 'pendulum',
    subProvider: 'official_entity_discovery',
    providerDetail: rec.name,
    rank: 1,
    rawScore: 0.99,
    resultType: 'web',
    category: entity.entityType === 'government_department' ? 'government' : 'official',
    language: 'en',
    favicon,
    isLive: true,
    isOfficialWebsite: true,
    isOfficialSubpage: false,
    officialConfidence: rec.confidence,
    officialOrganizationName: rec.name,
    officialVerifiedBy: rec.verifiedBy,
    sourceClass: 'official_website'
  });

  const sortedPages = [...rec.internalPages];
  if (entity.targetSubpageIntent) {
    sortedPages.sort((a, b) => {
      const aMatch = a.subpageType === entity.targetSubpageIntent ? 1 : 0;
      const bMatch = b.subpageType === entity.targetSubpageIntent ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  sortedPages.slice(0, 4).forEach((page, idx) => {
    results.push({
      id: `official-sub-${rec.officialDomain}-${idx}`,
      title: page.title || `${rec.name} — ${page.subpageType}`,
      url: page.url,
      canonicalUrl: page.canonicalUrl || page.url,
      snippet: page.snippet || `Official ${page.subpageType} page on ${rec.officialDomain}.`,
      domain: rec.officialDomain,
      content: `${rec.name} ${page.title} ${page.snippet} ${page.subpageType}`,
      headings: [page.title, page.subpageType],
      publishedAt: null,
      indexedAt: page.crawledAt,
      crawledAt: page.crawledAt,
      source: 'pendulum',
      subProvider: 'official_domain_subpage',
      providerDetail: rec.name,
      rank: idx + 2,
      rawScore: 0.92 - idx * 0.03,
      resultType: 'web',
      category: entity.entityType === 'government_department' ? 'government' : 'official',
      language: 'en',
      favicon,
      isLive: true,
      isOfficialWebsite: false,
      isOfficialSubpage: true,
      officialConfidence: rec.confidence,
      officialOrganizationName: rec.name,
      officialVerifiedBy: rec.verifiedBy,
      sourceClass: 'official_subpage',
      discoveredSubpageType: page.subpageType
    });
  });

  return results;
}

/**
 * Main General-Purpose Official Website Discovery, Verification, Domain Retrieval,
 * and Continuous Knowledge Persistence Pipeline.
 */
export async function discoverAndVerifyOfficialWebsite(
  entity: RecognizedEntity,
  intel: QueryIntelligence,
  options: { timeoutMs?: number; skipCache?: boolean } = {}
): Promise<OfficialDiscoveryBundle> {
  const startedAt = performance.now();
  const cacheKey = `${entity.normalizedName}:${entity.targetSubpageIntent || ''}`;
  if (!options.skipCache) {
    const cached = discoveryCache.get(cacheKey);
    if (cached) return cached;
  }

  const discoveryQueries = buildOfficialDiscoveryQueries(entity);

  // Step 1: Check continuous persisted Entity-Domain Store (by entity name or target domain)
  const persisted = lookupPersistedEntities(entity.targetDomain || entity.name);
  const resolvedPersisted =
    persisted.exact ||
    (persisted.candidates.length === 1 &&
    (entity.targetDomain
      ? persisted.candidates[0].officialDomain === entity.targetDomain
      : computeEntityNameSimilarity(entity, persisted.candidates[0].name) >= 0.45 ||
        persisted.candidates[0].aliases.some((a) => normalizeEntityKey(a) === normalizeEntityKey(entity.name)))
      ? persisted.candidates[0]
      : null);

  if (resolvedPersisted && !isEntityRecordStale(resolvedPersisted)) {
    const possibleMatches: EntityPossibleMatch[] = persisted.candidates.map((c) => ({
      name: c.name,
      entityType: c.entityType,
      officialDomain: c.officialDomain,
      officialUrl: c.officialUrl,
      country: c.country,
      region: c.region,
      location: c.location,
      confidence: c.confidence
    }));

    const bundle: OfficialDiscoveryBundle = {
      entity: { ...entity, possibleMatches },
      discoveryQueries: buildOfficialDiscoveryQueries(entity, resolvedPersisted.officialDomain),
      possibleMatches,
      verifiedRecord: {
        domain: resolvedPersisted.officialDomain,
        url: resolvedPersisted.officialUrl,
        isOfficialWebsite: true,
        isOfficialSubpage: false,
        confidence: resolvedPersisted.confidence,
        sourceClass: 'official_website',
        organizationName: resolvedPersisted.name,
        signals: resolvedPersisted.signals,
        verifiedBy: resolvedPersisted.verifiedBy
      },
      results: persistedRecordToProviderResults(resolvedPersisted, entity),
      latencyMs: Math.round(performance.now() - startedAt)
    };
    discoveryCache.set(cacheKey, bundle);
    return bundle;
  }

  // If persisted record exists but is stale (>24h), schedule lightweight non-blocking validity check & still return fast
  if (persisted.exact && isEntityRecordStale(persisted.exact)) {
    fetchPageHtmlResilient(persisted.exact.officialUrl, 2000)
      .then((probe) => {
        markEntityVerificationStatus(persisted.exact!.entityKey, probe.ok);
      })
      .catch(() => {});
  }

  // Step 2: Concurrent Discovery Across Open Authoritative Sources
  const candidates = new Map<string, CandidateAggregation>();
  const qidQueue = new Set<string>();
  const timeoutMs = options.timeoutMs || 3200;

  // If query is a direct URL or valid public domain (e.g. "https://hs-ai-studio-4i7i.vercel.app/"),
  // seed it directly for live fetch & verification instead of failing on encyclopedias
  if (entity.targetUrl && entity.targetDomain && !isBlockedHost(entity.targetUrl) && !isDisqualifiedOfficialHost(entity.targetDomain)) {
    addCandidate(candidates, entity.targetUrl, 'direct_url_live_fetch', entity.targetDomain, entity, {
      description: `Live website at ${entity.targetDomain}`
    });
  }

  const wpExtCandidates: Array<{ extUrl: string; title: string }> = [];

  const taskWikipedia = (async () => {
    try {
      const wpUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(entity.name)}&gsrlimit=3&prop=pageprops|extlinks&ppprop=wikibase_item&ellimit=15&format=json`;
      const res = await fetchWithTimeout(wpUrl, {}, timeoutMs);
      if (!res.ok) return;
      const data: any = await res.json();
      const pages = Object.values(data?.query?.pages || {}) as any[];
      for (const p of pages) {
        const title = String(p.title || '');
        const sim = computeEntityNameSimilarity(entity, title);
        if (sim < 0.42) continue;
        if (p.pageprops?.wikibase_item) {
          qidQueue.add(String(p.pageprops.wikibase_item));
        }
        for (const ext of p.extlinks || []) {
          const extUrl = String(ext?.['*'] || '');
          if (extUrl) wpExtCandidates.push({ extUrl, title });
        }
      }
    } catch {}
  })();

  const taskWikidataSearch = (async () => {
    try {
      const wdSearchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(entity.name)}&language=en&limit=4&format=json`;
      const res = await fetchWithTimeout(wdSearchUrl, {}, timeoutMs);
      if (!res.ok) return;
      const data: any = await res.json();
      const hits = (data?.search || []) as any[];
      for (const h of hits.slice(0, 4)) {
        const label = `${h.label || ''} ${h.description || ''}`;
        if (computeEntityNameSimilarity(entity, String(h.label || '')) >= 0.4 || entity.isAmbiguous) {
          if (h.id) qidQueue.add(String(h.id));
        }
        void label;
      }
    } catch {}
  })();

  const taskOpenAlex = (async () => {
    try {
      const oaUrl = `https://api.openalex.org/institutions?search=${encodeURIComponent(entity.name)}&per-page=3`;
      const res = await fetchWithTimeout(oaUrl, {}, timeoutMs);
      if (!res.ok) return;
      const data: any = await res.json();
      for (const inst of data?.results || []) {
        if (!inst?.homepage_url) continue;
        const label = [inst.display_name, ...(inst.display_name_acronyms || []), ...(inst.display_name_alternatives || [])]
          .filter(Boolean)
          .join(' ');
        addCandidate(candidates, String(inst.homepage_url), 'openalex_institution', String(inst.display_name || label), entity, {
          country: inst.geo?.country || inst.country_code,
          region: inst.geo?.region,
          location: inst.geo?.city,
          description: `${inst.type || 'Institution'} in ${[inst.geo?.city, inst.geo?.region, inst.geo?.country].filter(Boolean).join(', ')}`
        });
      }
    } catch {}
  })();

  const taskRor = (async () => {
    try {
      const rorUrl = `https://api.ror.org/v2/organizations?query=${encodeURIComponent(entity.name)}`;
      const res = await fetchWithTimeout(rorUrl, {}, timeoutMs);
      if (!res.ok) return;
      const data: any = await res.json();
      for (const org of (data?.items || []).slice(0, 3)) {
        const website = org?.links?.find((l: any) => l.type === 'website')?.value;
        if (!website) continue;
        const primaryName =
          org?.names?.find((n: any) => (n.types || []).includes('ror_display'))?.value ||
          org?.names?.[0]?.value ||
          '';
        if (!primaryName) continue;
        // Strict entity name similarity prevents false acronym hits like Rems-Murr-Kliniken for RMK
        if (computeEntityNameSimilarity(entity, primaryName) < 0.5) continue;
        const loc = org?.locations?.[0]?.geonames_details;
        addCandidate(candidates, String(website), 'ror_registry', primaryName, entity, {
          country: loc?.country_name,
          region: loc?.country_subdivision_name,
          location: loc?.name
        });
      }
    } catch {}
  })();

  const taskNominatim = (async () => {
    if (!['educational_institution', 'school', 'hospital', 'government_department', 'organization'].includes(entity.entityType)) {
      return;
    }
    try {
      const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(entity.name)}&format=jsonv2&extratags=1&addressdetails=1&limit=3`;
      const res = await fetchWithTimeout(osmUrl, {}, Math.min(timeoutMs, 2400));
      if (!res.ok) return;
      const items: any[] = await res.json();
      for (const p of items || []) {
        const site = p?.extratags?.website || p?.extratags?.['contact:website'] || p?.extratags?.url;
        if (!site) continue;
        const nameLabel = p.name || String(p.display_name || '').split(',')[0];
        if (computeEntityNameSimilarity(entity, nameLabel) < 0.45) continue;
        addCandidate(candidates, String(site), 'osm_website', nameLabel, entity, {
          country: p.address?.country,
          region: p.address?.state,
          location: p.address?.city || p.address?.town || p.address?.village
        });
      }
    } catch {}
  })();

  const taskSearx = (async () => {
    const searxUrl = process.env.SEARXNG_URL?.trim();
    if (!searxUrl || isBlockedHost(searxUrl)) return;
    try {
      const q = discoveryQueries[0];
      const res = await fetchWithTimeout(`${searxUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}&format=json`, {}, timeoutMs);
      if (!res.ok) return;
      const data: any = await res.json();
      for (const item of (data?.results || []).slice(0, 6)) {
        if (!item?.url) continue;
        addCandidate(candidates, String(item.url), 'external_web_discovery', String(item.title || ''), entity, {
          description: stripHtml(String(item.content || '')).slice(0, 240)
        });
      }
    } catch {}
  })();

  await Promise.allSettled([taskWikipedia, taskWikidataSearch, taskOpenAlex, taskRor, taskNominatim, taskSearx]);

  // Step 2b: Resolve collected Wikidata QIDs in ONE batched wbgetentities request
  if (qidQueue.size > 0) {
    try {
      const ids = Array.from(qidQueue).slice(0, 5).join('|');
      const entUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(ids)}&props=claims|labels|descriptions|aliases&languages=en&format=json`;
      const res = await fetchWithTimeout(entUrl, {}, timeoutMs);
      if (res.ok) {
        const data: any = await res.json();
        for (const ent of Object.values(data?.entities || {}) as any[]) {
          const label = ent?.labels?.en?.value || '';
          const desc = ent?.descriptions?.en?.value || '';
          const p856Claims = ent?.claims?.P856 || [];
          for (const claim of p856Claims) {
            const siteUrl = claim?.mainsnak?.datavalue?.value;
            if (typeof siteUrl === 'string' && siteUrl.startsWith('http')) {
              addCandidate(candidates, siteUrl, 'wikidata_p856', label || entity.name, entity, {
                description: desc
              });
            }
          }
        }
      }
    } catch {}
  }

  // Merge Wikipedia external link corroboration cleanly without polluting with footnote/citation hosts
  for (const { extUrl, title } of wpExtCandidates) {
    const dom = extractRegistrableHost(extUrl);
    if (!dom || isDisqualifiedOfficialHost(dom)) continue;
    if (candidates.has(dom) || domainContainsEntityIdentity(dom, entity)) {
      addCandidate(candidates, extUrl, 'wikipedia_extlink', title, entity, { wikipediaReferenced: true });
    }
  }

  // Sort candidate domains: exact entity name, primary hostname & acronym alignment outweigh raw registry link count
  const cleanJoined = entity.normalizedName.replace(/\s+/g, '');
  const rankedCandidates = Array.from(candidates.values()).sort((a, b) => {
    const scoreCand = (c: CandidateAggregation) => {
      const hostLabel = c.domain.split('.')[0] || '';
      const exactHostBonus = hostLabel === cleanJoined ? 0.12 : 0;
      const exactNameBonus = c.similarity >= 0.95 ? 0.65 : c.similarity >= 0.85 ? 0.25 : 0;
      const domainBonus = domainExactAcronymMatch(c.domain, entity)
        ? 0.35
        : domainContainsEntityIdentity(c.domain, entity)
        ? 0.12
        : 0;
      const isUtilitySubdomain = /^(apps|support|docs|respark|nptel|ccw|beta|platform|download|msdn|about)\./i.test(c.domain);
      const primaryHostBonus = isUtilitySubdomain ? -0.20 : c.domain.split('.').length <= 3 ? 0.14 : 0;
      const regBonus = Math.min(3, c.registrySources.size) * 0.18;
      return c.similarity * 1.4 + exactNameBonus + exactHostBonus + domainBonus + primaryHostBonus + regBonus;
    };
    return scoreCand(b) - scoreCand(a);
  });

  // Build possibleMatches (preserving ambiguity when short queries match >1 distinct institution!)
  const possibleMatches: EntityPossibleMatch[] = rankedCandidates.slice(0, 4).map((c) => ({
    name: c.orgName,
    entityType: entity.entityType,
    officialDomain: c.domain,
    officialUrl: c.url,
    country: c.country || entity.country,
    region: c.region || entity.region,
    location: c.location || entity.location,
    description: c.description,
    confidence: Math.round(Math.min(0.98, 0.45 + c.similarity * 0.35 + c.registrySources.size * 0.15) * 100) / 100
  }));

  const results: ProviderRawResult[] = [];
  let verifiedRecord: OfficialVerificationResult | null = null;
  const primaryCandidate = rankedCandidates[0];

  if (primaryCandidate) {
    // Step 3: Live HTTP Homepage Verification & Robots.txt check
    let origin = '';
    try {
      origin = new URL(primaryCandidate.url).origin;
    } catch {}

    const [robotsPolicy, liveFetch] = await Promise.all([
      origin ? fetchRobotsPolicy(origin) : Promise.resolve({ disallow: [], sitemaps: [] }),
      fetchPageHtmlResilient(primaryCandidate.url, 2600)
    ]);

    const liveMeta = liveFetch.ok
      ? parseLiveHtmlMetadata(liveFetch.finalUrl, liveFetch.html, primaryCandidate.domain)
      : null;

    const finalEntryUrl = liveMeta?.finalUrl || primaryCandidate.url;
    verifiedRecord = verifyOfficialDomainCandidate({
      url: finalEntryUrl,
      entity,
      registrySources: Array.from(primaryCandidate.registrySources),
      registryOrgName: primaryCandidate.orgName,
      wikipediaReferenced: primaryCandidate.wikipediaReferenced,
      liveTitle: liveMeta?.title,
      liveH1: liveMeta?.h1,
      liveSchemaOrgName: liveMeta?.schemaOrgName,
      liveText: liveMeta?.bodyText,
      liveReachable: Boolean(liveFetch.ok),
      hasMatchingContactEmail: liveMeta?.hasMatchingContactEmail
    });

    if (verifiedRecord.isOfficialWebsite) {
      const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(verifiedRecord.domain)}&sz=64`;
      const orgTitle =
        liveMeta?.title && liveMeta.title.length > 3
          ? liveMeta.title
          : `${primaryCandidate.orgName} — Official Website`;

      results.push({
        id: `official-root-${verifiedRecord.domain}`,
        title: orgTitle,
        url: finalEntryUrl,
        canonicalUrl: liveMeta?.canonicalUrl || finalEntryUrl,
        snippet:
          liveMeta?.description ||
          primaryCandidate.description ||
          `Official website of ${primaryCandidate.orgName} (${verifiedRecord.domain}).`,
        domain: verifiedRecord.domain,
        content: liveMeta?.bodyText || `${primaryCandidate.orgName} official website ${primaryCandidate.description || ''}`,
        headings: [primaryCandidate.orgName, liveMeta?.h1 || 'Official Website'].filter(Boolean),
        publishedAt: null,
        indexedAt: new Date().toISOString(),
        crawledAt: new Date().toISOString(),
        source: 'pendulum',
        subProvider: 'official_entity_discovery',
        providerDetail: primaryCandidate.orgName,
        rank: 1,
        rawScore: 0.99,
        resultType: 'web',
        category: entity.entityType === 'government_department' ? 'government' : 'official',
        language: 'en',
        favicon,
        isLive: Boolean(liveFetch.ok),
        isOfficialWebsite: true,
        isOfficialSubpage: false,
        officialConfidence: verifiedRecord.confidence,
        officialOrganizationName: primaryCandidate.orgName,
        officialVerifiedBy: verifiedRecord.verifiedBy,
        sourceClass: 'official_website'
      });

      // Step 4: Domain-Specific Internal Page Retrieval (respecting robots.txt & sitemaps!)
      const candidateSubLinks = [...(liveMeta?.discoveredLinks || [])];
      if (candidateSubLinks.length < 4 && origin) {
        const smLinks = await fetchSitemapSubpageLinks(
          origin,
          robotsPolicy.sitemaps,
          verifiedRecord.domain,
          robotsPolicy.disallow
        );
        for (const sl of smLinks) {
          if (!candidateSubLinks.some((c) => c.url === sl.url)) {
            candidateSubLinks.push(sl);
          }
        }
      }

      // Prioritize targeted subpage intent first if user searched e.g. "<Org> placements" or "<Org> admissions"
      if (entity.targetSubpageIntent) {
        candidateSubLinks.sort((a, b) => {
          const aMatch = a.subpageType === entity.targetSubpageIntent ? 1 : 0;
          const bMatch = b.subpageType === entity.targetSubpageIntent ? 1 : 0;
          return bMatch - aMatch;
        });
      }

      const permittedLinks = candidateSubLinks.filter((l) => {
        try {
          return isPathAllowedByRobots(new URL(l.url).pathname, robotsPolicy.disallow);
        } catch {
          return false;
        }
      }).slice(0, 4);

      const persistedPages: PersistedInternalPage[] = [];
      const subResults = await Promise.allSettled(
        permittedLinks.map(async (sub, idx) => {
          const fetched = await fetchPageHtmlResilient(sub.url, 1800);
          const subTitle = fetched.ok
            ? (fetched.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? stripHtml(fetched.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]).slice(0, 130) : `${primaryCandidate.orgName} — ${sub.label}`)
            : `${primaryCandidate.orgName} — ${sub.label}`;
          const subDescMatch = fetched.ok
            ? fetched.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
            : undefined;
          const subBody = fetched.ok
            ? stripHtml(fetched.html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).slice(0, 1200)
            : '';
          const subCanonical = fetched.ok
            ? (fetched.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || fetched.finalUrl)
            : sub.url;

          const subSnippet = stripHtml(subDescMatch || '') || subBody.slice(0, 260) || `Official ${sub.subpageType} resource on ${verifiedRecord!.domain}.`;

          persistedPages.push({
            url: fetched.ok ? fetched.finalUrl : sub.url,
            canonicalUrl: subCanonical.startsWith('http') ? subCanonical : sub.url,
            title: subTitle,
            snippet: subSnippet,
            subpageType: sub.subpageType,
            crawledAt: new Date().toISOString()
          });

          return {
            id: `official-sub-${verifiedRecord!.domain}-${idx}`,
            title: subTitle,
            url: fetched.ok ? fetched.finalUrl : sub.url,
            canonicalUrl: subCanonical.startsWith('http') ? subCanonical : sub.url,
            snippet: subSnippet,
            domain: verifiedRecord!.domain,
            content: `${primaryCandidate.orgName} ${subTitle} ${subSnippet} ${subBody}`,
            headings: [subTitle, sub.subpageType],
            publishedAt: null,
            indexedAt: new Date().toISOString(),
            crawledAt: new Date().toISOString(),
            source: 'pendulum' as const,
            subProvider: 'official_domain_subpage',
            providerDetail: primaryCandidate.orgName,
            rank: idx + 2,
            rawScore: 0.92 - idx * 0.03,
            resultType: 'web' as const,
            category: entity.entityType === 'government_department' ? 'government' : 'official',
            language: 'en',
            favicon,
            isLive: fetched.ok,
            isOfficialWebsite: false,
            isOfficialSubpage: true,
            officialConfidence: verifiedRecord!.confidence,
            officialOrganizationName: primaryCandidate.orgName,
            officialVerifiedBy: verifiedRecord!.verifiedBy,
            sourceClass: 'official_subpage' as const,
            discoveredSubpageType: sub.subpageType
          };
        })
      );

      for (const r of subResults) {
        if (r.status === 'fulfilled' && r.value) {
          results.push(r.value);
        }
      }

      // Step 5: Persist continuously into Entity-Domain Knowledge Store
      const persistName =
        entity.targetDomain && liveMeta?.schemaOrgName && liveMeta.schemaOrgName.length > 2
          ? liveMeta.schemaOrgName
          : primaryCandidate.orgName;
      upsertDiscoveredEntity({
        entityKey: normalizeEntityKey(persistName),
        name: persistName,
        entityType: entity.entityType,
        aliases: Array.from(
          new Set([
            entity.name,
            ...(entity.targetDomain ? [entity.targetDomain] : []),
            ...(liveMeta?.schemaOrgName ? [liveMeta.schemaOrgName] : []),
            ...entity.alternativeNames,
            primaryCandidate.orgName,
            persistName
          ])
        ),
        country: primaryCandidate.country || entity.country,
        region: primaryCandidate.region || entity.region,
        location: primaryCandidate.location || entity.location,
        officialUrl: finalEntryUrl,
        officialDomain: verifiedRecord.domain,
        confidence: verifiedRecord.confidence,
        verifiedBy: verifiedRecord.verifiedBy,
        signals: verifiedRecord.signals,
        internalPages: persistedPages,
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        isValid: true
      });
    }
  }

  // Update bundle discovery queries with discovered domain
  const updatedDiscoveryQueries = buildOfficialDiscoveryQueries(entity, verifiedRecord?.domain);

  const bundle: OfficialDiscoveryBundle = {
    entity: { ...entity, possibleMatches },
    discoveryQueries: updatedDiscoveryQueries,
    possibleMatches,
    verifiedRecord,
    results,
    latencyMs: Math.round(performance.now() - startedAt)
  };

  discoveryCache.set(cacheKey, bundle);
  return bundle;
}
