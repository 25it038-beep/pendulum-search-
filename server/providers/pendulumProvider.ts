import { GeoLocationContext, ProviderRawResult, QueryIntelligence } from '../types';
import { haversineKm, LOCAL_ENTITIES } from '../geoData';
import {
  analyzeQueryIntelligence,
  registerCorpusVocabulary,
  tokenizeBoundary
} from '../query/intelligence';

export interface NativeIndexedDoc {
  id: number;
  url: string;
  domain: string;
  title: string;
  headings?: string[];
  snippet: string;
  content_text: string;
  published_at: string | null;
  updated_at?: string | null;
  indexed_at: string;
  crawled_at: string;
  category: string;
  language: string;
  source_type: string;
  source_provider: string;
  source_category: string;
  original_publisher: string;
  source_attribution: string;
  credibility_score: number;
  is_live: boolean;
  images: Array<{ src: string; alt: string; title?: string; width?: number; height?: number }>;
  videos: Array<{ src: string; type: string; title?: string; embedUrl?: string; duration?: string }>;
  location?: Record<string, any>;
}

const nowIso = () => new Date().toISOString();

export const pendulumDocs: NativeIndexedDoc[] = [
  {
    id: 1,
    url: 'https://hs-ai-studio-4i7i.vercel.app/products/pendulum',
    domain: 'hs-ai-studio-4i7i.vercel.app',
    title: 'Pendulum — Automated Private Browser — HS AI Solutions · Harshan Seliyan B S',
    headings: [
      'Pendulum Automated Private Browser & Hybrid Search Engine',
      'Reciprocal Rank Fusion and Hybrid Ranking',
      'July and Gravity Grounded AI Overviews'
    ],
    snippet: 'Pendulum by HS AI Solutions (founded by Harshan Seliyan B S) unifies automated private browsing, proprietary web crawling, spatial geosearch, multi-provider retrieval, and July & Gravity AI overviews.',
    content_text: 'Pendulum Search (HS SEARCH) and the Pendulum Automated Private Browser are developed by HS AI Solutions and founded by Harshan Seliyan B S. It combines an autonomous crawler index with permitted external web providers via Reciprocal Rank Fusion (RRF), canonical deduplication, BM25 and vector retrieval, and grounded July & Gravity AI synthesis with clickable citations.',
    published_at: '2026-09-15T10:00:00.000Z',
    updated_at: '2026-11-01T08:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'tech',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'HS AI Solutions',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.97,
    is_live: true,
    images: [],
    videos: []
  },
  {
    id: 2,
    url: 'https://hs-ai-studio-4i7i.vercel.app/products/july-llm',
    domain: 'hs-ai-studio-4i7i.vercel.app',
    title: 'July LLM — The Autonomous Multi-Model CLI Tool · HS AI Solutions · Harshan Seliyan B S',
    headings: [
      'July Autonomous Multi-Model CLI Tool',
      'Instant One-Liner Launch & Ephemeral RAM Privacy',
      'Grounded Retrieval-Augmented Search Reasoning'
    ],
    snippet: 'July LLM by HS AI Solutions provides fast everyday grounded answers, autonomous multi-model CLI tooling, and ephemeral RAM privacy.',
    content_text: 'July LLM and Gravity LLM form the dual-tier intelligence layer of HS AI Solutions and Pendulum Search. July delivers fast multi-model CLI workflows and grounded search synthesis from retrieved evidence with clickable origin citations.',
    published_at: '2026-10-10T12:00:00.000Z',
    updated_at: '2026-11-05T09:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'tech',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'HS AI Solutions',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.96,
    is_live: true,
    images: [],
    videos: []
  },
  {
    id: 3,
    url: 'https://developers.google.com/search/docs/fundamentals/how-search-works',
    domain: 'developers.google.com',
    title: 'How Search Engines Work: Crawling, Indexing & Ranking Architecture',
    headings: [
      'Web Crawling and Frontier Discovery',
      'Inverted Index, BM25 & Semantic Vectors',
      'Artificial Intelligence and Hybrid Search Ranking'
    ],
    snippet: 'Technical guide to how modern search engines crawl webpages via robots.txt, build inverted indexes, and rank pages by relevance, quality, and artificial intelligence signals.',
    content_text: 'Search engines operate in three core stages: crawling (discovering and fetching webpages via links and sitemaps while obeying robots.txt), indexing (parsing HTML, headings, canonical URLs, and building BM25 and dense vector structures), and serving/ranking (matching user intent with artificial intelligence, authority, freshness, and geographic signals).',
    published_at: '2026-10-20T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'tech',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'Google Search Central',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.96,
    is_live: false,
    images: [],
    videos: []
  },
  {
    id: 4,
    url: 'https://www.ibm.com/topics/quantum-computing',
    domain: 'ibm.com',
    title: 'Quantum Computing — Qubits, Superposition, Entanglement & Algorithms',
    headings: [
      'Qubits, Superposition and Entanglement',
      'Quantum Logic Gates and Interference',
      'Shor and Grover Quantum Algorithms'
    ],
    snippet: 'Quantum computing harnesses quantum-mechanical phenomena including qubits, superposition, entanglement, and interference to solve specialized computational problems.',
    content_text: 'Quantum computing stores information in quantum bits (qubits) that can exist in superpositions of 0 and 1. Quantum gates manipulate qubits via unitary transformations and interference to amplify correct solution amplitudes, powering algorithms such as Shor factoring, quantum chemistry simulation, and Grover search.',
    published_at: '2026-10-18T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'academic',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'IBM Research Topics',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.94,
    is_live: false,
    images: [],
    videos: []
  },
  {
    id: 5,
    url: 'https://docs.python.org/3/',
    domain: 'docs.python.org',
    title: 'Python 3 Documentation — Language Reference & Standard Library',
    headings: [
      'Python Tutorial and Syntax Guide',
      'Standard Library and asyncio Reference',
      'Typing and Package Distribution'
    ],
    snippet: 'Official documentation for Python 3, covering syntax, asyncio, data structures, standard library modules, and ecosystem guides.',
    content_text: 'Python 3 official documentation, tutorials, library reference, async programming with asyncio, typing annotations, virtual environments, and language specification maintained by the Python Software Foundation.',
    published_at: '2026-10-01T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'tech',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'Python Software Foundation',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.97,
    is_live: false,
    images: [],
    videos: []
  },
  {
    id: 6,
    url: 'https://www.tn.gov.in/scheme',
    domain: 'tn.gov.in',
    title: 'Tamil Nadu Government Welfare Schemes Portal',
    headings: [
      'Education Scholarships and Pudhumai Penn',
      'Naan Mudhalvan Skill Development',
      'Kalaignar Magalir Urimai Thittam and Civic Eligibility'
    ],
    snippet: 'Official directory of Tamil Nadu state government welfare schemes covering education scholarships, MSME subsidies, agriculture, healthcare, and civic services.',
    content_text: 'Government of Tamil Nadu official schemes portal listing eligibility criteria, application procedures, and department contacts for state welfare programs including Naan Mudhalvan, Kalaignar Magalir Urimai Thittam, and Pudhumai Penn.',
    published_at: '2026-09-25T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'government',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'Government of Tamil Nadu',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.98,
    is_live: true,
    images: [],
    videos: [],
    location: { country: 'India', region: 'Tamil Nadu', city: 'Chennai', lat: 13.0827, lon: 80.2707 }
  },
  {
    id: 7,
    url: 'https://arxiv.org/list/cs.AI/recent',
    domain: 'arxiv.org',
    title: 'arXiv Artificial Intelligence (cs.AI) — Recent Research Preprints',
    headings: [
      'Foundation Models and Reasoning Systems',
      'Hybrid Information Retrieval and Neural Reranking',
      'Multi-Agent Systems and Grounded Evaluation'
    ],
    snippet: 'Daily open-access research preprints in artificial intelligence, reasoning models, retrieval-augmented generation, and multi-agent systems.',
    content_text: 'arXiv cs.AI repository indexes latest peer-accessible AI research papers across foundation models, hybrid search ranking, neural retrieval, and automated verification.',
    published_at: '2026-11-11T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'academic',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'Cornell University arXiv',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.97,
    is_live: true,
    images: [],
    videos: []
  },
  {
    id: 8,
    url: 'https://www.postgresql.org/docs/current/tutorial-concepts.html',
    domain: 'postgresql.org',
    title: 'Database Concepts — Relational Models, SQL, ACID Transactions & Indexing',
    headings: [
      'Relational Database Management Systems (RDBMS)',
      'SQL, Normalization, and Query Optimization',
      'NoSQL, Distributed Storage, and ACID Guarantees'
    ],
    snippet: 'A database organizes structured data in tables, documents, or key-value stores managed by a database management system (DBMS) supporting SQL querying, B-tree indexes, and ACID transactions.',
    content_text: 'A database organizes structured or semi-structured data in tables, documents, graphs, or key-value stores managed by a database management system (DBMS). Relational databases like PostgreSQL use SQL, schemas, B-tree indexes, and ACID transactions (atomicity, consistency, isolation, durability), while distributed storage systems scale horizontally.',
    published_at: '2024-06-12T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'tech',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'PostgreSQL Global Development Group',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.97,
    is_live: false,
    images: [],
    videos: []
  },
  {
    id: 9,
    url: 'https://www.computerhistory.org/timeline/computers/',
    domain: 'computerhistory.org',
    title: 'Computer History Museum — Evolution of Computing Hardware & Computers',
    headings: [
      'Early Mechanical Calculators and Babbage Analytical Engine',
      'Vacuum Tubes, ENIAC, and Stored-Program Computers',
      'Transistors, Integrated Circuits, and Microprocessors'
    ],
    snippet: 'Curated historical timeline of computing hardware spanning Charles Babbage Analytical Engine, Ada Lovelace, ENIAC, transistors, integrated circuits, and modern microprocessors.',
    content_text: 'The history of computing hardware traces the evolution from mechanical calculators and Charles Babbage Analytical Engine, Alan Turing universal computation model, vacuum tube computers such as Colossus and ENIAC, Bell Labs transistors, integrated circuits, and personal microprocessors.',
    published_at: '2022-03-18T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'academic',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'Computer History Museum',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.95,
    is_live: false,
    images: [],
    videos: []
  },
  {
    id: 10,
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    domain: 'developer.mozilla.org',
    title: 'JavaScript (JS) — MDN Web Docs Reference & Guide',
    headings: [
      'ECMAScript Language Specification and Closures',
      'Asynchronous JavaScript, Promises and Fetch API',
      'DOM Manipulation and Browser Runtime'
    ],
    snippet: 'MDN Web Docs JavaScript guide and API reference covering ECMAScript syntax, promises, async/await, prototypes, modules, and web platform APIs.',
    content_text: 'JavaScript is a lightweight, interpreted or just-in-time compiled programming language with first-class functions powering interactive web applications, Node.js servers, async/await concurrency, and ECMAScript modules.',
    published_at: '2026-08-10T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'tech',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'Mozilla MDN',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.97,
    is_live: false,
    images: [],
    videos: []
  },
  {
    id: 11,
    url: 'https://scholarships.gov.in/',
    domain: 'scholarships.gov.in',
    title: 'National Scholarship Portal (NSP) — Indian Government Education Scholarships',
    headings: [
      'Central Sector Scheme & Post-Matric Scholarships',
      'AICTE Pragati, Saksham & State Education Grants',
      'Student Application Verification and Eligibility'
    ],
    snippet: 'Official National Scholarship Portal by the Government of India providing centralized application, eligibility rules, and disbursement for central and state education scholarships.',
    content_text: 'National Scholarship Portal (NSP) is the official Indian government digital platform for Ministry of Education, AICTE, UGC, and state government education scholarships, fellowships, and merit-cum-means student financial aid.',
    published_at: '2026-10-05T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'government',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'Government of India',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.98,
    is_live: true,
    images: [],
    videos: [],
    location: { country: 'India' }
  },
  {
    id: 12,
    url: 'https://www.nirfindia.org/',
    domain: 'nirfindia.org',
    title: 'NIRF India Rankings — Top Engineering Colleges & Universities in India and Tamil Nadu',
    headings: [
      'National Institutional Ranking Framework (Engineering)',
      'IIT Madras, NIT Tiruchirappalli, Anna University & State Institutions',
      'Teaching, Research and Graduation Outcomes Parameters'
    ],
    snippet: 'Official Ministry of Education National Institutional Ranking Framework (NIRF) evaluating top engineering colleges and universities across India including Tamil Nadu institutions.',
    content_text: 'NIRF (National Institutional Ranking Framework), published by the Ministry of Education, Government of India, ranks engineering colleges and universities nationwide including IIT Madras, Anna University, NIT Tiruchirappalli, PSG College of Technology, SSN, and VIT across teaching, research, and placement outcomes.',
    published_at: '2026-09-01T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'academic',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'Ministry of Education NIRF',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.97,
    is_live: true,
    images: [],
    videos: [],
    location: { country: 'India', region: 'Tamil Nadu' }
  },
  {
    id: 13,
    url: 'https://developer.nvidia.com/rtx',
    domain: 'developer.nvidia.com',
    title: 'NVIDIA RTX Architecture — Ray Tracing, Tensor Cores & Blackwell / Ada Lovelace',
    headings: [
      'RT Cores and Hardware-Accelerated Ray Tracing',
      'Tensor Cores, AI Neural Rendering and DLSS',
      'CUDA Compute and Shader Execution Reordering'
    ],
    snippet: 'Official NVIDIA developer overview of RTX GPU architecture combining RT Cores, Tensor Cores, CUDA streaming multiprocessors, and AI-accelerated graphics rendering.',
    content_text: 'NVIDIA RTX architecture integrates dedicated RT Cores for bounding volume hierarchy ray-triangle intersection, Tensor Cores for FP8/FP16 matrix math and DLSS neural frame generation, and high-bandwidth GDDR7/GDDR6X memory subsystems.',
    published_at: '2026-09-20T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'tech',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'NVIDIA Developer',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.97,
    is_live: true,
    images: [],
    videos: []
  },
  {
    id: 14,
    url: 'https://ai.stanford.edu/research/',
    domain: 'ai.stanford.edu',
    title: 'Stanford AI Lab (SAIL) — Artificial Intelligence Research & Foundation Models',
    headings: [
      'Machine Learning, Robotics and Natural Language Processing',
      'Foundation Models and Multimodal Reasoning',
      'Artificial Intelligence Systems and Safety'
    ],
    snippet: 'Research programs at Stanford Artificial Intelligence Laboratory spanning machine learning, autonomous agents, natural language understanding, and AI safety.',
    content_text: 'Artificial intelligence research at SAIL encompasses deep learning, reinforcement learning, computer vision, foundation models, retrieval-augmented generation, and trustworthy human-centered AI systems.',
    published_at: '2026-10-12T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'academic',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'Stanford AI Lab',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.96,
    is_live: false,
    images: [],
    videos: []
  },
  {
    id: 15,
    url: 'https://hs-ai-studio-4i7i.vercel.app/',
    domain: 'hs-ai-studio-4i7i.vercel.app',
    title: 'HS AI Solutions — Building AI That Does More · Harshan Seliyan B S',
    headings: [
      'HS AI Solutions Official Website & Product Studio',
      'July LLM, Gravity LLM, Pendulum, DOMCode LLM & Galaxy Vision',
      'Harshan Seliyan B S — Founder & AI Architect'
    ],
    snippet: 'Official website of HS AI Solutions (HS AI Studio), founded by Harshan Seliyan B S — building July LLM, Gravity LLM, Pendulum, DOMCode LLM, Galaxy Vision, Electron AI, Lumina, HSBot, Ledger, and Phishing Defence.',
    content_text: 'HS AI Solutions (HS AI Studio), founded by Harshan Seliyan B S, builds private, fast, autonomous AI systems and developer tools including July LLM, Gravity LLM, Pendulum Automated Private Browser, DOMCode LLM, Galaxy Vision, Electron AI, Lumina, HSBot, Ledger, Phishing Defence, HS CODE, and Academia AI.',
    published_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-11-12T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'tech',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'HS AI Solutions',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.98,
    is_live: true,
    images: [],
    videos: []
  },
  {
    id: 16,
    url: 'https://hs-ai-studio-4i7i.vercel.app/products/gravity-llm',
    domain: 'hs-ai-studio-4i7i.vercel.app',
    title: 'Gravity LLM — Private. Blazing Fast. Fully Autonomous. — HS AI Solutions · Harshan Seliyan B S',
    headings: [
      'Gravity LLM Next-Generation Local Intelligence Engine',
      '44 Built-in Tools & Instant GPU Acceleration',
      'Zero Cloud Dependency'
    ],
    snippet: 'Gravity LLM by HS AI Solutions is a private, local autonomous intelligence engine featuring 44 built-in tools, GPU acceleration, and zero cloud dependency.',
    content_text: 'Gravity LLM is a next-generation local intelligence engine from HS AI Solutions and Harshan Seliyan B S, engineered with 44 built-in tools, instant GPU acceleration, deep research capabilities, and zero cloud dependency.',
    published_at: '2026-10-15T00:00:00.000Z',
    updated_at: '2026-11-12T00:00:00.000Z',
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: 'tech',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Proprietary Index',
    source_category: 'hs_indexed',
    original_publisher: 'HS AI Solutions',
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.96,
    is_live: true,
    images: [],
    videos: []
  }
];

for (const entity of LOCAL_ENTITIES) {
  pendulumDocs.push({
    id: entity.id,
    url: entity.website,
    domain: (() => {
      try {
        return new URL(entity.website).hostname.replace(/^www\./, '');
      } catch {
        return 'local.hs';
      }
    })(),
    title: entity.name,
    headings: [entity.category.replace(/_/g, ' '), `${entity.city}, ${entity.state}`],
    snippet: `${entity.category.toUpperCase()} in ${entity.city}, ${entity.state}, ${entity.country}. ${entity.address}. Hours: ${entity.opening_hours}. Rating: ${entity.rating}/5 (${entity.review_count} reviews).`,
    content_text: `${entity.name} ${entity.category} ${entity.subcategory} ${entity.address} ${entity.city} ${entity.state} ${entity.country} ${entity.opening_hours}`,
    published_at: null,
    indexed_at: nowIso(),
    crawled_at: nowIso(),
    category: entity.category,
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum GeoIndex',
    source_category: 'hs_indexed',
    original_publisher: entity.name,
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.94,
    is_live: true,
    images: [],
    videos: [],
    location: {
      lat: entity.lat,
      lon: entity.lon,
      address: entity.address,
      city: entity.city,
      state: entity.state,
      region: entity.state,
      country: entity.country,
      verified_status: entity.verified_status,
      rating: entity.rating,
      review_count: entity.review_count,
      operating_hours: entity.opening_hours
    }
  });
}

// Register corpus vocabulary into spell corrector
registerCorpusVocabulary(pendulumDocs.map((d) => `${d.title} ${d.snippet} ${(d.headings || []).join(' ')}`));

export function tokenizeQuery(query: string): string[] {
  return tokenizeBoundary(query, false);
}

// ---------------------------------------------------------------------------
// BM25 + Sparse TF-IDF Cosine Vector Index over Pendulum Documents
// ---------------------------------------------------------------------------

interface IndexedDocTerms {
  doc: NativeIndexedDoc;
  titleTF: Map<string, number>;
  headingTF: Map<string, number>;
  snippetTF: Map<string, number>;
  bodyTF: Map<string, number>;
  domainTF: Map<string, number>;
  docLen: number;
  tfidfVec: Map<string, number>;
  tfidfNorm: number;
}

function buildTF(text: string): { map: Map<string, number>; len: number } {
  const toks = tokenizeBoundary(text, false);
  const map = new Map<string, number>();
  for (const t of toks) {
    map.set(t, (map.get(t) || 0) + 1);
  }
  return { map, len: toks.length };
}

class PendulumBm25VectorEngine {
  private lastDocSignature = '';
  private entries: IndexedDocTerms[] = [];
  private df = new Map<string, number>();
  private avgDocLen = 40;
  private N = 0;

  private ensureBuilt(docs: NativeIndexedDoc[]) {
    const sig = `${docs.length}:${docs[0]?.id || 0}:${docs[docs.length - 1]?.id || 0}:${docs[0]?.indexed_at || ''}`;
    if (sig === this.lastDocSignature && this.entries.length === docs.length) {
      return;
    }

    this.df.clear();
    this.entries = [];
    let totalLen = 0;

    const rawEntries = docs.map((doc) => {
      const title = buildTF(doc.title || '');
      const heading = buildTF((doc.headings || []).join(' '));
      const snippet = buildTF(doc.snippet || '');
      const body = buildTF(doc.content_text || '');
      const locText = doc.location
        ? `${doc.location.city || ''} ${doc.location.state || ''} ${doc.location.region || ''} ${doc.location.country || ''}`
        : '';
      const domain = buildTF(`${doc.domain} ${doc.category} ${locText}`);

      const combinedTerms = new Set<string>([
        ...title.map.keys(),
        ...heading.map.keys(),
        ...snippet.map.keys(),
        ...body.map.keys(),
        ...domain.map.keys()
      ]);
      for (const term of combinedTerms) {
        this.df.set(term, (this.df.get(term) || 0) + 1);
      }

      // Weighted virtual document length
      const docLen = Math.max(
        1,
        title.len * 3 + heading.len * 2 + snippet.len * 1.5 + body.len + domain.len
      );
      totalLen += docLen;

      return { doc, title, heading, snippet, body, domain, docLen };
    });

    this.N = Math.max(1, docs.length);
    this.avgDocLen = Math.max(10, totalLen / this.N);

    for (const r of rawEntries) {
      const tfidfVec = new Map<string, number>();
      let normSq = 0;
      const allTerms = new Set<string>([
        ...r.title.map.keys(),
        ...r.heading.map.keys(),
        ...r.snippet.map.keys(),
        ...r.body.map.keys(),
        ...r.domain.map.keys()
      ]);

      for (const t of allTerms) {
        const weightedTf =
          (r.title.map.get(t) || 0) * 3.0 +
          (r.heading.map.get(t) || 0) * 2.2 +
          (r.snippet.map.get(t) || 0) * 1.6 +
          (r.body.map.get(t) || 0) * 1.0 +
          (r.domain.map.get(t) || 0) * 1.2;
        if (weightedTf <= 0) continue;
        const idf = Math.log(1 + (this.N - (this.df.get(t) || 0) + 0.5) / ((this.df.get(t) || 0) + 0.5));
        const w = (1 + Math.log(weightedTf)) * Math.max(0.2, idf);
        tfidfVec.set(t, w);
        normSq += w * w;
      }

      this.entries.push({
        doc: r.doc,
        titleTF: r.title.map,
        headingTF: r.heading.map,
        snippetTF: r.snippet.map,
        bodyTF: r.body.map,
        domainTF: r.domain.map,
        docLen: r.docLen,
        tfidfVec,
        tfidfNorm: Math.sqrt(normSq) || 1
      });
    }

    this.lastDocSignature = sig;
  }

  scoreCorpus(
    docs: NativeIndexedDoc[],
    intel: QueryIntelligence,
    location?: GeoLocationContext
  ): Array<{ doc: NativeIndexedDoc; bm25Score: number; vectorScore: number; combinedScore: number }> {
    this.ensureBuilt(docs);

    const k1 = 1.5;
    const b = 0.75;
    const queryTerms = intel.tokens.length > 0 ? intel.tokens : tokenizeBoundary(intel.correctedQuery, true);
    const expandedExtra = intel.expandedTokens.filter((t) => !queryTerms.includes(t));

    // Build query TF-IDF vector
    const qVec = new Map<string, number>();
    let qNormSq = 0;
    for (const t of queryTerms) {
      const idf = Math.log(1 + (this.N - (this.df.get(t) || 0) + 0.5) / ((this.df.get(t) || 0) + 0.5));
      const w = Math.max(0.35, idf);
      qVec.set(t, (qVec.get(t) || 0) + w);
    }
    for (const t of expandedExtra) {
      const idf = Math.log(1 + (this.N - (this.df.get(t) || 0) + 0.5) / ((this.df.get(t) || 0) + 0.5));
      const w = Math.max(0.2, idf) * 0.45;
      qVec.set(t, (qVec.get(t) || 0) + w);
    }
    for (const w of qVec.values()) qNormSq += w * w;
    const qNorm = Math.sqrt(qNormSq) || 1;

    const cleanLower = intel.cleanQuery.toLowerCase();
    const out: Array<{ doc: NativeIndexedDoc; bm25Score: number; vectorScore: number; combinedScore: number }> = [];

    for (const entry of this.entries) {
      const { doc } = entry;

      // Exact phrase / site operator filtering if requested
      if (intel.operators.site && !doc.domain.toLowerCase().includes(intel.operators.site)) {
        continue;
      }

      let rawBm25 = 0;
      let matchedCoreTerms = 0;

      for (const term of queryTerms) {
        const tfWeighted =
          (entry.titleTF.get(term) || 0) * 3.5 +
          (entry.headingTF.get(term) || 0) * 2.5 +
          (entry.snippetTF.get(term) || 0) * 1.8 +
          (entry.bodyTF.get(term) || 0) * 1.0 +
          (entry.domainTF.get(term) || 0) * 1.5;

        if (tfWeighted > 0) {
          matchedCoreTerms++;
          const dfTerm = this.df.get(term) || 0;
          const idf = Math.max(0.25, Math.log((this.N - dfTerm + 0.5) / (dfTerm + 0.5) + 1));
          const tfNorm = (tfWeighted * (k1 + 1)) / (tfWeighted + k1 * (1 - b + b * (entry.docLen / this.avgDocLen)));
          rawBm25 += idf * tfNorm;
        }
      }

      // Secondary partial BM25 from synonym / cross-lingual expansion terms (never overwhelms core matches)
      for (const term of expandedExtra) {
        const tfWeighted =
          (entry.titleTF.get(term) || 0) * 2.0 +
          (entry.headingTF.get(term) || 0) * 1.5 +
          (entry.snippetTF.get(term) || 0) * 1.0 +
          (entry.bodyTF.get(term) || 0) * 0.7;
        if (tfWeighted > 0) {
          const dfTerm = this.df.get(term) || 0;
          const idf = Math.max(0.15, Math.log((this.N - dfTerm + 0.5) / (dfTerm + 0.5) + 1));
          const tfNorm = (tfWeighted * (k1 + 1)) / (tfWeighted + k1 * (1 - b + b * (entry.docLen / this.avgDocLen)));
          rawBm25 += 0.35 * idf * tfNorm;
        }
      }

      // Exact phrase match bonus (title / headings / body)
      let phraseBonus = 0;
      const phrasesToCheck = intel.exactPhrases.length > 0 ? intel.exactPhrases : cleanLower.length > 3 ? [cleanLower] : [];
      for (const phrase of phrasesToCheck) {
        const pLower = phrase.toLowerCase();
        if (doc.title.toLowerCase().includes(pLower)) phraseBonus += 1.4;
        else if ((doc.headings || []).some((h) => h.toLowerCase().includes(pLower))) phraseBonus += 0.9;
        else if (`${doc.snippet} ${doc.content_text}`.toLowerCase().includes(pLower)) phraseBonus += 0.5;
      }

      // Vector cosine similarity
      let dot = 0;
      for (const [term, qWeight] of qVec.entries()) {
        const dWeight = entry.tfidfVec.get(term);
        if (dWeight) dot += qWeight * dWeight;
      }
      const vectorScore = Math.max(0, Math.min(1, dot / (entry.tfidfNorm * qNorm)));

      // Normalize BM25 monotonically onto (0, 1) using saturation
      const bm25RawTotal = rawBm25 + phraseBonus;
      const bm25Norm = bm25RawTotal > 0 ? bm25RawTotal / (bm25RawTotal + 3.2) : 0;

      // Require genuine core or vector match (prevent spurious single-synonym leaks)
      if (matchedCoreTerms === 0 && phraseBonus === 0 && vectorScore < 0.14) {
        continue;
      }

      // Intent-gated geographic proximity bonus inside Pendulum index
      let geoBoost = 0;
      if (
        intel.hasLocalIntent &&
        location?.enabled !== false &&
        doc.location?.lat !== undefined &&
        doc.location?.lon !== undefined
      ) {
        const refLat = intel.explicitPlace?.lat ?? location?.lat;
        const refLon = intel.explicitPlace?.lon ?? location?.lon;
        if (refLat !== undefined && refLon !== undefined) {
          const dist = haversineKm(refLat, refLon, Number(doc.location.lat), Number(doc.location.lon));
          if (dist <= 35) geoBoost = 0.08;
        }
      }

      const combinedScore = Math.min(0.99, bm25Norm * 0.68 + vectorScore * 0.28 + geoBoost);
      if (combinedScore > 0.06) {
        out.push({ doc, bm25Score: bm25Norm, vectorScore, combinedScore });
      }
    }

    out.sort((a, bScore) => bScore.combinedScore - a.combinedScore);
    return out;
  }
}

const bm25VectorEngine = new PendulumBm25VectorEngine();

export async function searchPendulumIndex(
  query: string,
  options: {
    limit?: number;
    location?: GeoLocationContext;
    category?: string;
    crawledPages?: NativeIndexedDoc[];
    intelligence?: QueryIntelligence;
  } = {}
): Promise<ProviderRawResult[]> {
  const limit = Math.min(options.limit || 20, 40);
  const intel = options.intelligence || analyzeQueryIntelligence(query, options.location);
  const docsAll = options.crawledPages ? [...options.crawledPages, ...pendulumDocs] : pendulumDocs;
  const docs =
    options.category && options.category !== 'all'
      ? docsAll.filter((d) => d.category.toLowerCase() === options.category!.toLowerCase())
      : docsAll;

  const scored = bm25VectorEngine.scoreCorpus(docs, intel, options.location);

  return scored.slice(0, limit).map(({ doc, combinedScore }, idx) => ({
    id: `pendulum-${doc.id}`,
    title: doc.title,
    url: doc.url,
    canonicalUrl: doc.url,
    snippet: doc.snippet,
    domain: doc.domain,
    content: doc.content_text,
    headings: doc.headings,
    publishedAt: doc.published_at || null,
    updatedAt: doc.updated_at || null,
    indexedAt: doc.indexed_at,
    crawledAt: doc.crawled_at,
    source: 'pendulum',
    subProvider: doc.source_provider === 'Pendulum GeoIndex' ? 'pendulum_geo' : 'pendulum_bm25',
    providerDetail: doc.source_provider,
    rank: idx + 1,
    rawScore: Math.round(combinedScore * 1000) / 1000,
    resultType:
      doc.category === 'news'
        ? 'news'
        : doc.category === 'academic'
        ? 'research'
        : doc.location?.verified_status
        ? 'map'
        : 'web',
    category: doc.category,
    language: doc.language,
    favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(doc.domain)}&sz=64`,
    isLive: doc.is_live,
    location: doc.location,
    media: {
      images: doc.images,
      videos: doc.videos
    }
  }));
}
