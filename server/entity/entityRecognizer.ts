import { GLOBAL_PLACES } from '../geoData';
import { EntityType, GeoLocationContext, RecognizedEntity } from '../types';

const SUBPAGE_INTENT_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: 'admissions', regex: /\b(admissions?|admit|apply|application|cutoff|counselling)\b/i },
  { type: 'placements', regex: /\b(placements?|recruiters?|career|careers|salary package|training and placement)\b/i },
  { type: 'departments', regex: /\b(departments?|cse|ece|eee|mech|it|academics|faculties)\b/i },
  { type: 'courses', regex: /\b(courses?|programs?|degrees?|b\.?e|b\.?tech|m\.?tech|mba|syllabus|curriculum)\b/i },
  { type: 'faculty', regex: /\b(faculty|professors?|staff|hod|principal|dean|directory)\b/i },
  { type: 'contact', regex: /\b(contact|address|phone|email|helpline|reach us|location)\b/i },
  { type: 'docs', regex: /\b(docs|documentation|api reference|developer|developers|sdk)\b/i },
  { type: 'news', regex: /\b(news|circular|announcements?|events?|notice|press)\b/i },
  { type: 'about', regex: /\b(about|overview|accreditation|naac|nba|nirf|ranking)\b/i }
];

const NAVIGATIONAL_SUFFIX_REGEX =
  /\b(official website|official site|official portal|website|homepage|home page|web portal|portal|login|sign in)\b/gi;

const SUBPAGE_STRIP_REGEX =
  /\b(admissions?|placements?|departments?|courses?|faculty|contact|fees|syllabus|results?|careers?|about|docs|documentation)\b/gi;

const QUESTION_OR_GENERIC_PREFIX =
  /^(what|who|why|when|where|which|how|define|definition|explain|compare|comparison|difference|history of|origin of|evolution of|timeline of|latest|breaking|news about|top \d+|best \d*)\b/i;

const PLURAL_GENERIC_NOUNS =
  /\b(colleges|universities|schools|hospitals|clinics|companies|governments|departments|schemes|scholarships|grants|fellowships|websites|organizations|brands|products|restaurants|hotels|airports|banks|papers|studies|tutorials|courses|databases|algorithms)\b/i;

const NON_ENTITY_SINGLE_WORDS = new Set([
  'python', 'javascript', 'typescript', 'java', 'rust', 'golang', 'sql', 'html', 'css',
  'quantum', 'computing', 'ai', 'ml', 'llm', 'rag', 'database', 'databases', 'weather',
  'forecast', 'climate', 'energy', 'history', 'science', 'physics', 'biology', 'chemistry',
  'math', 'restaurant', 'hospital', 'college', 'university', 'school', 'government',
  'company', 'news', 'research', 'music', 'video', 'images', 'maps', 'books', 'shopping',
  'search', 'tutorial', 'guide', 'algorithm', 'algorithms', 'encryption', 'blockchain',
  'photosynthesis', 'transformer', 'transformers', 'attention', 'docker', 'kubernetes',
  'postgresql', 'sqlite', 'asyncio'
]);

const NON_ENTITY_TOPIC_WORDS =
  /\b(weather|forecast|temperature|rainfall|vulnerability|advisories|advisory|cves?|scholarships?|grants?|fellowships?|discriminated|narrowing|explain\s+analyze|index\s+scan|abortcontroller|fetch\s+timeout|status\s+codes?|retry-after|photosynthesis|reciprocal\s+rank|combsum|embeddings?|bm25|mechanics|keyboard|under\s+\d+|hosting\s+pricing|tco|clean\s+code|developments?|recent|today|yesterday|2024|2025|2026|2027)\b/i;

const ENTITY_TYPE_RULES: Array<{ type: EntityType; regex: RegExp }> = [
  {
    type: 'educational_institution',
    regex: /\b(university|college|institute of technology|engineering college|medical college|polytechnic|iit|nit|iiit|bits|vit|srm|mit|stanford|harvard|oxford|cambridge|academy)\b/i
  },
  {
    type: 'school',
    regex: /\b(high school|public school|senior secondary|matriculation|kendriya vidyalaya|vidyalaya|elementary school|middle school|convent school|international school)\b/i
  },
  {
    type: 'hospital',
    regex: /\b(hospital|medical centre|medical center|clinic|aiims|infirmary|nursing home|healthcare|diagnostics)\b/i
  },
  {
    type: 'government_department',
    regex: /\b(government|ministry|department of|directorate|commission|municipality|municipal corporation|secretariat|collectorate|isro|drdo|nasa|nic\.in|\.gov)\b/i
  },
  {
    type: 'company',
    regex: /\b(inc|corp|corporation|ltd|llc|pvt|limited|technologies|systems|solutions|labs|motors|airlines|bank|group|google|microsoft|nvidia|openai|anthropic|apple|amazon|meta|tesla|infosys|tcs|wipro|zoho)\b/i
  },
  {
    type: 'brand',
    regex: /\b(nike|adidas|samsung|sony|toyota|honda|starbucks|coca-cola|pepsi|lego|ikea|puma|rolex|asus|lenovo|dell|hp)\b/i
  },
  {
    type: 'organization',
    regex: /\b(foundation|association|council|society|trust|federation|consortium|unesco|unicef|ieee|acm|w3c|ietf|linux foundation)\b/i
  },
  {
    type: 'website_service',
    regex: /\b(github|wikipedia|arxiv|stackoverflow|youtube|cloudflare|vercel|pendulum search|openstreetmap|hs ai studio)\b|\b[a-z0-9-]+\.(com|org|edu|gov|ac\.in|gov\.in|edu\.in|io|ai|dev|net|app)\b/i
  },
  {
    type: 'product',
    regex: /\b(chrome|windows|pytorch|tensorflow|postgres|postgresql|sqlite|iphone|android|july llm|gravity llm|domcode|galaxy vision|electron ai)\b/i
  },
  {
    type: 'person',
    regex: /\b(dr\.?|prof\.?|sir|ceo|founder|president|chancellor)\s+[A-Z][a-z]+|\bharshan\s+seliyan(?:\s+b\s*s)?\b/i
  }
];

const KNOWN_MULTI_LOCATIONS: Array<{ pattern: RegExp; country: string; region?: string; location?: string }> = [
  { pattern: /\btamil\s*nadu\b/i, country: 'India', region: 'Tamil Nadu' },
  { pattern: /\b(chennai|madras)\b/i, country: 'India', region: 'Tamil Nadu', location: 'Chennai' },
  { pattern: /\b(kavaraipettai|tiruvallur|gummidipoondi)\b/i, country: 'India', region: 'Tamil Nadu', location: 'Kavaraipettai' },
  { pattern: /\b(bengaluru|bangalore)\b/i, country: 'India', region: 'Karnataka', location: 'Bengaluru' },
  { pattern: /\b(mumbai|bombay)\b/i, country: 'India', region: 'Maharashtra', location: 'Mumbai' },
  { pattern: /\b(new delhi|delhi)\b/i, country: 'India', region: 'Delhi', location: 'Delhi' },
  { pattern: /\b(hyderabad)\b/i, country: 'India', region: 'Telangana', location: 'Hyderabad' },
  { pattern: /\bindia\b/i, country: 'India' }
];

function buildAbbreviations(name: string): string[] {
  const out = new Set<string>();
  const words = name
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    const initials = words
      .filter((w) => !/^(of|and|for|the|in|at)$/i.test(w))
      .map((w) => w[0].toUpperCase())
      .join('');
    if (initials.length >= 2 && initials.length <= 7) {
      out.add(initials);
    }
  }

  for (const w of words) {
    const nodot = w.replace(/\./g, '');
    if (/^[A-Z]{2,6}$/.test(nodot) || /^[A-Z]\.[A-Z]/.test(w)) {
      out.add(nodot.toUpperCase());
      out.add(nodot.toUpperCase().split('').join('.'));
      out.add(`${nodot.toUpperCase().split('').join('.')}.`);
    }
  }

  if (/\bindian institute of technology\b/i.test(name)) {
    out.add('IIT');
  } else if (/\biit\b/i.test(name)) {
    out.add('Indian Institute of Technology');
  }
  if (/\btn\b/i.test(name)) out.add('Tamil Nadu');
  if (/\btamil\s*nadu\b/i.test(name)) out.add('TN');

  return Array.from(out);
}

function inferEntityType(cleanName: string, rawQuery: string): EntityType | null {
  if (NON_ENTITY_TOPIC_WORDS.test(rawQuery) || NON_ENTITY_TOPIC_WORDS.test(cleanName)) {
    return null;
  }

  for (const rule of ENTITY_TYPE_RULES) {
    if (rule.regex.test(cleanName) || rule.regex.test(rawQuery)) {
      return rule.type;
    }
  }

  // Capitalized proper noun phrase (1-4 words) or explicit official-website request
  const words = cleanName.split(/\s+/).filter(Boolean);
  const lower = cleanName.toLowerCase();
  const hasExplicitOfficialCue = /\b(official|website|homepage|portal|contact|admissions?|placements?)\b/i.test(rawQuery);
  const connectors = new Set(['of', 'and', 'the', 'for', 'in', 'at', 'on', 'de', 'la']);
  const significantWords = words.filter((w) => !connectors.has(w.toLowerCase()));
  const capitalizedSignificant = significantWords.filter((w) => /^[A-Z][a-zA-Z0-9.-]*$/.test(w));

  if (hasExplicitOfficialCue && words.length >= 1 && words.length <= 6 && !NON_ENTITY_SINGLE_WORDS.has(lower)) {
    return words.length === 1 ? 'company' : 'organization';
  }

  // Single capitalized proper noun not in generic common words (e.g. "Google", "Microsoft", "NVIDIA", "OpenAI")
  if (words.length === 1 && !NON_ENTITY_SINGLE_WORDS.has(lower) && cleanName.length >= 3) {
    if (/^[A-Z][A-Za-z0-9]{2,}$/.test(cleanName) || /^[A-Z]{2,8}$/.test(cleanName)) {
      return 'company';
    }
  }

  // Multi-word capitalized proper noun where ALL/MOST significant words are capitalized (e.g. "Apollo Specialty Care", "Zoho Labs")
  if (
    significantWords.length >= 2 &&
    significantWords.length <= 4 &&
    capitalizedSignificant.length === significantWords.length &&
    !QUESTION_OR_GENERIC_PREFIX.test(lower) &&
    !significantWords.every((w) => NON_ENTITY_SINGLE_WORDS.has(w.toLowerCase()))
  ) {
    return 'organization';
  }

  return null;
}

export function recognizeQueryEntity(
  rawQuery: string,
  cleanQuery: string,
  location?: GeoLocationContext,
  options?: { type?: string; mode?: string }
): RecognizedEntity | undefined {
  const trimmed = (cleanQuery || rawQuery).trim();
  if (!trimmed || trimmed.length < 2) return undefined;

  // Do not treat specialized media/maps/academic/news vertical tabs as navigational org queries
  const tab = (options?.type || options?.mode || '').toLowerCase();
  if (['images', 'image', 'videos', 'video', 'maps', 'news', 'shopping', 'books', 'research', 'academic'].includes(tab)) {
    return undefined;
  }

  // Detect direct URL or hostname query (e.g. "https://hs-ai-studio-4i7i.vercel.app/", "rmkec.ac.in", "react.dev")
  const directUrlMatch = trimmed.match(
    /^(https?:\/\/[^\s/$.?#].[^\s]*|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|edu|gov|io|ai|dev|app|in|co|uk|de|fr|jp|edu\.in|ac\.in|gov\.in|nic\.in|ac\.uk|vercel\.app|netlify\.app|onrender\.com|github\.io)(?:\/[^\s]*)?)$/i
  );
  if (directUrlMatch?.[1]) {
    const rawCandidate = directUrlMatch[1].trim();
    const targetUrl = /^https?:\/\//i.test(rawCandidate) ? rawCandidate : `https://${rawCandidate}`;
    try {
      const parsed = new URL(targetUrl);
      const targetDomain = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const cleanName = targetDomain;
      return {
        name: cleanName,
        normalizedName: targetDomain,
        entityType: 'website_service',
        targetUrl: parsed.toString(),
        targetDomain,
        abbreviations: [],
        alternativeNames: [rawCandidate, targetUrl],
        isSpecificEntityQuery: true,
        isAmbiguous: false,
        possibleMatches: [],
        confidence: 0.96
      };
    } catch {}
  }

  // Reject clear informational, comparison, comparison-style, mathematical, technical, or plural category queries
  if (/^[0-9+\-*/().\s^%]+$/.test(trimmed)) return undefined;
  if (QUESTION_OR_GENERIC_PREFIX.test(trimmed)) return undefined;
  if (NON_ENTITY_TOPIC_WORDS.test(trimmed)) return undefined;
  if (/\b(vs|versus|between|pros and cons|step by step|how to|tutorial|guide|what is|who is|reviews?|pricing|papers?|studies)\b/i.test(trimmed)) {
    return undefined;
  }
  if (PLURAL_GENERIC_NOUNS.test(trimmed) && !/\bofficial\b/i.test(trimmed)) {
    return undefined;
  }
  if (/\b(near me|nearby|around me|closest|nearest|in my area)\b/i.test(trimmed)) {
    return undefined;
  }
  // Phrases like "college in chennai" or "hospital in madurai" without a specific name are local category queries
  if (/^(college|university|school|hospital|restaurant|hotel)\s+(in|at|near)\s+/i.test(trimmed)) {
    return undefined;
  }

  // Detect optional target subpage intent ("RMK Engineering College admissions", "OpenAI docs", "Anna University placements")
  let targetSubpageIntent: string | undefined;
  for (const sp of SUBPAGE_INTENT_PATTERNS) {
    if (sp.regex.test(trimmed)) {
      targetSubpageIntent = sp.type;
      break;
    }
  }

  // Strip navigational/subpage words to extract clean entity name candidate
  const entityCandidate = trimmed
    .replace(NAVIGATIONAL_SUFFIX_REGEX, ' ')
    .replace(SUBPAGE_STRIP_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const name = entityCandidate.length >= 2 ? entityCandidate : trimmed;
  if (NON_ENTITY_SINGLE_WORDS.has(name.toLowerCase())) {
    return undefined;
  }

  const entityType = inferEntityType(name, trimmed);
  if (!entityType) return undefined;

  // Geographic context extraction from query (or region indicators)
  let country: string | undefined;
  let region: string | undefined;
  let locName: string | undefined;

  for (const locRule of KNOWN_MULTI_LOCATIONS) {
    if (locRule.pattern.test(trimmed)) {
      country = locRule.country;
      region = locRule.region || region;
      locName = locRule.location || locName;
    }
  }

  if (!locName) {
    for (const gp of GLOBAL_PLACES) {
      const rx = new RegExp(`\\b${gp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (rx.test(trimmed)) {
        country = gp.country_name;
        region = gp.state_province;
        locName = gp.name;
        break;
      }
    }
  }

  // Indian engineering/state institutions context (only as gentle geo hint, never forced on global brands)
  if (
    !country &&
    entityType === 'educational_institution' &&
    /\b(engineering college|anna university|iit|nit|iiit|ac\.in)\b/i.test(name) &&
    location?.country
  ) {
    country = location.country;
    if (location.region) region = location.region;
  }

  const abbreviations = buildAbbreviations(name);
  const dotStripped = name.replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const alternativeNames = Array.from(
    new Set([
      dotStripped,
      ...abbreviations
    ].filter((a) => a.toLowerCase() !== name.toLowerCase()))
  );

  // Ambiguity detection: short abbreviated org queries (e.g. "RMK College", "PSG College", "SRM College", "Apollo")
  const tokens = name.split(/\s+/).filter(Boolean);
  const isAmbiguous =
    (tokens.length <= 2 && /\b(college|institute|school|hospital|university|group|bank)\b/i.test(name)) ||
    /^[A-Z]{2,5}\s+(College|Institute|School|Hospital)$/i.test(name);

  let confidence = 0.72;
  if (ENTITY_TYPE_RULES.some((r) => r.regex.test(name))) confidence = 0.88;
  if (/\b(official website|official site|homepage|portal)\b/i.test(rawQuery)) confidence = 0.94;
  if (isAmbiguous) confidence = Math.min(confidence, 0.76);

  return {
    name,
    normalizedName: dotStripped.toLowerCase(),
    entityType,
    country,
    region,
    location: locName,
    abbreviations,
    alternativeNames,
    targetSubpageIntent,
    isSpecificEntityQuery: true,
    isAmbiguous,
    possibleMatches: [],
    confidence
  };
}
