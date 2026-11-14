import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { GLOBAL_PLACES } from '../geoData';
import { recognizeQueryEntity } from '../entity/entityRecognizer';
import { TtlCache } from '../metrics';
import {
  CredibilityProfile,
  FreshnessNeed,
  GeoLocationContext,
  LocationNeed,
  QueryIntelligence,
  QueryIntentType
} from '../types';

export const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'of', 'for', 'to', 'and', 'or', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'with', 'by', 'from', 'as', 'into', 'about',
  'do', 'does', 'did', 'can', 'could', 'would', 'should', 'will', 'how', 'what',
  'why', 'when', 'where', 'who', 'which', 'whom', 'whose', 'me', 'my', 'your',
  'their', 'this', 'that', 'these', 'those', 'it', 'its'
]);

// High-precision domain dictionary used for spell correction (no over-aggressive edits)
const SPELLING_LEXICON: string[] = [
  'artificial', 'intelligence', 'machine', 'learning', 'deep', 'neural', 'network', 'networks',
  'quantum', 'computing', 'computer', 'computers', 'history', 'algorithm', 'algorithms',
  'database', 'databases', 'relational', 'distributed', 'transformer', 'attention',
  'retrieval', 'augmented', 'generation', 'search', 'engine', 'pendulum', 'crawler',
  'python', 'javascript', 'typescript', 'react', 'nodejs', 'docker', 'kubernetes',
  'programming', 'software', 'architecture', 'documentation', 'tutorial', 'reference',
  'research', 'science', 'scientific', 'physics', 'biology', 'chemistry', 'mathematics',
  'climate', 'energy', 'renewable', 'solar', 'medical', 'health', 'hospital', 'hospitals',
  'university', 'universities', 'college', 'colleges', 'restaurant', 'restaurants',
  'government', 'scheme', 'schemes', 'scholarship', 'india', 'chennai', 'bengaluru',
  'bangalore', 'mumbai', 'delhi', 'london', 'tokyo', 'paris', 'singapore', 'latest',
  'developments', 'technology', 'news', 'compare', 'comparison', 'difference', 'between',
  'wikipedia', 'britannica', 'opensource', 'security', 'encryption', 'cryptography',
  'blockchain', 'robotics', 'autonomous', 'satellite', 'astronomy', 'nebula', 'hubble',
  'weather', 'forecast', 'directions', 'economics', 'finance', 'inflation', 'python3',
  'async', 'asyncio', 'postgres', 'postgresql', 'sqlite', 'opensearch', 'vector',
  'semantic', 'ranking', 'relevance', 'fusion', 'evaluation', 'benchmark'
];

const DIRECT_TYPO_MAP: Record<string, string> = {
  artifical: 'artificial',
  artficial: 'artificial',
  inteligence: 'intelligence',
  intelligance: 'intelligence',
  qantum: 'quantum',
  quantm: 'quantum',
  computng: 'computing',
  compuer: 'computer',
  algoritm: 'algorithm',
  algoritms: 'algorithms',
  algorythm: 'algorithm',
  databse: 'database',
  datbase: 'database',
  javascrpt: 'javascript',
  javscript: 'javascript',
  typescrpt: 'typescript',
  pythn: 'python',
  pyhton: 'python',
  kubernets: 'kubernetes',
  machin: 'machine',
  learing: 'learning',
  lerning: 'learning',
  resturant: 'restaurant',
  restarant: 'restaurant',
  universty: 'university',
  univeristy: 'university',
  goverment: 'government',
  governmnt: 'government',
  tecnology: 'technology',
  technolgy: 'technology',
  scince: 'science',
  reseach: 'research',
  reserch: 'research',
  developmnt: 'development',
  documntation: 'documentation',
  chenai: 'chennai',
  tamli: 'tamil',
  banglore: 'bangalore',
  mumbay: 'mumbai',
  histroy: 'history',
  hsitory: 'history',
  climte: 'climate',
  secrity: 'security'
};

const SYNONYMS_AND_CROSS_LINGUAL: Record<string, string[]> = {
  ai: ['artificial', 'intelligence', 'machine', 'learning', 'llm', 'neural'],
  artificial: ['ai', 'machine', 'intelligence'],
  ml: ['machine', 'learning', 'neural', 'model'],
  llm: ['large', 'language', 'model', 'transformer', 'generative'],
  rag: ['retrieval', 'augmented', 'generation'],
  db: ['database', 'sql', 'storage', 'schema'],
  database: ['db', 'sql', 'rdbms', 'nosql', 'storage', 'query'],
  quantum: ['qubit', 'superposition', 'entanglement', 'interference'],
  js: ['javascript', 'ecmascript', 'node'],
  ts: ['typescript', 'javascript'],
  py: ['python'],
  docs: ['documentation', 'reference', 'manual', 'guide'],
  tutorial: ['guide', 'howto', 'walkthrough', 'example'],
  news: ['latest', 'breaking', 'update', 'report', 'announcement'],
  research: ['paper', 'study', 'journal', 'preprint', 'arxiv', 'peer'],
  history: ['origin', 'timeline', 'evolution', 'historical', 'past'],
  hospital: ['medical', 'clinic', 'emergency', 'healthcare'],
  restaurant: ['food', 'dining', 'cafe', 'eatery', 'cuisine'],
  college: ['university', 'institute', 'campus', 'academic'],
  scheme: ['welfare', 'subsidy', 'scholarship', 'government', 'program'],
  // Cross-lingual bridges (Tamil / Hindi / French / German / Spanish -> English core)
  'செயற்கை': ['artificial', 'intelligence', 'ai'],
  'அறிவியல்': ['science', 'research'],
  'மருத்துவமனை': ['hospital', 'medical'],
  'பல்கலைக்கழகம்': ['university', 'college'],
  'विज्ञान': ['science', 'research'],
  'अस्पताल': ['hospital', 'medical'],
  'सरकार': ['government', 'scheme'],
  'कृत्रिम': ['artificial', 'intelligence'],
  'histoire': ['history'],
  'wissenschaft': ['science'],
  'datenbank': ['database'],
  'inteligencia': ['intelligence']
};

const TECHNICAL_ENTITIES = new Set([
  'python', 'javascript', 'typescript', 'react', 'node', 'nodejs', 'docker', 'kubernetes',
  'postgresql', 'sqlite', 'opensearch', 'qdrant', 'pendulum', 'july', 'gravity', 'arxiv',
  'wikipedia', 'github', 'mozilla', 'mdn', 'w3c', 'ietf', 'ieee', 'acm', 'rust', 'go',
  'linux', 'http', 'https', 'oauth', 'graphql', 'rest', 'pytorch', 'tensorflow', 'llm'
]);

const extraLexicon = new Set<string>(SPELLING_LEXICON);

export function registerCorpusVocabulary(texts: string[]) {
  for (const text of texts) {
    const words = text.toLowerCase().match(/[a-z][a-z0-9]{3,24}/g);
    if (!words) continue;
    for (const w of words) {
      if (extraLexicon.size < 4000) extraLexicon.add(w);
    }
  }
}

export function normalizeUnicodeQuery(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeBoundary(text: string, keepStopWords = false): string[] {
  const tokens = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s+#.-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((t) => t.length >= 2 || t === 'c' || t === 'r');

  if (keepStopWords) return tokens;
  return tokens.filter((t) => !STOP_WORDS.has(t));
}

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }
  return dp[m][n];
}

export function correctSpelling(cleanText: string): {
  corrected: string;
  applied: boolean;
} {
  const parts = cleanText.split(/\s+/).filter(Boolean);
  let applied = false;

  const fixed = parts.map((rawWord) => {
    // Never touch operators, URLs, quoted strings, digits, short words, or non-ASCII scripts
    if (
      rawWord.includes(':') ||
      rawWord.includes('/') ||
      rawWord.includes('"') ||
      /\d/.test(rawWord) ||
      rawWord.length < 4 ||
      !/^[a-zA-Z]+$/.test(rawWord)
    ) {
      return rawWord;
    }

    const lower = rawWord.toLowerCase();
    if (DIRECT_TYPO_MAP[lower]) {
      applied = true;
      return DIRECT_TYPO_MAP[lower];
    }
    if (extraLexicon.has(lower) || STOP_WORDS.has(lower)) {
      return rawWord;
    }

    // Only attempt edit-distance lookup against core SPELLING_LEXICON so random strings don't get corrupted
    const maxDist = lower.length >= 7 ? 2 : 1;
    let bestWord = rawWord;
    let bestDist = maxDist + 1;

    for (const candidate of SPELLING_LEXICON) {
      if (candidate[0] !== lower[0] && Math.abs(candidate.length - lower.length) > 1) continue;
      const dist = damerauLevenshtein(lower, candidate);
      if (dist < bestDist) {
        bestDist = dist;
        bestWord = candidate;
      }
      if (dist === 1) break;
    }

    if (bestDist <= maxDist && bestWord !== lower) {
      applied = true;
      return bestWord;
    }
    return rawWord;
  });

  return {
    corrected: fixed.join(' '),
    applied
  };
}

function parseOperators(normalized: string): {
  cleanText: string;
  exactPhrases: string[];
  operators: QueryIntelligence['operators'];
} {
  let cleanText = normalized;
  const exactPhrases: string[] = [];
  for (const m of normalized.matchAll(/"([^"]+)"/g)) {
    if (m[1].trim()) exactPhrases.push(m[1].trim());
  }

  const operators: QueryIntelligence['operators'] = {};
  const extractOp = (regex: RegExp, key: keyof QueryIntelligence['operators']) => {
    const m = cleanText.match(regex);
    if (m && m[1]) {
      operators[key] = m[1].toLowerCase().trim();
      cleanText = cleanText.replace(m[0], ' ');
    }
  };

  extractOp(/\bsite:([^\s]+)/i, 'site');
  extractOp(/\b(?:type|filetype):([^\s]+)/i, 'contentType');
  extractOp(/\blang:([^\s]+)/i, 'language');
  extractOp(/\bfreshness:([^\s]+)/i, 'freshness');

  cleanText = cleanText.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
  return { cleanText, exactPhrases, operators };
}

export function analyzeQueryIntelligence(
  rawQuery: string,
  location?: GeoLocationContext,
  options?: { type?: string; mode?: string }
): QueryIntelligence {
  const originalQuery = rawQuery;
  const normalizedQuery = normalizeUnicodeQuery(rawQuery);
  const { cleanText, exactPhrases, operators } = parseOperators(normalizedQuery);
  const { corrected, applied: correctionApplied } = correctSpelling(cleanText || normalizedQuery);

  const effectiveClean = corrected || cleanText || normalizedQuery;
  const lower = effectiveClean.toLowerCase();
  const tokens = tokenizeBoundary(effectiveClean, false);
  const rawTokensAll = tokenizeBoundary(effectiveClean, true);

  // Synonym & cross-lingual expansion
  const expandedSet = new Set<string>(tokens);
  for (const tok of rawTokensAll) {
    const syns = SYNONYMS_AND_CROSS_LINGUAL[tok];
    if (syns) {
      for (const s of syns) expandedSet.add(s);
    }
    // Clean plural/singular inflection preservation without destructive stemming
    if (tok.length > 5 && tok.endsWith('ies')) {
      expandedSet.add(`${tok.slice(0, -3)}y`);
    } else if (tok.length > 4 && tok.endsWith('s') && !tok.endsWith('ss')) {
      expandedSet.add(tok.slice(0, -1));
    }
  }

  // Entity extraction: places, technical nouns, capitalized multi-word phrases
  const entities: string[] = [];
  for (const m of cleanText.matchAll(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,2})\b/g)) {
    const candidate = m[1].trim();
    if (!STOP_WORDS.has(candidate.toLowerCase()) && !entities.includes(candidate)) {
      entities.push(candidate);
    }
  }
  for (const tok of tokens) {
    if (TECHNICAL_ENTITIES.has(tok) && !entities.some((e) => e.toLowerCase() === tok)) {
      entities.push(tok);
    }
  }

  // Place & location intent detection (never force local bias for global queries)
  let explicitPlace: QueryIntelligence['explicitPlace'];
  for (const place of GLOBAL_PLACES) {
    const nameRegex = new RegExp(`\\b${place.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (
      nameRegex.test(effectiveClean) ||
      place.alternate_names.some((a) => a.length > 2 && new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(effectiveClean))
    ) {
      explicitPlace = {
        name: place.name,
        region: place.state_province,
        country: place.country_name,
        lat: place.lat,
        lon: place.lon
      };
      if (!entities.includes(place.name)) entities.push(place.name);
      break;
    }
  }

  const recognizedEntity = recognizeQueryEntity(rawQuery, effectiveClean, location, options);

  const isNearMe = /\b(near me|nearby|around me|closest|nearest|open now|in my area)\b/i.test(lower);
  const isVenueQuery = /\b(restaurants?|hospitals?|clinics?|hotels?|cafes?|pharmacies?|airports?|metros?|stations?|banks?|parks?|museums?|schools?|colleges?|universities?)\b/i.test(lower);
  const isCivicRegional = /\b(schemes?|welfare|government portal|municipality|passport office|rto|ration|panchayat)\b/i.test(lower);
  const hasCurrencyRegional = /[₹]|inr|rupees|crore|lakh/i.test(normalizedQuery);

  let locationNeed: LocationNeed = 'none';
  if (explicitPlace) locationNeed = 'explicit_place';
  else if (isNearMe) locationNeed = 'near_me';
  else if (!recognizedEntity?.isSpecificEntityQuery && location?.enabled !== false && (isVenueQuery || isCivicRegional || hasCurrencyRegional)) {
    locationNeed = 'regional';
  }

  const hasLocalIntent = locationNeed !== 'none';
  const regionalHints: string[] = [];
  if (hasCurrencyRegional) regionalHints.push('india');
  if (explicitPlace) {
    regionalHints.push(explicitPlace.name.toLowerCase());
    if (explicitPlace.region) regionalHints.push(explicitPlace.region.toLowerCase());
    if (explicitPlace.country) regionalHints.push(explicitPlace.country.toLowerCase());
  } else if (hasLocalIntent && location?.enabled !== false) {
    if (location?.city) regionalHints.push(location.city.toLowerCase());
    if (location?.region) regionalHints.push(location.region.toLowerCase());
    if (location?.country) regionalHints.push(location.country.toLowerCase());
  }

  // Intent classification across all required categories
  const tabType = (options?.type || options?.mode || '').toLowerCase();
  let intent: QueryIntentType = 'informational';

  if (
    operators.site ||
    /\b(official site|official website|login|homepage|portal|docs\.|\.org|\.gov|\.edu|\.com)\b/i.test(lower) ||
    /^(wikipedia|github|arxiv|youtube|python docs|mdn|pendulum search)$/i.test(lower)
  ) {
    intent = 'navigational';
  } else if (/\b(vs|versus|compare|comparison|difference between|better than|pros and cons)\b/i.test(lower)) {
    intent = 'comparison';
  } else if (/\b(history of|origin of|evolution of|timeline of|ancient|century|founded in|historical)\b/i.test(lower)) {
    intent = 'historical';
  } else if (
    tabType === 'news' ||
    tabType === 'latest' ||
    tabType === 'realtime' ||
    /\b(latest|breaking|news|today|yesterday|this week|current|recent|2025|2026|update|updates|announced|release)\b/i.test(lower)
  ) {
    intent = 'news';
  } else if (
    tabType === 'research' ||
    tabType === 'academic' ||
    /\b(research|paper|papers|study|studies|arxiv|citation|peer reviewed|empirical|meta-analysis|theorem|experiment|doi)\b/i.test(lower)
  ) {
    intent = 'research';
  } else if (/\b(buy|price|cost|best .* under|cheap|discount|deal|order|subscription|pricing|review|reviews)\b/i.test(lower) || tabType === 'shopping') {
    intent = 'transactional';
  } else if (recognizedEntity?.isSpecificEntityQuery) {
    intent = 'navigational';
  } else if (locationNeed === 'explicit_place' || locationNeed === 'near_me' || tabType === 'maps') {
    intent = 'local';
  } else if (
    /\b(python|javascript|typescript|react|node|docker|kubernetes|api|sdk|code|regex|error|exception|stack|http|sql|postgres|algorithm|compiler|git|linux)\b/i.test(lower)
  ) {
    intent = 'technical';
  } else if (/\b(how to|step by step|tutorial|guide|learn|course|explain|explained|beginner|lesson)\b/i.test(lower)) {
    intent = 'educational';
  } else if (/^(what is|what are|who is|define|definition of|meaning of)\b/i.test(lower)) {
    intent = 'definition';
  } else if (isCivicRegional) {
    intent = 'local';
  }

  // Freshness need strictly governed by intent (Phase 7)
  let freshnessNeed: FreshnessNeed = 'medium';
  if (intent === 'news' || operators.freshness) {
    freshnessNeed = 'high';
  } else if (intent === 'historical') {
    freshnessNeed = 'historical';
  } else if (intent === 'definition' || intent === 'educational' || /\b(what is a|what is an|fundamentals of|basics of)\b/i.test(lower)) {
    freshnessNeed = 'low';
  } else if (intent === 'technical' || intent === 'research' || intent === 'comparison' || intent === 'transactional') {
    freshnessNeed = 'medium';
  }

  // Subject-specific credibility profile (Phase 6)
  let credibilityProfile: CredibilityProfile = 'general';
  if (
    intent === 'research' ||
    /\b(quantum|physics|biology|chemistry|medicine|medical|vaccine|clinical|genetics|climate|astronomy|neuroscience|theorem)\b/i.test(lower)
  ) {
    credibilityProfile = 'scientific';
  } else if (
    /\b(government|gov|law|tax|visa|passport|election|constitution|regulation|welfare|scheme|policy|ministry|federal)\b/i.test(lower)
  ) {
    credibilityProfile = 'government';
  } else if (intent === 'technical') {
    credibilityProfile = 'technical';
  } else if (intent === 'news') {
    credibilityProfile = 'news';
  } else if (intent === 'transactional') {
    credibilityProfile = 'commerce';
  }

  // Context-aware internal query reformulations (originalQuery stays untouched for display)
  const reformulatedSet = new Set<string>();
  reformulatedSet.add(effectiveClean);
  if (tokens.length >= 2) {
    reformulatedSet.add(tokens.join(' '));
  }
  if (entities.length >= 1 && tokens.length >= 2) {
    reformulatedSet.add(`${entities.slice(0, 3).join(' ')} ${tokens.slice(0, 4).join(' ')}`.trim());
  }

  // Map to legacy category label for metrics backward compatibility
  const intentCategory =
    intent === 'educational'
      ? 'tutorial'
      : intent === 'historical'
      ? 'definition'
      : intent === 'informational'
      ? 'general'
      : intent;

  return {
    originalQuery,
    normalizedQuery,
    correctedQuery: effectiveClean,
    correctionApplied,
    cleanQuery: effectiveClean,
    tokens,
    expandedTokens: Array.from(expandedSet),
    exactPhrases,
    entities,
    operators,
    intent,
    freshnessNeed,
    locationNeed,
    credibilityProfile,
    hasLocalIntent,
    isNearMe,
    explicitPlace,
    regionalHints,
    reformulatedQueries: Array.from(reformulatedSet).slice(0, 3),
    recognizedEntity,
    intentCategory
  };
}

const aiQueryExpansionCache = new TtlCache<{ expandedTerms: string[]; reformulations: string[] }>(15 * 60_000, 150);

/**
 * Optional July AI Query Expansion & Intent Disambiguation via Gemini when GEMINI_API_KEY is present.
 * Strictly bounded by a 1400ms timeout and TTL cache; falls back instantaneously to deterministic intelligence.
 */
export async function enhanceQueryWithJulyAI(intel: QueryIntelligence): Promise<QueryIntelligence> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || intel.tokens.length === 0) return intel;

  const cacheKey = intel.correctedQuery.toLowerCase();
  const cached = aiQueryExpansionCache.get(cacheKey);
  if (cached) {
    return {
      ...intel,
      expandedTokens: Array.from(new Set([...intel.expandedTokens, ...cached.expandedTerms])),
      reformulatedQueries: Array.from(new Set([...intel.reformulatedQueries, ...cached.reformulations])).slice(0, 4)
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const call = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Analyze this search query for retrieval expansion (do not invent URLs or answer the query).\nQuery: "${intel.correctedQuery}"\nDetected intent: ${intel.intent}\nReturn up to 4 concise domain synonyms/disambiguation terms and up to 2 cleaner search reformulations.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            expandedTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
            reformulations: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['expandedTerms', 'reformulations']
        }
      }
    });

    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1400));
    const res = await Promise.race([call, timeout]);
    if (!res) return intel;

    const parsed = JSON.parse((res.text ?? '{}').trim());
    const expandedTerms = Array.isArray(parsed.expandedTerms)
      ? parsed.expandedTerms
          .map((t: unknown) => String(t).toLowerCase().trim())
          .filter((t: string) => t.length >= 2 && t.length <= 24)
          .slice(0, 5)
      : [];
    const reformulations = Array.isArray(parsed.reformulations)
      ? parsed.reformulations
          .map((r: unknown) => String(r).trim())
          .filter((r: string) => r.length >= 3 && r.length <= 80)
          .slice(0, 2)
      : [];

    aiQueryExpansionCache.set(cacheKey, { expandedTerms, reformulations });
    return {
      ...intel,
      expandedTokens: Array.from(new Set([...intel.expandedTokens, ...expandedTerms])),
      reformulatedQueries: Array.from(new Set([...intel.reformulatedQueries, ...reformulations])).slice(0, 4)
    };
  } catch {
    return intel;
  }
}
