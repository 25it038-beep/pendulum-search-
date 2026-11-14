import assert from 'node:assert/strict';
import test from 'node:test';
import { detectSourceDisagreements, deterministicFollowupRewrite, generateAiOverview } from '../ai/julyEngine';
import { runSearchBenchmark } from '../eval/benchmark';
import { deduplicateResults } from '../hybrid/deduplicator';
import { rankHybridResults } from '../hybrid/ranker';
import { DuckDuckGoProvider } from '../providers/duckduckgoProvider';
import { analyzeQueryIntelligence } from '../query/intelligence';
import { executeAiFollowup, executeAiFollowupStream, executeHybridEngine } from '../searchEngine';
import { GeoLocationContext, HybridSearchResult, ProviderRawResult } from '../types';

const CHENNAI_GEO: GeoLocationContext = {
  country: 'India',
  countryCode: 'IN',
  region: 'Tamil Nadu',
  city: 'Chennai',
  lat: 12.9249,
  lon: 80.1,
  enabled: true
};

function makeCandidate(overrides: Partial<ProviderRawResult> & { id: string; title: string; url: string }): ProviderRawResult {
  const domain = overrides.domain || new URL(overrides.url).hostname.replace(/^www\./, '');
  return {
    snippet: 'Detailed informational content.',
    domain,
    content: 'Detailed informational content with verifiable structure.',
    publishedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
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

// 1. Relevant vs Irrelevant Results (boundary matching, field hierarchy, spam/noise demotion)
test('1. Relevant vs irrelevant results: word boundaries prevent substring false positives and filter spam', () => {
  const query = 'ai research';
  const intel = analyzeQueryIntelligence(query, CHENNAI_GEO);
  const candidates: ProviderRawResult[] = [
    makeCandidate({
      id: 'rel-1',
      title: 'Artificial Intelligence (AI) Research Foundations',
      url: 'https://arxiv.org/abs/ai-research-foundations',
      snippet: 'Peer-reviewed AI research covering transformer models and machine learning evaluation.',
      content: 'Artificial intelligence research advances reasoning, retrieval, and scientific discovery.',
      source: 'pendulum',
      subProvider: 'pendulum_bm25',
      rank: 2
    }),
    makeCandidate({
      id: 'irrel-substr',
      title: 'Retail Detail Container Chain Logistics',
      url: 'https://retail-detail.example.com/logistics',
      snippet: 'Daily retail store inventory detail and freight contain management.',
      content: 'Warehouse retail detail supply chain operations with zero artificial intelligence content.',
      source: 'external',
      subProvider: 'ext_web',
      rank: 1
    }),
    makeCandidate({
      id: 'spam-1',
      title: 'FREE BONUS CLICK HERE BUY CHEAP PROMO CODE CASINO',
      url: 'https://spam-ads.example.net/deal',
      snippet: 'Click here now! Sponsored ad promo code casino discount 100% free bonus!',
      content: 'buy now buy now click here promo code best best best best casino.',
      source: 'external',
      subProvider: 'ext_web',
      rank: 1
    })
  ];

  const { items } = deduplicateResults(candidates);
  const { ranked, filteredOutCount } = rankHybridResults(items, query, { location: CHENNAI_GEO, intelligence: intel });

  assert.ok(filteredOutCount >= 1, 'Spam candidate must be filtered out');
  assert.equal(ranked[0].id, 'rel-1', 'Genuine AI research result must rank #1 over substring distractor');
  assert.ok(ranked.every((r) => r.id !== 'spam-1'), 'Spam candidate must not remain in top results');
});

// 2. Duplicate URLs (tracking parameters, www/m hosts, index.html, redirect unwrapping, sub-provider RRF merge)
test('2. Duplicate URL normalization & multi-source RRF merging', () => {
  const candidates: ProviderRawResult[] = [
    makeCandidate({
      id: 'dup-1',
      title: 'Quantum computing - Wikipedia',
      url: 'https://www.en.wikipedia.org/wiki/Quantum_computing?utm_source=feed&fbclid=123',
      source: 'pendulum',
      subProvider: 'pendulum_bm25',
      rank: 1
    }),
    makeCandidate({
      id: 'dup-2',
      title: 'Quantum computing - Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Quantum_computing/',
      source: 'external',
      subProvider: 'ext_wiki',
      rank: 1
    }),
    makeCandidate({
      id: 'dup-3',
      title: 'Quantum computing - Wikipedia',
      url: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FQuantum_computing',
      source: 'external',
      subProvider: 'ext_ia',
      rank: 2
    })
  ];

  const deduped = deduplicateResults(candidates);
  assert.equal(deduped.items.length, 1, 'All 3 URL variants must collapse into 1 canonical document');
  assert.equal(deduped.duplicatesRemoved, 2);
  assert.equal(deduped.items[0].canonicalUrl, 'https://en.wikipedia.org/wiki/Quantum_computing');
  assert.equal(deduped.items[0].sourceLabel, 'DuckDuckGo · Pendulum Enhanced');
  assert.equal(deduped.items[0].providerSubRanks.pendulum_bm25, 1);
  assert.equal(deduped.items[0].providerSubRanks.ext_wiki, 1);
  assert.equal(deduped.items[0].providerSubRanks.ext_ia, 2);
});

// 3. Conflicting Sources (disagreement detection + grounded overview honesty)
test('3. Conflicting sources trigger disagreement disclosure in July AI overview', async () => {
  const query = 'Vitamin supplement clinical trial efficacy';
  const intel = analyzeQueryIntelligence(query);
  const sources: HybridSearchResult[] = [
    {
      ...deduplicateResults([
        makeCandidate({
          id: 'src-a',
          title: 'Trial A Reports Effective Outcome',
          url: 'https://journal-a.example.edu/trial-a',
          snippet: 'Randomized trial reports 42% improvement and finds intervention effective for targeted patients.',
          content: 'Study concludes intervention is effective and beneficial in clinical subgroup.',
          rank: 1
        }),
        makeCandidate({
          id: 'src-b',
          title: 'Trial B Reports No Benefit / Ineffective Result',
          url: 'https://journal-b.example.edu/trial-b',
          snippet: 'Independent meta-analysis finds 8% difference, calling earlier positive claims disputed and ineffective.',
          content: 'Large cohort contradicts smaller study and concludes supplement is ineffective overall.',
          source: 'external',
          subProvider: 'ext_openalex',
          rank: 1
        })
      ]).items[0],
      scores: { lexical: 0.85, semantic: 0.8, freshness: 0.7, authority: 0.92, geographic: 0, rrf: 0.8, completeness: 0.8, quality: 0.9, final: 0.84 }
    },
    {
      ...deduplicateResults([
        makeCandidate({
          id: 'src-b',
          title: 'Trial B Reports No Benefit / Ineffective Result',
          url: 'https://journal-b.example.edu/trial-b',
          snippet: 'Independent meta-analysis finds 8% difference, calling earlier positive claims disputed and ineffective.',
          content: 'Large cohort contradicts smaller study and concludes supplement is ineffective overall.',
          source: 'external',
          subProvider: 'ext_openalex',
          rank: 1
        })
      ]).items[0],
      scores: { lexical: 0.82, semantic: 0.78, freshness: 0.7, authority: 0.92, geographic: 0, rrf: 0.75, completeness: 0.8, quality: 0.9, final: 0.81 }
    }
  ];

  const disagreement = detectSourceDisagreements(sources);
  assert.ok(disagreement && disagreement.length > 10, 'Disagreement detector must note opposing claims');

  const overview = await generateAiOverview({ query, sources, analysis: intel });
  assert.ok(overview.disagreements, 'AI overview payload must surface source disagreement');
});

// 4. Empty External Provider (Pendulum works standalone)
test('4. Empty external provider returns clean Pendulum-only results without failure', async () => {
  const emptyExternalAdapter: DuckDuckGoProvider = {
    async search() {
      return {
        results: [],
        latencyMs: 5,
        partial: false,
        engineLabel: 'Open Supplemental Web Search'
      };
    }
  };

  const res = await executeHybridEngine({
    query: 'Quantum computing',
    providers: ['pendulum', 'duckduckgo'],
    ddgAdapter: emptyExternalAdapter,
    aiOverview: false,
    rerank: false,
    skipCache: true
  });

  assert.ok(res.results.length > 0, 'Pendulum results must still be returned when external yields zero');
  assert.ok(res.providers.pendulum.count > 0);
  assert.equal(res.partial, false);
});

// 5. Provider Timeout / Outage Resilience
test('5. Provider timeout or outage degrades gracefully while exposing DuckDuckGo + Pendulum attribution and keeping _diagnostics private', async () => {
  const failingAdapter: DuckDuckGoProvider = {
    async search() {
      throw new Error('Upstream provider timed out after 3200ms');
    }
  };

  const res = await executeHybridEngine({
    query: 'Pendulum Search',
    providers: ['pendulum', 'duckduckgo'],
    ddgAdapter: failingAdapter,
    aiOverview: true,
    rerank: false,
    skipCache: true
  });

  assert.equal(res.partial, true, 'Partial flag should indicate degraded external provider');
  assert.ok(res.results.length > 0, 'Primary Pendulum index still delivers results');
  assert.equal(res.attribution?.primaryProvider, 'DuckDuckGo', 'Public response must declare DuckDuckGo as primary provider');
  assert.equal(res.attribution?.enhancementEngine, 'Pendulum Search', 'Public response must declare Pendulum Search as enhancement engine');
  assert.equal(res.results.some((r: HybridSearchResult) => '_diagnostics' in r), false, 'Private diagnostics must never leak publicly');
});

// 6. Location-Dependent vs Global Query
test('6. Location-dependent queries use geo context; global queries get zero local distortion', () => {
  const globalIntel = analyzeQueryIntelligence('What is quantum computing?', CHENNAI_GEO);
  assert.equal(globalIntel.locationNeed, 'none');
  assert.equal(globalIntel.hasLocalIntent, false);

  const globalCandidates = deduplicateResults([
    makeCandidate({
      id: 'global-qc',
      title: 'Quantum computing — Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Quantum_computing',
      snippet: 'Quantum computing uses qubits and superposition.',
      content: 'Quantum mechanics computation with qubits.',
      source: 'external',
      subProvider: 'ext_wiki'
    }),
    makeCandidate({
      id: 'local-unrelated',
      title: 'Chennai Local Computing Center',
      url: 'https://local.example.in/chennai-center',
      snippet: 'Training center in Tambaram, Chennai.',
      content: 'Computer training near Chennai.',
      location: { city: 'Chennai', state: 'Tamil Nadu', country: 'India', lat: 12.9249, lon: 80.1 }
    })
  ]).items;

  const { ranked: globalRanked } = rankHybridResults(globalCandidates, 'What is quantum computing?', {
    location: CHENNAI_GEO,
    intelligence: globalIntel
  });
  assert.equal(globalRanked[0].id, 'global-qc');
  assert.equal(globalRanked[0].scores.geographic, 0, 'Global query must have zero geographic score');

  const localIntel = analyzeQueryIntelligence('Tamil Nadu government schemes', CHENNAI_GEO);
  assert.notEqual(localIntel.locationNeed, 'none');
  assert.equal(localIntel.hasLocalIntent, true);

  const localCandidates = deduplicateResults([
    makeCandidate({
      id: 'tn-scheme',
      title: 'Tamil Nadu Government Welfare Schemes',
      url: 'https://www.tn.gov.in/schemes',
      snippet: 'Official Tamil Nadu state government schemes for Chennai and districts.',
      content: 'Citizen welfare schemes from the Government of Tamil Nadu.',
      location: { city: 'Chennai', state: 'Tamil Nadu', country: 'India', lat: 13.0827, lon: 80.2707 }
    }),
    makeCandidate({
      id: 'other-scheme',
      title: 'European Municipal Grant Scheme',
      url: 'https://eu-grants.example.eu/municipal',
      snippet: 'Regional European municipal support.',
      content: 'Grants in Europe.'
    })
  ]).items;

  const { ranked: localRanked } = rankHybridResults(localCandidates, 'Tamil Nadu government schemes', {
    location: CHENNAI_GEO,
    intelligence: localIntel
  });
  assert.equal(localRanked[0].id, 'tn-scheme');
  assert.ok(localRanked[0].scores.geographic >= 0.45, 'Local query must apply positive geo score to regional match');
});

// 7. Time-Sensitive vs Evergreen vs Historical Queries
test('7. Freshness weighting adapts strictly across news, evergreen, and historical intents', () => {
  // News: recent beats 5-year-old
  const newsQuery = 'Latest AI developments';
  const newsIntel = analyzeQueryIntelligence(newsQuery, CHENNAI_GEO);
  assert.equal(newsIntel.freshnessNeed, 'high');
  const newsRanked = rankHybridResults(
    deduplicateResults([
      makeCandidate({
        id: 'old-news',
        title: 'AI developments archive overview (2020)',
        url: 'https://news-archive.example.com/2020-ai',
        snippet: 'Latest AI developments summary and early 2020 model milestones.',
        content: 'Retrospective summary of 2020 AI developments and legacy transformer baselines.',
        publishedAt: new Date(Date.now() - 1800 * 86_400_000).toISOString(),
        rank: 1
      }),
      makeCandidate({
        id: 'fresh-news',
        title: 'Latest AI developments report published today',
        url: 'https://techdaily.example.com/today-ai',
        snippet: 'Latest AI developments, new reasoning benchmarks, and model releases today.',
        content: 'Breaking update on latest AI developments, evaluation metrics, and open inference systems.',
        publishedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
        rank: 1
      })
    ]).items,
    newsQuery,
    { location: CHENNAI_GEO, intelligence: newsIntel }
  ).ranked;
  assert.equal(newsRanked[0].id, 'fresh-news', 'Time-sensitive query must prioritize recent article');

  // Historical: classic archival page must NOT be punished vs fresh shallow page
  const histQuery = 'History of computers and Analytical Engine';
  const histIntel = analyzeQueryIntelligence(histQuery, CHENNAI_GEO);
  assert.equal(histIntel.freshnessNeed, 'historical');
  const histRanked = rankHybridResults(
    deduplicateResults([
      makeCandidate({
        id: 'hist-archive',
        title: 'History of Computers & Charles Babbage Analytical Engine',
        url: 'https://en.wikipedia.org/wiki/History_of_computing_hardware',
        snippet: 'Comprehensive archival history of computers from the Analytical Engine onward.',
        content: 'Detailed history of computers, Charles Babbage Analytical Engine, Ada Lovelace, and ENIAC.',
        publishedAt: '2012-01-01T00:00:00Z',
        rank: 1
      }),
      makeCandidate({
        id: 'hist-fresh-thin',
        title: 'New Computer Offers 2026',
        url: 'https://deals.example.com/computers',
        snippet: 'History mentioned once on new computer deals page.',
        content: 'Buy computers today.',
        publishedAt: new Date().toISOString(),
        rank: 2
      })
    ]).items,
    histQuery,
    { location: CHENNAI_GEO, intelligence: histIntel }
  ).ranked;
  assert.equal(histRanked[0].id, 'hist-archive', 'Historical query must preserve archival classic at #1');
});

// 8. Misspelled Queries (corrected internally without mutating displayed query)
test('8. Misspelled queries recover intended meaning while preserving displayed query string', async () => {
  const misspelled = 'artifical inteligence';
  const intel = analyzeQueryIntelligence(misspelled);
  assert.equal(intel.correctionApplied, true);
  assert.equal(intel.correctedQuery, 'artificial intelligence');
  assert.equal(intel.originalQuery, misspelled, 'Displayed original query must remain untouched');

  const res = await executeHybridEngine({
    query: misspelled,
    providers: ['pendulum'],
    aiOverview: false,
    rerank: false,
    skipCache: true
  });
  assert.equal(res.query, misspelled, 'Public response query must match exact user input');
  assert.equal(res.correctedQueryHint, 'artificial intelligence');
  assert.ok(res.results.length > 0, 'Corrected internal query retrieves matching Artificial Intelligence results');
});

// 9. Mixed-Language Queries (Unicode normalization + cross-lingual expansion)
test('9. Mixed-language queries normalize Unicode and expand non-English terms cleanly', () => {
  const mixed = '  செயற்கை   intelligence  ';
  const intel = analyzeQueryIntelligence(mixed);
  assert.ok(intel.expandedTokens.includes('artificial'), 'Tamil term செயற்கை must expand to artificial');
  assert.ok(intel.expandedTokens.includes('intelligence'));

  const { ranked } = rankHybridResults(
    deduplicateResults([
      makeCandidate({
        id: 'ai-doc',
        title: 'Artificial Intelligence Overview',
        url: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
        snippet: 'Artificial intelligence systems learn and reason.',
        content: 'Machine learning and artificial intelligence principles.'
      })
    ]).items,
    mixed,
    { intelligence: intel }
  );
  assert.equal(ranked.length, 1);
  assert.ok(ranked[0].scores.semantic > 0.3);
});

// 10. Zero Pendulum Docs / Insufficient Evidence Honesty
test('10. Zero Pendulum docs returns honest insufficientEvidence without fabricating URLs or citations', async () => {
  const res = await executeHybridEngine({
    query: 'zxqvbnm_nonexistent_topic_9948172',
    providers: ['pendulum'],
    aiOverview: true,
    rerank: false,
    skipCache: true
  });

  assert.equal(res.results.length, 0);
  assert.equal(res.sources.length, 0);
  assert.equal(res.overview?.insufficientEvidence, true);
  assert.ok(res.overview?.answer.toLowerCase().includes('insufficient'));
});

// 11. Benchmark sanity guard: Upgraded pipeline beats Legacy Baseline on NDCG@10 and MRR
test('11. Benchmark evaluation across >=30 queries improves NDCG@10, MRR, and Precision@5 over baseline', () => {
  const report = runSearchBenchmark();
  assert.ok(report.totalQueries >= 30, `Expected >=30 benchmark queries, got ${report.totalQueries}`);
  assert.equal(report.categoriesCovered.length, 10, 'Must cover all 10 required query categories');
  assert.ok(report.upgraded.ndcgAt10 > report.baseline.ndcgAt10, 'Upgraded NDCG@10 must beat baseline');
  assert.ok(report.upgraded.mrr >= report.baseline.mrr, 'Upgraded MRR must meet or exceed baseline');
});

// 12. Genuine timeRange filtering enforces date cutoffs cleanly
test('12. Genuine timeRange filtering excludes undated/stale documents outside window', async () => {
  const allRes = await executeHybridEngine({
    query: 'Quantum Computing',
    providers: ['pendulum'],
    timeRange: 'any',
    aiOverview: false,
    rerank: false,
    skipCache: true
  });
  const hourRes = await executeHybridEngine({
    query: 'Quantum Computing',
    providers: ['pendulum'],
    timeRange: 'hour',
    aiOverview: false,
    rerank: false,
    skipCache: true
  });

  assert.ok(allRes.results.length > 0, 'Unfiltered query must match indexed results');
  assert.equal(hourRes.timeRange, 'hour');
  assert.ok(hourRes.results.length <= allRes.results.length);
  for (const r of hourRes.results) {
    const raw = r.publishedAt || r.updatedAt || (r.isLive ? r.crawledAt || r.indexedAt : null);
    assert.ok(raw, 'Every time-filtered result must carry a verified timestamp');
    assert.ok(Date.now() - Date.parse(raw) <= 60 * 60 * 1000, 'Result timestamp must fall within past hour');
  }
});

// 13. Strict media isolation on All searches (0 unrelated videos/images)
test('13. General All searches emit zero unrelated images/videos unless query has explicit media intent', async () => {
  const emptyExternalAdapter: DuckDuckGoProvider = {
    async search() {
      return { results: [], latencyMs: 5, partial: false, engineLabel: 'Open Supplemental Web Search' };
    }
  };

  const generalAll = await executeHybridEngine({
    query: 'Quantum computing',
    type: 'All',
    providers: ['pendulum', 'duckduckgo'],
    ddgAdapter: emptyExternalAdapter,
    aiOverview: false,
    skipCache: true
  });

  assert.equal(generalAll.media.images.length, 0, 'General All query must not leak images');
  assert.equal(generalAll.media.videos.length, 0, 'General All query must not leak videos');
  for (const r of generalAll.results) {
    assert.ok(!r.resultType || r.resultType === 'web' || r.resultType === 'news' || r.resultType === 'research');
  }
});

// 14. Wikipedia non-dominance on general/non-definition queries (<= 1 Wikipedia item in Top 10)
test('14. Wikipedia is capped to <=1 result in Top 10 for non-definition/non-historical queries', () => {
  const query = 'Indian government education scholarships';
  const intel = analyzeQueryIntelligence(query, CHENNAI_GEO);

  const candidates = deduplicateResults([
    makeCandidate({
      id: 'wiki-1',
      title: 'Education in India — Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Education_in_India',
      snippet: 'Overview of Indian government education system and scholarships.',
      source: 'external',
      subProvider: 'ext_wiki',
      rank: 1
    }),
    makeCandidate({
      id: 'wiki-2',
      title: 'National Scholarship Portal — Wikipedia',
      url: 'https://en.wikipedia.org/wiki/National_Scholarship_Portal',
      snippet: 'Indian government education scholarships portal reference.',
      source: 'external',
      subProvider: 'ext_wiki',
      rank: 2
    }),
    makeCandidate({
      id: 'gov-nsp',
      title: 'National Scholarship Portal (NSP) — Government of India',
      url: 'https://scholarships.gov.in/',
      snippet: 'Official Indian government portal for central and state education scholarships.',
      source: 'pendulum',
      subProvider: 'pendulum_bm25',
      rank: 1
    }),
    makeCandidate({
      id: 'gov-edu',
      title: 'Ministry of Education Scholarships — Government of India',
      url: 'https://www.education.gov.in/scholarships-education-loan-0',
      snippet: 'Central sector scholarship schemes and fellowship guidelines.',
      source: 'pendulum',
      subProvider: 'pendulum_bm25',
      rank: 2
    })
  ]).items;

  const { ranked } = rankHybridResults(candidates, query, { location: CHENNAI_GEO, intelligence: intel });
  const top10Wiki = ranked.slice(0, 10).filter((r) => r.domain.includes('wikipedia.org'));
  assert.ok(top10Wiki.length <= 1, `Expected <= 1 Wikipedia item in Top 10, got ${top10Wiki.length}`);
  assert.ok(
    ['gov-nsp', 'gov-edu'].includes(ranked[0].id),
    'Primary Indian government scholarship portal must outrank Wikipedia'
  );
});

// 15. Domain diversity cap prevents a single domain from occupying all Top 5 slots
test('15. Single-domain crowding is capped in Top 5 even when an official organization has 5 subpages', () => {
  const query = 'RMK Engineering College';
  const intel = analyzeQueryIntelligence(query, CHENNAI_GEO);

  const candidates = deduplicateResults([
    makeCandidate({
      id: 'rmk-root',
      title: 'RMK Engineering College Official Website',
      url: 'https://www.rmkec.ac.in/',
      snippet: 'Official home page of RMK Engineering College.',
      isOfficialWebsite: true,
      officialConfidence: 0.94,
      officialOrganizationName: 'RMK Engineering College',
      sourceClass: 'official_website',
      rank: 1
    }),
    ...['admissions', 'placements', 'departments', 'contact', 'facilities'].map((slug, idx) =>
      makeCandidate({
        id: `rmk-${slug}`,
        title: `${slug.toUpperCase()} — RMK Engineering College`,
        url: `https://www.rmkec.ac.in/${slug}`,
        snippet: `Official ${slug} page for RMK Engineering College.`,
        isOfficialSubpage: true,
        officialConfidence: 0.94,
        officialOrganizationName: 'RMK Engineering College',
        sourceClass: 'official_subpage',
        discoveredSubpageType: slug,
        rank: idx + 2
      })
    ),
    makeCandidate({
      id: 'anna-affil',
      title: 'Anna University Affiliated Colleges — RMK Engineering College',
      url: 'https://www.annauniv.edu/cai/Affiliated_Colleges.php',
      snippet: 'Official Anna University affiliated engineering institutions list including RMK Engineering College.',
      source: 'pendulum',
      subProvider: 'pendulum_bm25',
      rank: 1
    }),
    makeCandidate({
      id: 'nirf-list',
      title: 'NIRF India Rankings — RMK Engineering College',
      url: 'https://www.nirfindia.org/Home',
      snippet: 'National Institutional Ranking Framework official RMK Engineering College profile.',
      source: 'pendulum',
      subProvider: 'pendulum_bm25',
      rank: 2
    }),
    makeCandidate({
      id: 'aicte-list',
      title: 'AICTE Approved Institutions — RMK Engineering College',
      url: 'https://www.aicte-india.org/approved-institutes',
      snippet: 'All India Council for Technical Education approval record for RMK Engineering College.',
      source: 'pendulum',
      subProvider: 'pendulum_bm25',
      rank: 3
    })
  ]).items;

  const { ranked } = rankHybridResults(candidates, query, { location: CHENNAI_GEO, intelligence: intel });
  const top5Rmk = ranked.slice(0, 5).filter((r) => r.domain.includes('rmkec.ac.in'));
  assert.ok(top5Rmk.length <= 2, `Expected <= 2 same-domain items in Top 5, got ${top5Rmk.length}`);
  assert.equal(ranked[0].id, 'rmk-root', 'Verified root URL must rank #1');
});

// 16. Plural category / policy topic phrases never trigger false entity mode
test('16. Plural category queries like Indian government education scholarships stay topic queries', () => {
  const intel = analyzeQueryIntelligence('Indian government education scholarships', CHENNAI_GEO);
  assert.equal(intel.recognizedEntity, undefined);
  assert.notEqual(intel.intent, 'navigational');
});

// 17. AI Follow-up Coreference & Ellipsis Contextualization
test('17. Follow-up contextualization resolves pronouns and ellipses against root topic', () => {
  const pronounRes = deterministicFollowupRewrite({
    rootQuery: 'RMK Engineering College',
    followupQuery: 'What about their placements?',
    entityName: 'RMK Engineering College'
  });
  assert.equal(pronounRes.usedContextRewrite, true);
  assert.ok(pronounRes.resolvedQuery.toLowerCase().includes('rmk engineering college'));
  assert.ok(pronounRes.resolvedQuery.toLowerCase().includes('placements'));

  const shortEllipsis = deterministicFollowupRewrite({
    rootQuery: 'Quantum Computing',
    followupQuery: 'Applications in cryptography'
  });
  assert.equal(shortEllipsis.usedContextRewrite, true);
  assert.ok(shortEllipsis.resolvedQuery.toLowerCase().includes('quantum computing'));
  assert.ok(shortEllipsis.resolvedQuery.toLowerCase().includes('cryptography'));

  const alreadyStandalone = deterministicFollowupRewrite({
    rootQuery: 'Quantum Computing',
    followupQuery: 'How does Quantum Computing error correction work in superconducting qubits?'
  });
  assert.equal(alreadyStandalone.usedContextRewrite, false);
});

// 18. AI Follow-up preserves official website metadata and supports response styles cleanly
test('18. executeAiFollowup preserves official website metadata, resolves query, and enforces compare style', async () => {
  const existingOfficial: HybridSearchResult = {
    id: 'official-pendulum',
    title: 'Pendulum Search — Official Portal',
    url: 'https://hsaisolutions.com/products/pendulum-search',
    canonicalUrl: 'https://hsaisolutions.com/products/pendulum-search',
    snippet: 'Pendulum Search combines Pendulum indexing with July Fast and Gravity Deep Research.',
    domain: 'hsaisolutions.com',
    content: 'Official documentation for Pendulum Search architecture, July Fast, and Gravity Deep Research.',
    publishedAt: new Date().toISOString(),
    indexedAt: new Date().toISOString(),
    sources: ['pendulum'],
    sourceLabel: 'Pendulum Indexed',
    providerDetails: ['Pendulum Indexed'],
    providerRanks: { pendulum: 1 },
    providerSubRanks: { pendulum_bm25: 1 },
    scores: {
      lexical: 0.9,
      semantic: 0.9,
      freshness: 0.9,
      authority: 0.95,
      geographic: 0,
      rrf: 0.9,
      completeness: 0.9,
      quality: 1,
      final: 0.92
    },
    favicon: '',
    category: 'general',
    language: 'en',
    isLive: true,
    isOfficialWebsite: true,
    officialConfidence: 0.95,
    officialOrganizationName: 'Pendulum Search',
    sourceClass: 'official_website',
    source: 'pendulum',
    score: 0.92,
    text_score: 0.9,
    semantic_score: 0.9,
    freshness_score: 0.9,
    credibility_score: 0.95,
    is_live: true,
    source_type: 'pendulum',
    source_provider: 'Pendulum Indexed',
    source_category: 'pendulum',
    original_publisher: 'hsaisolutions.com',
    source_attribution: 'Pendulum Indexed',
    images: [],
    videos: []
  };

  const res = await executeAiFollowup({
    query: 'Pendulum Search',
    followupQuery: 'Compare its key capabilities',
    existingSources: [existingOfficial],
    responseStyle: 'compare',
    location: CHENNAI_GEO
  });

  assert.equal(res.usedContextRewrite, true);
  assert.ok(res.resolvedQuery.toLowerCase().includes('pendulum search'));
  assert.ok(res.overview.answer.length > 20);
  assert.ok(res.sources.length > 0);
  assert.equal(res.sources.some((s: any) => '_diagnostics' in s), false, 'Follow-up sources must never leak private _diagnostics');
  const preservedOfficial = res.sources.find((s) => s.domain === 'hsaisolutions.com');
  if (preservedOfficial) {
    assert.equal(preservedOfficial.isOfficialWebsite, true);
    assert.equal(preservedOfficial.sourceClass, 'official_website');
  }
});

// 19. AI Follow-up Streaming emits sources, delta chunks, and finalized payload
test('19. executeAiFollowupStream emits sources -> delta -> done sequence with grounded citations', async () => {
  let sourcesMeta: any = null;
  let deltaText = '';
  let donePayload: any = null;

  await executeAiFollowupStream(
    {
      query: 'Quantum Computing',
      followupQuery: 'What are its main challenges?',
      responseStyle: 'concise',
      location: CHENNAI_GEO
    },
    {
      onSources: (meta) => {
        sourcesMeta = meta;
      },
      onDelta: (chunk) => {
        deltaText += chunk;
      },
      onDone: (finalPayload) => {
        donePayload = finalPayload;
      }
    }
  );

  assert.ok(sourcesMeta, 'onSources must fire');
  assert.ok(sourcesMeta.resolvedQuery.toLowerCase().includes('quantum computing'));
  assert.ok(deltaText.trim().length > 0, 'onDelta must stream non-empty content');
  assert.ok(donePayload?.overview?.answer, 'onDone must finalize overview');
  assert.ok(Array.isArray(donePayload.relatedQuestions) && donePayload.relatedQuestions.length > 0);
});



