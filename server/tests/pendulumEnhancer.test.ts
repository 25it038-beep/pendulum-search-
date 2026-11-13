import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeCandidateQuality,
  analyzeCandidateRelevance,
  enhanceSearchResults,
  EnrichedPageData,
  parseHtmlToEnrichedPage,
  validateCandidateSource
} from '../enhancer/resultEnhancer';
import { deduplicateResults } from '../hybrid/deduplicator';
import { rankHybridResults } from '../hybrid/ranker';
import {
  DuckDuckGoProvider,
  parseAndValidateOrganicItems
} from '../providers/duckduckgoProvider';
import { analyzeQueryIntelligence } from '../query/intelligence';
import { executeHybridEngine, runAcceptanceSuite } from '../searchEngine';
import { GeoLocationContext, ProviderRawResult } from '../types';

const CHENNAI_GEO: GeoLocationContext = {
  country: 'India',
  countryCode: 'IN',
  region: 'Tamil Nadu',
  city: 'Chennai',
  lat: 12.9249,
  lon: 80.1,
  enabled: true
};

// 1. Exact original user query preservation when calling primary web search provider
test('A. Primary web provider always receives the exact original user query untouched', async () => {
  const capturedQueries: string[] = [];
  const spyProvider: DuckDuckGoProvider = {
    name: 'SpyPrimaryWebProvider',
    async search(query: string) {
      capturedQueries.push(query);
      return {
        results: [
          {
            id: 'spy-1',
            title: 'Python 3.13 Documentation',
            url: 'https://docs.python.org/3/',
            snippet: 'Official Python programming language documentation, tutorials, and library reference.',
            domain: 'docs.python.org',
            content: 'Official Python documentation covering standard library and tutorials.',
            publishedAt: null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'primary_web_organic',
            providerDetail: 'docs.python.org',
            providerType: 'primary_web_search',
            rank: 1,
            originalRank: 1,
            rawScore: 0.96,
            resultType: 'web',
            category: 'general',
            language: 'en'
          }
        ],
        engineLabel: 'Primary Organic Web Search',
        partial: false,
        telemetry: {
          strategyUsed: 'searxng',
          providerQuery: query,
          rawStatus: 200,
          contentType: 'application/json',
          rawOrganicCount: 1,
          parsedCount: 1,
          rejectedCount: 0,
          rejectionReasons: {},
          genuineWebUrlCount: 1,
          hasFullOrganicResults: true,
          errors: [],
          latencyMs: 12
        }
      };
    }
  };

  // Query with intentional typo + entity + currency symbol
  const testQueries = [
    'artifical inteligence',
    'RMK College admissions',
    'Best laptops under ₹70,000'
  ];

  for (const q of testQueries) {
    await executeHybridEngine({
      query: q,
      skipCache: true,
      aiOverview: false,
      disableEntityDiscovery: true,
      ddgAdapter: spyProvider,
      enhancerOptions: { enableLiveFetch: false },
      location: CHENNAI_GEO
    });
  }

  assert.deepEqual(
    capturedQueries,
    testQueries,
    'Primary web provider must receive every user query verbatim without spell-rewrite or keyword injection'
  );
});

// 2. Strict Primary Organic Parser & Validation Telemetry
test('B. parseAndValidateOrganicItems preserves originalRank, unwraps DDG redirects, and rejects invalid/ad/media/blocked URLs', () => {
  const rawItems = [
    {
      title: 'Official Anna University Portal',
      url: 'https://www.annauniv.edu/',
      content: 'Official portal of Anna University, Chennai.'
    },
    {
      title: 'Unwrapped Target Result',
      url: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.python.org%2F3%2Ftutorial%2F',
      content: 'The Python Tutorial.'
    },
    {
      title: 'Duplicate URL Check',
      url: 'https://docs.python.org/3/tutorial/',
      content: 'Should be rejected as duplicate.'
    },
    {
      title: 'Ad Tracking Link',
      url: 'https://googleadservices.com/pagead/aclk?sa=L',
      content: 'Sponsored link.'
    },
    {
      title: 'Direct Image in Web Stream',
      url: 'https://example.org/banner-hero.jpg',
      content: 'Image asset.'
    },
    {
      title: 'Internal Localhost SSRF Attempt',
      url: 'http://127.0.0.1:8080/admin',
      content: 'Blocked host.'
    },
    {
      title: '',
      url: 'https://example.org/no-title',
      content: 'Missing title.'
    },
    {
      title: 'Missing URL Item',
      url: '',
      content: 'No URL.'
    }
  ];

  const out = parseAndValidateOrganicItems(rawItems, { limit: 20 });
  assert.equal(out.rawOrganicCount, 8);
  assert.equal(out.parsedCount, 2);
  assert.equal(out.rejectedCount, 6);
  assert.equal(out.genuineWebUrlCount, 2);
  assert.equal(out.parsed[0].originalRank, 1);
  assert.equal(out.parsed[1].originalRank, 2);
  assert.equal(out.parsed[1].url, 'https://docs.python.org/3/tutorial/');
  assert.equal(out.parsed[1].providerType, 'primary_web_search');
  assert.equal(out.rejectionReasons.duplicate_url, 1);
  assert.equal(out.rejectionReasons.ad_or_provider_internal_url, 1);
  assert.equal(out.rejectionReasons.media_file_in_web_stream, 1);
  assert.equal(out.rejectionReasons.blocked_host, 1);
  assert.equal(out.rejectionReasons.missing_title, 1);
  assert.equal(out.rejectionReasons.missing_url, 1);
});

// 3. PendulumResultEnhancer HTML parsing, metadata enrichment, quality gating, and conservative validation
test('C. parseHtmlToEnrichedPage & PendulumResultEnhancer extract metadata, reject error/CAPTCHA stubs, and validate fairly', async () => {
  const richNewsHtml = `
    <!doctype html>
    <html>
      <head>
        <title>Independent Benchmark Report: Modern Web Search Ranking</title>
        <meta name="description" content="Detailed evaluation of retrieval pipelines and entity disambiguation." />
        <meta property="article:published_time" content="2026-09-18T10:30:00Z" />
        <link rel="canonical" href="https://independent-lab.org/reports/search-ranking" />
        <script type="application/ld+json">
          {
            "@type": "NewsArticle",
            "datePublished": "2026-09-18T10:30:00Z",
            "author": { "@type": "Person", "name": "Priya Natarajan" },
            "publisher": { "@type": "Organization", "name": "Independent Search Lab" }
          }
        </script>
      </head>
      <body>
        <nav>Skip navigation menu links</nav>
        <main>
          <h1>Modern Web Search Ranking Benchmarks</h1>
          <h2>Methodology and Retrieval Quality</h2>
          <p>How search engines index, evaluate, and rank documents determines user trust and answer accuracy across technical and institutional queries.</p>
        </main>
      </body>
    </html>
  `;

  const parsed = parseHtmlToEnrichedPage(
    richNewsHtml,
    'https://independent-lab.org/reports/search-ranking?utm_source=test',
    'https://independent-lab.org/reports/search-ranking',
    200,
    'text/html'
  );
  assert.equal(parsed.title, 'Independent Benchmark Report: Modern Web Search Ranking');
  assert.equal(parsed.metaDescription, 'Detailed evaluation of retrieval pipelines and entity disambiguation.');
  assert.deepEqual(parsed.headings, ['Modern Web Search Ranking Benchmarks', 'Methodology and Retrieval Quality']);
  assert.equal(parsed.canonicalUrl, 'https://independent-lab.org/reports/search-ranking');
  assert.equal(parsed.author, 'Priya Natarajan');
  assert.equal(parsed.publisher, 'Independent Search Lab');
  assert.equal(parsed.structuredType, 'NewsArticle');
  assert.ok(parsed.mainContent.includes('How search engines index'));

  const query = 'RMK Engineering College';
  const intel = analyzeQueryIntelligence(query, CHENNAI_GEO);

  const rawCandidates: ProviderRawResult[] = [
    {
      id: 'c-official',
      title: 'R.M.K. Engineering College',
      url: 'https://www.rmkec.ac.in/',
      snippet: 'Autonomous engineering institution in Kavaraipettai.',
      domain: 'rmkec.ac.in',
      content: 'R.M.K. Engineering College official portal.',
      publishedAt: null,
      indexedAt: new Date().toISOString(),
      source: 'external',
      subProvider: 'primary_web_organic',
      providerDetail: 'rmkec.ac.in',
      providerType: 'primary_web_search',
      rank: 1,
      originalRank: 1,
      rawScore: 0.96,
      resultType: 'web',
      category: 'general',
      language: 'en'
    },
    {
      id: 'c-directory',
      title: 'RMK Engineering College Fees & Cutoff - Shiksha',
      url: 'https://www.shiksha.com/college/rmk-engineering-college',
      snippet: 'Read reviews and fee details for RMK Engineering College.',
      domain: 'shiksha.com',
      content: 'Educational directory listing.',
      publishedAt: null,
      indexedAt: new Date().toISOString(),
      source: 'external',
      subProvider: 'primary_web_organic',
      providerDetail: 'shiksha.com',
      providerType: 'primary_web_search',
      rank: 2,
      originalRank: 2,
      rawScore: 0.9,
      resultType: 'web',
      category: 'general',
      language: 'en'
    },
    {
      id: 'c-captcha',
      title: 'Attention Required! | Cloudflare',
      url: 'https://blocked-portal.example.org/rmk',
      snippet: 'Please verify you are human.',
      domain: 'blocked-portal.example.org',
      content: 'Just a moment... Enable JavaScript and cookies to continue.',
      publishedAt: null,
      indexedAt: new Date().toISOString(),
      source: 'external',
      subProvider: 'primary_web_organic',
      providerDetail: 'blocked-portal.example.org',
      providerType: 'primary_web_search',
      rank: 3,
      originalRank: 3,
      rawScore: 0.85,
      resultType: 'web',
      category: 'general',
      language: 'en'
    }
  ];

  const mockPages: Record<string, EnrichedPageData> = {
    'https://www.rmkec.ac.in/': {
      url: 'https://www.rmkec.ac.in/',
      finalUrl: 'https://www.rmkec.ac.in/',
      httpStatus: 200,
      contentType: 'text/html',
      title: 'R.M.K. Engineering College | Official Website',
      metaDescription: 'R.M.K. Engineering College (Autonomous), Kavaraipettai, Tiruvallur, Tamil Nadu.',
      headings: ['R.M.K. Engineering College', 'Admissions & Departments'],
      mainContent: 'R.M.K. Engineering College is an autonomous engineering institution affiliated to Anna University, Chennai.',
      publisher: 'R.M.K. Engineering College',
      structuredType: 'CollegeOrUniversity'
    },
    'https://www.shiksha.com/college/rmk-engineering-college': {
      url: 'https://www.shiksha.com/college/rmk-engineering-college',
      finalUrl: 'https://www.shiksha.com/college/rmk-engineering-college',
      httpStatus: 200,
      contentType: 'text/html',
      title: 'RMK Engineering College Courses & Fees - Shiksha',
      metaDescription: 'Portal reviews and cutoff comparison.',
      headings: ['RMK Engineering College Overview'],
      mainContent: 'Third-party college reviews, fee comparison, and student ratings for RMK Engineering College.'
    },
    'https://blocked-portal.example.org/rmk': {
      url: 'https://blocked-portal.example.org/rmk',
      finalUrl: 'https://blocked-portal.example.org/rmk',
      httpStatus: 403,
      contentType: 'text/html',
      title: 'Attention Required! | Cloudflare',
      metaDescription: '',
      headings: [],
      mainContent: 'Attention Required! Verify you are human. 403 Forbidden.'
    }
  };

  const enhanced = await enhanceSearchResults(rawCandidates, query, intel, {
    enableLiveFetch: true,
    maxLiveFetches: 5,
    fetchPage: async (url) => mockPages[url] || null
  });

  assert.equal(enhanced.enrichedCount, 2);
  assert.equal(enhanced.rejectedCount, 1);
  assert.equal(enhanced.rejectedPages[0].url, 'https://blocked-portal.example.org/rmk');

  const officialItem = enhanced.candidates.find((c) => c.domain === 'rmkec.ac.in');
  const directoryItem = enhanced.candidates.find((c) => c.domain === 'shiksha.com');
  assert.ok(officialItem && directoryItem);
  assert.equal(officialItem.isOfficialWebsite, true);
  assert.equal(officialItem.sourceClass, 'official_website');
  assert.equal(directoryItem.isOfficialWebsite, false, 'Directory must NEVER be falsely marked official_website');
  assert.equal(directoryItem.sourceClass, 'educational_portal');

  // Verify surface-mention-only detection & independent small-site fairness
  const surfaceItem: ProviderRawResult = {
    id: 'surf-1',
    title: 'Weekend Baking Recipes & Sourdough Bread',
    url: 'https://bakery-notes.example.org/recipes',
    snippet: 'Great artisan sourdough bread.',
    domain: 'bakery-notes.example.org',
    content: 'Flour water salt sourdough starter recipe bake at 450F. Footer mention: quantum computing newsletter.',
    publishedAt: null,
    indexedAt: new Date().toISOString(),
    source: 'external',
    subProvider: 'primary_web_organic',
    providerDetail: 'bakery-notes.example.org',
    providerType: 'primary_web_search',
    rank: 5,
    originalRank: 5,
    rawScore: 0.7,
    resultType: 'web',
    category: 'general',
    language: 'en'
  };
  const qcIntel = analyzeQueryIntelligence('Quantum computing', CHENNAI_GEO);
  const surfRel = analyzeCandidateRelevance(surfaceItem, 'Quantum computing', qcIntel);
  assert.equal(surfRel.surfaceMentionOnly, true);

  const indepGoodItem: ProviderRawResult = {
    id: 'indep-1',
    title: 'Quantum Computing Notes: Superposition & Gates',
    url: 'https://quantum-notes.example.net/gates',
    snippet: 'Clear mathematical introduction to quantum computing gates and circuits.',
    domain: 'quantum-notes.example.net',
    content: 'Quantum computing uses qubits in superposition to apply unitary quantum gates and measure interference.',
    headings: ['Quantum Computing Fundamentals', 'Single-Qubit Gates'],
    isEnriched: true,
    publishedAt: new Date().toISOString(),
    indexedAt: new Date().toISOString(),
    source: 'external',
    subProvider: 'primary_web_organic',
    providerDetail: 'quantum-notes.example.net',
    providerType: 'primary_web_search',
    rank: 2,
    originalRank: 2,
    rawScore: 0.9,
    resultType: 'web',
    category: 'general',
    language: 'en'
  };
  const indepVal = validateCandidateSource(indepGoodItem, qcIntel);
  assert.equal(indepVal.sourceClass, 'web');
  const indepQual = analyzeCandidateQuality(indepGoodItem, analyzeCandidateRelevance(indepGoodItem, 'Quantum computing', qcIntel), null);
  assert.equal(indepQual.rejected, false, 'High-relevance independent technical site must NOT be rejected');
});

// 4. Primary Organic Rank Preservation, Index Merge, Diagnostics Comparison & 10 Phase-10 Queries
test('D. Hybrid pipeline preserves primary organic leaders, exposes original vs enhanced diagnostics, and passes all 10 queries', async () => {
  const fixtures: Record<string, Array<{ title: string; url: string; snippet: string }>> = {
    'RMK Engineering College': [
      { title: 'RMK Engineering College - Wikipedia', url: 'https://en.wikipedia.org/wiki/RMK_Engineering_College', snippet: 'RMK Engineering College in Kavaraipettai.' },
      { title: 'R.M.K. Engineering College | Official Website', url: 'https://www.rmkec.ac.in/', snippet: 'Official portal of R.M.K. Engineering College.' },
      { title: 'RMK Engineering College Cutoff - Shiksha', url: 'https://www.shiksha.com/college/rmk', snippet: 'Courses, fees, and cutoff reviews.' }
    ],
    'RMK College admissions': [
      { title: 'Admissions | R.M.K. Engineering College', url: 'https://www.rmkec.ac.in/admissions', snippet: 'Official TNEA counselling and B.E./B.Tech admission guidelines.' },
      { title: 'RMK College Admissions Reviews - Careers360', url: 'https://www.careers360.com/colleges/rmk-engineering-college', snippet: 'Admission overview and student reviews.' }
    ],
    'Anna University': [
      { title: 'Anna University - Official Portal', url: 'https://www.annauniv.edu/', snippet: 'Official university website for Anna University, Chennai.' },
      { title: 'Anna University - Wikipedia', url: 'https://en.wikipedia.org/wiki/Anna_University', snippet: 'Public state university in Tamil Nadu.' }
    ],
    'Latest AI research': [
      { title: 'Recent Artificial Intelligence Research Preprints - arXiv', url: 'https://arxiv.org/list/cs.AI/recent', snippet: 'Latest machine learning and AI research papers.' },
      { title: 'Google DeepMind Research Publications', url: 'https://deepmind.google/research/', snippet: 'Latest AI research advances and scientific papers.' }
    ],
    'Python documentation': [
      { title: 'Python 3 Documentation — Official Docs', url: 'https://docs.python.org/3/', snippet: 'Official Python tutorials, standard library reference, and language docs.' },
      { title: 'Python (programming language) - Wikipedia', url: 'https://en.wikipedia.org/wiki/Python_(programming_language)', snippet: 'High-level programming language overview.' }
    ],
    'NVIDIA RTX architecture': [
      { title: 'NVIDIA Blackwell & Ada Lovelace RTX Architecture', url: 'https://www.nvidia.com/en-us/geforce/technologies/', snippet: 'Official NVIDIA RTX architecture whitepapers covering RT cores and Tensor cores.' },
      { title: 'GeForce RTX - Wikipedia', url: 'https://en.wikipedia.org/wiki/GeForce_RTX', snippet: 'GPU series overview.' }
    ],
    'How does a search engine work?': [
      { title: 'How Search Engines Work: Crawling, Indexing, and Ranking', url: 'https://developers.google.com/search/docs/fundamentals/how-search-works', snippet: 'How Google Search crawls, indexes, and serves relevant pages.' },
      { title: 'Search engine - Wikipedia', url: 'https://en.wikipedia.org/wiki/Search_engine', snippet: 'General overview of web search engines.' }
    ],
    'Best laptops under ₹70,000': [
      { title: 'Best Laptops Under ₹70,000 in India (2026 Buying Guide)', url: 'https://www.digit.in/top-products/best-laptops-under-70000-in-india', snippet: 'Tested laptops under ₹70,000 compared for battery, display, and Ryzen/Core performance.' },
      { title: 'Laptops Under Rs 70,000 Buyer Guide - 91mobiles', url: 'https://www.91mobiles.com/top-10-laptops-under-70000-in-india', snippet: 'Comparison of top laptops under ₹70,000.' }
    ],
    'Tamil Nadu government schemes': [
      { title: 'Welfare Schemes — Government of Tamil Nadu Official Portal', url: 'https://www.tn.gov.in/scheme', snippet: 'Official directory of Tamil Nadu government welfare and scholarship schemes.' },
      { title: 'Tamil Nadu Welfare Schemes Guide', url: 'https://www.myscheme.gov.in/search/state/Tamil%20Nadu', snippet: 'State citizen schemes portal.' }
    ],
    'Quantum computing': [
      { title: 'What Is Quantum Computing? | IBM', url: 'https://www.ibm.com/topics/quantum-computing', snippet: 'Quantum computing uses qubits, superposition, and entanglement.' },
      { title: 'Quantum computing - Wikipedia', url: 'https://en.wikipedia.org/wiki/Quantum_computing', snippet: 'Encyclopedic overview of quantum computation.' }
    ]
  };

  const fixtureProvider: DuckDuckGoProvider = {
    name: 'FixtureOrganicProvider',
    async search(query: string) {
      const rows = fixtures[query] || [];
      const parsed = parseAndValidateOrganicItems(
        rows.map((r) => ({ title: r.title, url: r.url, content: r.snippet })),
        { limit: 15 }
      );
      return {
        results: parsed.parsed,
        engineLabel: 'Primary Organic Web Search',
        partial: false,
        telemetry: {
          strategyUsed: 'searxng',
          providerQuery: query,
          rawStatus: 200,
          contentType: 'application/json',
          rawOrganicCount: parsed.rawOrganicCount,
          parsedCount: parsed.parsedCount,
          rejectedCount: parsed.rejectedCount,
          rejectionReasons: parsed.rejectionReasons,
          genuineWebUrlCount: parsed.genuineWebUrlCount,
          hasFullOrganicResults: parsed.parsed.length > 0,
          errors: [],
          latencyMs: 8
        }
      };
    }
  };

  // Run diagnostics comparison on RMK Engineering College where Wikipedia was #1 in raw fixture
  // and verify Pendulum Enhancer + Ranker promotes official rmkec.ac.in cleanly to #1!
  const rmkOut = await executeHybridEngine({
    query: 'RMK Engineering College',
    skipCache: true,
    includeDiagnostics: true,
    aiOverview: false,
    location: CHENNAI_GEO,
    ddgAdapter: fixtureProvider,
    enhancerOptions: { enableLiveFetch: false }
  });

  assert.equal(rmkOut.results[0].domain, 'rmkec.ac.in', 'Official rmkec.ac.in must beat Wikipedia after Pendulum validation');
  assert.ok(rmkOut.adminDiagnostics?.comparison, 'Admin diagnostics must expose Original vs Enhanced comparison');
  assert.equal(rmkOut.adminDiagnostics.primaryProviderQuery, 'RMK Engineering College');
  assert.equal(rmkOut.adminDiagnostics.primaryProviderTelemetry.hasFullOrganicResults, true);
  assert.ok(rmkOut.adminDiagnostics.comparison.originalTop10.length >= 2);
  assert.ok(rmkOut.adminDiagnostics.comparison.enhancedTop10.length >= 2);
  assert.equal((rmkOut.results[0] as any)._diagnostics, undefined, 'Public search response must never leak _diagnostics');
  assert.equal(rmkOut.attribution?.primaryProvider, 'DuckDuckGo', 'Attribution must name DuckDuckGo as primary');
  assert.ok(rmkOut.attribution?.badgeText.includes('DuckDuckGo') && rmkOut.attribution?.badgeText.includes('Pendulum'), 'Badge text must attribute DuckDuckGo + Pendulum');
  assert.ok(
    rmkOut.results.some((r) => r.sourceLabel === 'DuckDuckGo · Pendulum Enhanced' || r.sourceLabel === 'DuckDuckGo'),
    'Results must carry DuckDuckGo / DuckDuckGo · Pendulum Enhanced source labels'
  );

  // Verify every single one of the 10 queries preserves strong primary results cleanly at the top
  for (const [q, rows] of Object.entries(fixtures)) {
    const out = await executeHybridEngine({
      query: q,
      skipCache: true,
      aiOverview: false,
      location: CHENNAI_GEO,
      ddgAdapter: fixtureProvider,
      enhancerOptions: { enableLiveFetch: false }
    });
    assert.ok(out.results.length > 0, `Expected results for "${q}"`);
    assert.equal(out.attribution?.primaryProvider, 'DuckDuckGo', `Expected DuckDuckGo primary attribution for "${q}"`);
    assert.equal(out.results.some((r: any) => '_diagnostics' in r), false, `No _diagnostics leak in "${q}"`);
    assert.ok(
      out.results.some((r) => r.sourceLabel === 'DuckDuckGo · Pendulum Enhanced' || r.sourceLabel === 'DuckDuckGo'),
      `Expected DuckDuckGo branding on results for "${q}"`
    );
    assert.ok(!out.results[0].domain.includes('wikipedia.org'), `Top result for "${q}" should not be Wikipedia when genuine primary web/official sites exist (got ${out.results[0].url})`);
    const expectedDomains = rows.map((r) => new URL(r.url).hostname.replace(/^www\./, ''));
    assert.ok(
      out.results.slice(0, 3).some((r) => expectedDomains.includes(r.domain)),
      `Top 3 for "${q}" must retain primary organic web hits`
    );
  }

  // Run full built-in acceptance suite (including all 10 Phase-10 queries)
  const suite = await runAcceptanceSuite();
  assert.ok(suite.passedCount >= 14, `Expected acceptance suite to pass cleanly, passed ${suite.passedCount}/${suite.totalCount}`);
  assert.equal(suite.phase10Queries?.length, 10, 'Acceptance suite must report all 10 Phase 10 queries');
  for (const p10 of suite.phase10Queries || []) {
    assert.equal(p10.passed, true, `Phase 10 query "${p10.query}" failed: ${JSON.stringify(p10)}`);
  }
});
