import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { generateAiOverview } from '../ai/julyEngine';
import {
  isEntityRecordStale,
  lookupPersistedEntities,
  markEntityVerificationStatus,
  normalizeEntityKey,
  PersistedEntityRecord,
  upsertDiscoveredEntity
} from '../entity/entityKnowledgeStore';
import { recognizeQueryEntity } from '../entity/entityRecognizer';
import {
  computeEntityNameSimilarity,
  isPathAllowedByRobots,
  parseRobotsTxt,
  verifyOfficialDomainCandidate
} from '../entity/officialDiscovery';
import { deduplicateResults } from '../hybrid/deduplicator';
import { rankHybridResults } from '../hybrid/ranker';
import { analyzeQueryIntelligence } from '../query/intelligence';
import { executeHybridEngine } from '../searchEngine';
import { GeoLocationContext, ProviderRawResult, RecognizedEntity } from '../types';

const CHENNAI_GEO: GeoLocationContext = {
  country: 'India',
  countryCode: 'IN',
  region: 'Tamil Nadu',
  city: 'Chennai',
  lat: 12.9249,
  lon: 80.1,
  enabled: true
};

function makeCandidate(
  overrides: Partial<ProviderRawResult> & { id: string; title: string; url: string }
): ProviderRawResult {
  const domain = overrides.domain || new URL(overrides.url).hostname.replace(/^www\./, '');
  return {
    snippet: 'Verified institutional information.',
    domain,
    content: 'Detailed organizational content and structure.',
    publishedAt: null,
    indexedAt: new Date().toISOString(),
    source: 'pendulum',
    subProvider: 'pendulum_bm25',
    providerDetail: domain,
    rank: 1,
    rawScore: 0.8,
    category: 'general',
    language: 'en',
    ...overrides
  };
}

// 1. Entity Recognition across all 10 required entity types
test('1. Entity recognition classifies all 10 entity types and extracts context', () => {
  const cases: Array<{ query: string; expectedType: RecognizedEntity['entityType'] }> = [
    { query: 'RMK Engineering College', expectedType: 'educational_institution' },
    { query: 'Kendriya Vidyalaya Chennai', expectedType: 'school' },
    { query: 'Microsoft', expectedType: 'company' },
    { query: 'Tamil Nadu Government', expectedType: 'government_department' },
    { query: 'Apollo Hospital Chennai', expectedType: 'hospital' },
    { query: 'Linux Foundation', expectedType: 'organization' },
    { query: 'Samsung', expectedType: 'brand' },
    { query: 'PyTorch', expectedType: 'product' },
    { query: 'Dr. Harshan Seliyan', expectedType: 'person' },
    { query: 'github.com', expectedType: 'website_service' }
  ];

  for (const tc of cases) {
    const rec = recognizeQueryEntity(tc.query, tc.query, CHENNAI_GEO);
    assert.ok(rec, `Expected entity recognition for "${tc.query}"`);
    assert.equal(rec.entityType, tc.expectedType, `Mismatch for "${tc.query}"`);
    assert.equal(rec.isSpecificEntityQuery, true);
  }

  const rmk = recognizeQueryEntity('RMK Engineering College', 'RMK Engineering College', CHENNAI_GEO);
  assert.ok(rmk);
  assert.equal(rmk.country, 'India');
  assert.ok(rmk.abbreviations.includes('RMK') || rmk.abbreviations.includes('REC'));
});

// 2. Subpage intent stripping & ambiguity detection
test('2. Subpage intent extraction and ambiguous query detection', () => {
  const placements = recognizeQueryEntity('RMK Engineering College placements', 'RMK Engineering College placements', CHENNAI_GEO);
  assert.ok(placements);
  assert.equal(placements.name, 'RMK Engineering College');
  assert.equal(placements.targetSubpageIntent, 'placements');

  const admissions = recognizeQueryEntity('Anna University admissions', 'Anna University admissions', CHENNAI_GEO);
  assert.ok(admissions);
  assert.equal(admissions.name, 'Anna University');
  assert.equal(admissions.targetSubpageIntent, 'admissions');

  const ambiguous = recognizeQueryEntity('RMK College', 'RMK College', CHENNAI_GEO);
  assert.ok(ambiguous);
  assert.equal(ambiguous.isAmbiguous, true, 'Short abbreviated college query must preserve ambiguity');
});

// 3. Clean rejection of informational, technical, weather, news, and plural category queries
test('3. Non-entity informational, technical, and category queries do not trigger entity mode', () => {
  const nonEntityQueries = [
    'What is a database?',
    'Weather forecast Tokyo',
    'TypeScript discriminated unions type narrowing',
    'Latest AI developments',
    'Quantum computing',
    'Tamil Nadu government schemes',
    'best engineering colleges in tamil nadu',
    'photosynthesis mechanism'
  ];

  for (const q of nonEntityQueries) {
    const rec = recognizeQueryEntity(q, q, CHENNAI_GEO);
    assert.equal(rec, undefined, `Query "${q}" must NOT trigger entity navigational mode`);
  }
});

// 4. Adversarial Official Verification: rejects Wikipedia, portals, blogs, mismatched ROR, and unverified lookalikes
test('4. Official domain verification enforces 0% false-official rate on portals, Wikipedia, and lookalikes', () => {
  const rmkEntity = recognizeQueryEntity('RMK Engineering College', 'RMK Engineering College', CHENNAI_GEO)!;

  // Reject mismatched fuzzy registry match (e.g. Rems-Murr-Kliniken / Rems-Murr-Klinikum)
  const badSim = computeEntityNameSimilarity(rmkEntity, 'Rems-Murr-Kliniken');
  assert.ok(badSim < 0.42, `Mismatched ROR candidate similarity (${badSim}) must be below threshold`);

  const rmkShort = recognizeQueryEntity('RMK College', 'RMK College', CHENNAI_GEO)!;
  assert.ok(computeEntityNameSimilarity(rmkShort, 'Rems-Murr-Klinikum') < 0.42);

  const iitm = recognizeQueryEntity('IIT Madras', 'IIT Madras', CHENNAI_GEO)!;
  assert.ok(
    computeEntityNameSimilarity(iitm, 'Indian Institute of Technology - Madras') >
      computeEntityNameSimilarity(iitm, 'IIT Madras Zanzibar'),
    'Primary campus expansion must score higher than branch campus'
  );

  const rmkcet = recognizeQueryEntity('RMK College of Engineering and Technology', 'RMK College of Engineering and Technology', CHENNAI_GEO)!;
  assert.ok(
    computeEntityNameSimilarity(rmkcet, 'R.M.K. College of Engineering & Technology') >
      computeEntityNameSimilarity(rmkcet, 'RMK Engineering College'),
    'Exact RMKCET name must score higher than sibling RMK Engineering College'
  );

  const disqualifiedUrls = [
    'https://www.shiksha.com/college/r-m-k-engineering-college-kavaraipettai-22585',
    'https://www.careers360.com/colleges/rmk-engineering-college-thiruvallur',
    'https://collegedunia.com/college/14722-rmk-engineering-college-thiruvallur',
    'https://en.wikipedia.org/wiki/R.M.K._Engineering_College',
    'https://rmk-engineering-college-reviews.blogspot.com/2025/overview.html'
  ];

  for (const url of disqualifiedUrls) {
    const res = verifyOfficialDomainCandidate({
      url,
      entity: rmkEntity,
      registrySources: ['openalex_institution'],
      registryOrgName: 'R.M.K. Engineering College',
      wikipediaReferenced: true,
      liveTitle: 'RMK Engineering College',
      liveReachable: true
    });
    assert.equal(res.isOfficialWebsite, false, `Disqualified third-party host must NEVER be verified official: ${url}`);
    assert.equal(res.isOfficialSubpage, false);
  }

  // Reject unverified lookalike .com even if URL contains entity name
  const unverifiedLookalike = verifyOfficialDomainCandidate({
    url: 'https://rmkengineeringcollege-guide.com/',
    entity: rmkEntity,
    registrySources: [],
    wikipediaReferenced: false,
    liveTitle: 'RMK Engineering College Unofficial Portal',
    liveReachable: true
  });
  assert.equal(unverifiedLookalike.isOfficialWebsite, false, 'Lookalike without independent registry/Wikipedia evidence must be rejected');

  // Approve genuine verified domain with authoritative multi-signal evidence
  const legitimate = verifyOfficialDomainCandidate({
    url: 'https://www.rmkec.ac.in/',
    entity: rmkEntity,
    registrySources: ['openalex_institution', 'wikidata_p856'],
    registryOrgName: 'R.M.K. Engineering College',
    wikipediaReferenced: true,
    liveTitle: 'R.M.K. Engineering College - Autonomous Institution',
    liveSchemaOrgName: 'R.M.K. Engineering College',
    hasMatchingContactEmail: true,
    liveReachable: true
  });
  assert.equal(legitimate.isOfficialWebsite, true);
  assert.ok(legitimate.confidence >= 0.62);
  assert.equal(legitimate.sourceClass, 'official_website');
});

// 5. Robots.txt parsing & path enforcement
test('5. Robots.txt parser respects wildcard and PendulumSearchBot Disallow rules', () => {
  const sample = `
# Sample policy
User-agent: *
Disallow: /private/
Disallow: /admin
Sitemap: https://example.edu/sitemap.xml
`;
  const policy = parseRobotsTxt(sample);
  assert.deepEqual(policy.sitemaps, ['https://example.edu/sitemap.xml']);
  assert.equal(isPathAllowedByRobots('/admissions', policy.disallow), true);
  assert.equal(isPathAllowedByRobots('/private/records', policy.disallow), false);
  assert.equal(isPathAllowedByRobots('/admin/login', policy.disallow), false);

  const blockAll = parseRobotsTxt('User-agent: *\nDisallow: /');
  assert.equal(isPathAllowedByRobots('/admissions', blockAll.disallow), false);
});

// 6. Navigational Hybrid Ranking puts official website #1, official subpages #2-#4, above Wikipedia & portals
test('6. Navigational hybrid ranking elevates verified official site and targeted subpages over Wikipedia & portals', () => {
  const query = 'RMK Engineering College';
  const intel = analyzeQueryIntelligence(query, CHENNAI_GEO);

  const candidates = deduplicateResults([
    makeCandidate({
      id: 'wiki',
      title: 'R.M.K. Engineering College - Wikipedia',
      url: 'https://en.wikipedia.org/wiki/R.M.K._Engineering_College',
      snippet: 'R.M.K. Engineering College is an autonomous engineering college in Kavaraipettai, Tamil Nadu.',
      source: 'external',
      subProvider: 'ext_wiki',
      rank: 1
    }),
    makeCandidate({
      id: 'shiksha',
      title: 'RMK Engineering College: Fees, Admissions, Placements, Cutoff',
      url: 'https://www.shiksha.com/college/r-m-k-engineering-college-22585',
      snippet: 'Check RMK Engineering College reviews, fees, placement statistics.',
      source: 'external',
      subProvider: 'ext_web',
      rank: 1
    }),
    makeCandidate({
      id: 'official-root',
      title: 'R.M.K. Engineering College',
      url: 'https://www.rmkec.ac.in/',
      snippet: 'Official website of R.M.K. Engineering College, Kavaraipettai.',
      source: 'pendulum',
      subProvider: 'official_entity_discovery',
      rank: 1,
      isOfficialWebsite: true,
      isOfficialSubpage: false,
      officialConfidence: 0.94,
      officialOrganizationName: 'R.M.K. Engineering College',
      sourceClass: 'official_website'
    }),
    makeCandidate({
      id: 'official-adm',
      title: 'Admissions — R.M.K. Engineering College',
      url: 'https://www.rmkec.ac.in/admissions',
      snippet: 'Official B.E / B.Tech admissions portal at rmkec.ac.in.',
      source: 'pendulum',
      subProvider: 'official_domain_subpage',
      rank: 2,
      isOfficialWebsite: false,
      isOfficialSubpage: true,
      officialConfidence: 0.94,
      officialOrganizationName: 'R.M.K. Engineering College',
      sourceClass: 'official_subpage',
      discoveredSubpageType: 'admissions'
    }),
    makeCandidate({
      id: 'official-plc',
      title: 'Placements — R.M.K. Engineering College',
      url: 'https://www.rmkec.ac.in/placements',
      snippet: 'Official placement statistics and recruiters.',
      source: 'pendulum',
      subProvider: 'official_domain_subpage',
      rank: 3,
      isOfficialWebsite: false,
      isOfficialSubpage: true,
      officialConfidence: 0.94,
      officialOrganizationName: 'R.M.K. Engineering College',
      sourceClass: 'official_subpage',
      discoveredSubpageType: 'placements'
    })
  ]).items;

  const { ranked } = rankHybridResults(candidates, query, { location: CHENNAI_GEO, intelligence: intel });
  assert.equal(ranked[0].id, 'official-root', 'Verified official homepage must rank #1');
  assert.ok(['official-adm', 'official-plc'].includes(ranked[1].id), 'Verified official subpage must rank #2');
  const wikiIdx = ranked.findIndex((r) => r.id === 'wiki');
  const shikshaIdx = ranked.findIndex((r) => r.id === 'shiksha');
  assert.ok(wikiIdx >= 3, `Wikipedia must rank below official website & subpages (got index ${wikiIdx})`);
  assert.ok(shikshaIdx > wikiIdx || shikshaIdx >= 3, 'Educational portal must rank below official pages');

  // Targeted subpage query: "RMK Engineering College placements"
  const plcQuery = 'RMK Engineering College placements';
  const plcIntel = analyzeQueryIntelligence(plcQuery, CHENNAI_GEO);
  const { ranked: plcRanked } = rankHybridResults(candidates, plcQuery, { location: CHENNAI_GEO, intelligence: plcIntel });
  assert.ok(['official-plc', 'official-root'].includes(plcRanked[0].id));
  assert.ok(
    plcRanked.slice(0, 2).some((r) => r.id === 'official-plc'),
    'Targeted placements subpage must appear in top 2 for placements query'
  );
});

// 7. July AI Overview distinguishes official sources vs Wikipedia and never fabricates an official URL
test('7. July AI Overview classifies official website cleanly and never invents unverified official URLs', async () => {
  const query = 'Anna University';
  const intel = analyzeQueryIntelligence(query, CHENNAI_GEO);

  const withoutOfficial = rankHybridResults(
    deduplicateResults([
      makeCandidate({
        id: 'wiki-anna',
        title: 'Anna University - Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Anna_University',
        snippet: 'Anna University is a public state university located in Chennai, Tamil Nadu, India.',
        source: 'external',
        subProvider: 'ext_wiki'
      })
    ]).items,
    query,
    { location: CHENNAI_GEO, intelligence: intel }
  ).ranked;

  const overviewNoOfficial = await generateAiOverview({
    query,
    sources: withoutOfficial,
    analysis: intel
  });
  assert.equal(overviewNoOfficial.directAnswer, undefined, 'Must not fabricate Official Website directAnswer without verified official source');

  const withOfficial = rankHybridResults(
    deduplicateResults([
      makeCandidate({
        id: 'off-anna',
        title: 'Anna University, Chennai',
        url: 'https://www.annauniv.edu/',
        domain: 'annauniv.edu',
        snippet: 'Official portal of Anna University, Chennai.',
        isOfficialWebsite: true,
        officialConfidence: 0.96,
        officialOrganizationName: 'Anna University',
        sourceClass: 'official_website'
      }),
      makeCandidate({
        id: 'wiki-anna',
        title: 'Anna University - Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Anna_University',
        snippet: 'Anna University is a public state university located in Chennai, Tamil Nadu.',
        source: 'external',
        subProvider: 'ext_wiki'
      })
    ]).items,
    query,
    { location: CHENNAI_GEO, intelligence: intel }
  ).ranked;

  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY; // Exercise deterministic grounded fallback directly
  try {
    const overviewOfficial = await generateAiOverview({
      query,
      sources: withOfficial,
      analysis: intel
    });
    assert.ok(overviewOfficial.directAnswer?.includes('annauniv.edu'));
    assert.ok(overviewOfficial.answer.includes('annauniv.edu'));
    assert.ok(overviewOfficial.answer.includes('[1]'));
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

// 8. Continuous Entity-Domain Knowledge Store persistence & staleness checks
test('8. Entity knowledge store normalizes keys, tracks staleness, and persists updates', () => {
  const dataFile = path.resolve(process.cwd(), 'server', 'data', 'discovered_entities.json');
  const existedBefore = fs.existsSync(dataFile);
  const previousContent = existedBefore ? fs.readFileSync(dataFile, 'utf8') : null;

  try {
    assert.equal(normalizeEntityKey('R.M.K. Engineering College'), 'rmk engineering college');

    const freshRec: PersistedEntityRecord = {
      entityKey: 'test_synthetic_institute',
      name: 'Test Synthetic Institute',
      entityType: 'educational_institution',
      aliases: ['TSI'],
      officialUrl: 'https://tsi.example.edu/',
      officialDomain: 'tsi.example.edu',
      confidence: 0.91,
      verifiedBy: ['openalex_institution'],
      signals: ['verified_institutional_tld'],
      internalPages: [],
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      isValid: true
    };

    upsertDiscoveredEntity(freshRec);
    const hit = lookupPersistedEntities('Test Synthetic Institute');
    assert.ok(hit.exact);
    assert.equal(hit.exact.officialDomain, 'tsi.example.edu');
    assert.equal(isEntityRecordStale(hit.exact), false);

    const oldRec: PersistedEntityRecord = {
      ...freshRec,
      lastVerifiedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    };
    assert.equal(isEntityRecordStale(oldRec), true);

    markEntityVerificationStatus('test_synthetic_institute', false);
    const invalidated = lookupPersistedEntities('Test Synthetic Institute');
    assert.equal(invalidated.exact, null, 'Invalidated entity must not be returned as active exact match');
  } finally {
    if (existedBefore && previousContent !== null) {
      fs.writeFileSync(dataFile, previousContent, 'utf8');
    } else if (!existedBefore && fs.existsSync(dataFile)) {
      fs.unlinkSync(dataFile);
    }
  }
});

// 9. General-purpose direct URL / hostname recognition & ranking above generic HTTPS/app results
test('9. Direct URL/hostname recognition and ranker prioritize exact live website over HTTPS/app glossary noise', () => {
  const fullUrlEntity = recognizeQueryEntity('https://hs-ai-studio-4i7i.vercel.app/', 'https://hs-ai-studio-4i7i.vercel.app/');
  assert.ok(fullUrlEntity);
  assert.equal(fullUrlEntity.entityType, 'website_service');
  assert.equal(fullUrlEntity.targetDomain, 'hs-ai-studio-4i7i.vercel.app');
  assert.equal(fullUrlEntity.targetUrl, 'https://hs-ai-studio-4i7i.vercel.app/');

  const hostOnlyEntity = recognizeQueryEntity('hs-ai-studio-4i7i.vercel.app', 'hs-ai-studio-4i7i.vercel.app');
  assert.ok(hostOnlyEntity);
  assert.equal(hostOnlyEntity.entityType, 'website_service');
  assert.equal(hostOnlyEntity.targetDomain, 'hs-ai-studio-4i7i.vercel.app');

  const genericReactUrl = recognizeQueryEntity('https://react.dev/learn', 'https://react.dev/learn');
  assert.ok(genericReactUrl);
  assert.equal(genericReactUrl.entityType, 'website_service');
  assert.equal(genericReactUrl.targetDomain, 'react.dev');

  const hsOrgEntity = recognizeQueryEntity('HS AI Solutions', 'HS AI Solutions');
  assert.ok(hsOrgEntity);
  assert.equal(hsOrgEntity.entityType, 'company');

  const founderEntity = recognizeQueryEntity('Harshan Seliyan B S', 'Harshan Seliyan B S');
  assert.ok(founderEntity);
  assert.equal(founderEntity.entityType, 'person');

  const directVerify = verifyOfficialDomainCandidate({
    url: 'https://example.org/',
    entity: {
      ...genericReactUrl,
      name: 'example.org',
      normalizedName: 'example.org',
      targetDomain: 'example.org',
      targetUrl: 'https://example.org/'
    },
    registrySources: ['direct_url_live_fetch'],
    wikipediaReferenced: false,
    liveTitle: 'Example Domain',
    liveReachable: true
  });
  assert.equal(directVerify.isOfficialWebsite, true);

  // Ranker must put exact live target website #1 above MDN HTTPS glossary & app tutorials
  const urlQuery = 'https://hs-ai-studio-4i7i.vercel.app/';
  const intel = analyzeQueryIntelligence(urlQuery);
  const candidates = deduplicateResults([
    makeCandidate({
      id: 'mdn-https',
      title: 'HTTPS - Glossary | MDN',
      url: 'https://developer.mozilla.org/en-US/docs/Glossary/HTTPS',
      snippet: 'HTTPS (Hypertext Transfer Protocol Secure) is an encrypted version of HTTP.',
      source: 'external',
      subProvider: 'ext_mdn',
      rank: 1
    }),
    makeCandidate({
      id: 'mdn-app',
      title: 'Create a standalone app - MDN Web Docs',
      url: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/CycleTracker',
      snippet: 'Learn how to create a standalone web app.',
      source: 'external',
      subProvider: 'ext_mdn',
      rank: 2
    }),
    makeCandidate({
      id: 'target-root',
      title: 'HS AI Solutions — Building AI That Does More · Harshan Seliyan B S',
      url: 'https://hs-ai-studio-4i7i.vercel.app/',
      domain: 'hs-ai-studio-4i7i.vercel.app',
      snippet: 'Official website of HS AI Solutions (HS AI Studio), founded by Harshan Seliyan B S.',
      source: 'pendulum',
      subProvider: 'official_entity_discovery',
      rank: 1,
      isOfficialWebsite: true,
      officialConfidence: 0.97,
      officialOrganizationName: 'HS AI Solutions',
      sourceClass: 'official_website'
    })
  ]).items;

  const { ranked } = rankHybridResults(candidates, urlQuery, { intelligence: intel });
  assert.equal(ranked[0].domain, 'hs-ai-studio-4i7i.vercel.app');
  assert.equal(ranked[0].isOfficialWebsite, true);
});

// 10. End-to-end hybrid search resolves HS AI Solutions and https://hs-ai-studio-4i7i.vercel.app/
test('10. Hybrid search surfaces live HS AI Studio official site #1 for org & direct URL queries', async () => {
  const stubDdgAdapter = {
    async search() {
      return {
        engineLabel: 'Stub DuckDuckGo',
        results: []
      };
    }
  };

  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    for (const q of ['https://hs-ai-studio-4i7i.vercel.app/', 'HS AI Solutions']) {
      const res = await executeHybridEngine({
        query: q,
        type: 'All',
        limit: 8,
        providers: ['pendulum', 'duckduckgo'],
        aiOverview: true,
        rerank: false,
        skipCache: true,
        ddgAdapter: stubDdgAdapter,
        enhancerOptions: { enableLiveFetch: false }
      });

      assert.ok(res.results.length >= 1, `Expected results for query "${q}"`);
      assert.equal(res.results[0].domain, 'hs-ai-studio-4i7i.vercel.app', `Expected official site #1 for "${q}"`);
      assert.equal(res.recognized_entity?.verifiedOfficialWebsite?.domain, 'hs-ai-studio-4i7i.vercel.app');
      assert.equal(res.ai_intelligence?.knowledge_graph_card?.entity_id, 'hs_ai_solutions');
      assert.equal(res.ai_intelligence?.knowledge_graph_card?.source_url, 'https://hs-ai-studio-4i7i.vercel.app/');
    }
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

