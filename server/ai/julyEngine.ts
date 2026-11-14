import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { AiModelChoice, GeoLocationContext, HybridSearchResult, QueryIntelligence } from '../types';

const retrievedSourceStore = new Map<string, HybridSearchResult>();

export function registerRetrievedSources(items: HybridSearchResult[]) {
  for (const item of items) {
    retrievedSourceStore.set(item.id, item);
  }
  if (retrievedSourceStore.size > 1000) {
    const excess = retrievedSourceStore.size - 1000;
    const keys = retrievedSourceStore.keys();
    for (let i = 0; i < excess; i++) {
      const k = keys.next().value;
      if (k) retrievedSourceStore.delete(k);
    }
  }
}

export function getRetrievedSourceById(id: string): HybridSearchResult | undefined {
  return retrievedSourceStore.get(id);
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

export function resolveModelChoice(
  requested?: string,
  analysis?: QueryIntelligence
): { choice: AiModelChoice; thinkingLevel: ThinkingLevel; label: string } {
  if (requested === 'gravity') {
    return { choice: 'gravity', thinkingLevel: ThinkingLevel.HIGH, label: 'HS-Gravity-DeepResearch' };
  }
  if (requested === 'july') {
    return { choice: 'july', thinkingLevel: ThinkingLevel.LOW, label: 'HS-July-Fast' };
  }
  if (analysis && (analysis.intent === 'research' || analysis.intent === 'comparison' || analysis.tokens.length >= 7)) {
    return { choice: 'gravity', thinkingLevel: ThinkingLevel.HIGH, label: 'HS-Gravity-DeepResearch' };
  }
  return { choice: 'july', thinkingLevel: ThinkingLevel.LOW, label: 'HS-July-Fast' };
}

/**
 * Phase 5 — July AI Reranking over limited top candidate pool (<= 10 items).
 * Evaluates 7 explicit relevance, accuracy, usefulness, credibility, originality, and recency criteria.
 */
export async function rerankCandidatesWithJuly(
  query: string,
  analysis: QueryIntelligence,
  candidates: HybridSearchResult[],
  location?: GeoLocationContext
): Promise<{ reranked: HybridSearchResult[]; applied: boolean; model?: string; latencyMs: number }> {
  const t0 = performance.now();
  const topSet = candidates.slice(0, 10);
  if (topSet.length < 2) {
    return { reranked: candidates, applied: false, latencyMs: Math.round((performance.now() - t0) * 10) / 10 };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return { reranked: candidates, applied: false, latencyMs: Math.round((performance.now() - t0) * 10) / 10 };
  }

  try {
    const candidatePayload = topSet.map((c, idx) => ({
      id: c.id,
      rank: idx + 1,
      title: c.title,
      domain: c.domain,
      sourceClass: c.sourceClass || 'web',
      isOfficialWebsite: Boolean(c.isOfficialWebsite),
      isOfficialSubpage: Boolean(c.isOfficialSubpage),
      headings: (c.headings || []).slice(0, 3),
      publishedAt: c.publishedAt,
      snippet: c.snippet.slice(0, 260),
      contentExcerpt: c.content.slice(0, 360)
    }));

    const geoStr =
      analysis.hasLocalIntent && location?.enabled !== false && (location?.city || location?.country)
        ? `${location.city || ''}, ${location.region || ''}, ${location.country || ''}`
        : 'Global / Not location-dependent';

    const entityDirective = analysis.recognizedEntity?.isSpecificEntityQuery
      ? `\nEntity Navigational Directive: The user is querying "${analysis.recognizedEntity.name}" (${analysis.recognizedEntity.entityType}). Keep verified Official Websites (isOfficialWebsite=true) and verified Official Subpages (isOfficialSubpage=true) ranked above encyclopedias (Wikipedia) and third-party portals/directories.`
      : '';

    const rerankPromise = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Evaluate and rerank ONLY these retrieved search candidates for the user query. Do NOT invent IDs, URLs, or facts.\n\nQuery: ${query}\nNormalized Intent: ${analysis.intent} (credibility profile: ${analysis.credibilityProfile}, freshness need: ${analysis.freshnessNeed})\nGeographic Context: ${geoStr}${entityDirective}\n\nScore each candidate (0 to 1) jointly considering ALL 7 criteria:\n1. Does the page directly answer the query?\n2. Does the title accurately match the actual content?\n3. Is the page genuinely relevant to the topic rather than superficial keyword coincidence?\n4. Does it provide detailed, useful information?\n5. Is the source credible for this specific subject (${analysis.credibilityProfile})?\n6. Does it provide original information rather than shallow copied snippets?\n7. Is the recency appropriate for this query intent (${analysis.freshnessNeed})?\n\nCandidates:\n${JSON.stringify(candidatePayload)}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: 'Exact candidate id from input' },
              relevanceScore: { type: Type.NUMBER, description: 'Normalized 0 to 1 usefulness score' },
              reason: { type: Type.STRING, description: 'Concise factual reason citing criteria' }
            },
            required: ['id', 'relevanceScore']
          }
        }
      }
    });

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2600));
    const response = await Promise.race([rerankPromise, timeoutPromise]);

    if (!response) {
      return { reranked: candidates, applied: false, latencyMs: Math.round((performance.now() - t0) * 10) / 10 };
    }

    const parsed = JSON.parse((response.text ?? '[]').trim());
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { reranked: candidates, applied: false, latencyMs: Math.round((performance.now() - t0) * 10) / 10 };
    }

    const scoreMap = new Map<string, { score: number; reason?: string }>();
    for (const row of parsed) {
      if (row && typeof row.id === 'string' && typeof row.relevanceScore === 'number') {
        scoreMap.set(row.id, {
          score: Math.max(0, Math.min(1, row.relevanceScore)),
          reason: typeof row.reason === 'string' ? row.reason : undefined
        });
      }
    }

    const rerankedTop = [...topSet]
      .map((item) => {
        const evalEntry = scoreMap.get(item.id);
        let blended = item.scores.final;
        if (evalEntry) {
          item.aiRerankScore = evalEntry.score;
          item.aiRerankReason = evalEntry.reason;
          if (item._diagnostics) {
            item._diagnostics.aiRerankScore = evalEntry.score;
            item._diagnostics.aiRerankReason = evalEntry.reason;
          }
          // Non-destructive nudge (+-0.08 max) so primary organic rank & official signals aren't scrambled
          const rawDelta = 0.14 * (evalEntry.score - item.scores.final);
          const boundedDelta = Math.max(-0.08, Math.min(0.08, rawDelta));
          blended = Math.max(0, Math.min(1, item.scores.final + boundedDelta));
          item.scores.final = Math.round(blended * 1000) / 1000;
          item.score = item.scores.final;
        }
        return { item, blended };
      })
      .sort((a, b) => b.blended - a.blended)
      .map((x) => x.item);

    return {
      reranked: [...rerankedTop, ...candidates.slice(topSet.length)],
      applied: true,
      model: 'gemini-4-hydrogen',
      latencyMs: Math.round((performance.now() - t0) * 10) / 10
    };
  } catch {
    return { reranked: candidates, applied: false, latencyMs: Math.round((performance.now() - t0) * 10) / 10 };
  }
}

export type FollowupResponseStyle = 'auto' | 'concise' | 'detailed' | 'compare';

export interface ContextualizedFollowup {
  resolvedQuery: string;
  usedContextRewrite: boolean;
}

const PRONOUN_OR_DEICTIC_RE = /\b(it|its|they|their|theirs|them|this|that|these|those|he|him|his|she|her|hers|there|same)\b/i;
const ELLIPTICAL_PREFIX_RE = /^(?:what about|how about|and what about|and how about|more about|more on|tell me more|tell me about|explain|elaborate|compare|versus|vs\.?|pros and cons|advantages|disadvantages|why|when|where|who|which|how much|fees|cost|pricing|placements?|admissions?|courses?|syllabus|cutoff|cutoffs|ranking|reviews?|contact|location|address|examples?|alternatives?)\b/i;

function extractSubjectAnchor(
  rootQuery: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  entityName?: string
): string {
  if (entityName && entityName.trim().length >= 2) {
    return entityName.trim();
  }
  const candidates = [
    ...(history || []).filter((m) => m.role === 'user').map((m) => m.content),
    rootQuery
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const primary = rootQuery.trim() || candidates[0] || '';
  return primary
    .replace(/^(?:what is|what are|who is|who are|how to|guide to|overview of|tell me about)\s+/i, '')
    .replace(/[?!.]+$/, '')
    .trim();
}

export function deterministicFollowupRewrite(params: {
  rootQuery: string;
  followupQuery: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  entityName?: string;
}): ContextualizedFollowup {
  const cleanFollowup = params.followupQuery.trim().replace(/\s+/g, ' ');
  const subject = extractSubjectAnchor(params.rootQuery, params.history, params.entityName);
  if (!subject || subject.toLowerCase() === cleanFollowup.toLowerCase()) {
    return { resolvedQuery: cleanFollowup, usedContextRewrite: false };
  }

  const subjectTokens = subject
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const fqLower = cleanFollowup.toLowerCase();
  const alreadyMentionsSubject =
    subjectTokens.length > 0 &&
    subjectTokens.filter((t) => fqLower.includes(t)).length >= Math.min(2, subjectTokens.length);

  const hasPronoun = PRONOUN_OR_DEICTIC_RE.test(cleanFollowup);
  const isElliptical = ELLIPTICAL_PREFIX_RE.test(cleanFollowup) || cleanFollowup.split(/\s+/).length <= 4;

  if (alreadyMentionsSubject && !hasPronoun) {
    return { resolvedQuery: cleanFollowup, usedContextRewrite: false };
  }

  if (!hasPronoun && !isElliptical) {
    return { resolvedQuery: cleanFollowup, usedContextRewrite: false };
  }

  let rewritten = cleanFollowup;
  // Replace possessive/object pronouns carefully when subject is missing
  if (hasPronoun && !alreadyMentionsSubject) {
    rewritten = rewritten
      .replace(/\b(?:their|its)\b/gi, `${subject}`)
      .replace(/\b(?:it|them|they|this|that)\b/gi, subject);
  }

  // Strip conversational lead-ins when combining with subject
  rewritten = rewritten
    .replace(/^(?:what about|how about|and what about|and how about|tell me more about|more on)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const rewrittenLower = rewritten.toLowerCase();
  const containsSubjectNow =
    subjectTokens.length > 0 &&
    subjectTokens.filter((t) => rewrittenLower.includes(t)).length >= Math.min(2, subjectTokens.length);

  const finalQuery = (containsSubjectNow ? rewritten : `${subject} ${rewritten}`)
    .replace(/[?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return {
    resolvedQuery: finalQuery || cleanFollowup,
    usedContextRewrite: finalQuery.toLowerCase() !== cleanFollowup.toLowerCase()
  };
}

export async function contextualizeFollowupQuery(params: {
  rootQuery: string;
  followupQuery: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  entityName?: string;
}): Promise<ContextualizedFollowup> {
  const deterministic = deterministicFollowupRewrite(params);
  const cleanFollowup = params.followupQuery.trim();
  const ai = getGeminiClient();
  if (!ai || !params.rootQuery.trim()) {
    return deterministic;
  }

  const needsRewriteCheck =
    deterministic.usedContextRewrite ||
    PRONOUN_OR_DEICTIC_RE.test(cleanFollowup) ||
    ELLIPTICAL_PREFIX_RE.test(cleanFollowup) ||
    cleanFollowup.split(/\s+/).length <= 6;

  if (!needsRewriteCheck) {
    return deterministic;
  }

  try {
    const recentHistory = (params.history || [])
      .slice(-6)
      .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 260)}`)
      .join('\n');

    const rewritePromise = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Rewrite the user's latest follow-up question into a concise, standalone web search query (3 to 12 words, no quotes, no explanation). Resolve pronouns ("it", "they", "their", "this", "that") and implicit topics using the Root Query and Conversation History. Keep the original intent intact.\n\nRoot Query: ${params.rootQuery}\n${params.entityName ? `Active Entity: ${params.entityName}\n` : ''}${recentHistory ? `Conversation History:\n${recentHistory}\n` : ''}Latest Follow-up: ${cleanFollowup}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            standaloneQuery: { type: Type.STRING, description: 'Concise standalone web search query' }
          },
          required: ['standaloneQuery']
        }
      }
    });

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
    const response = await Promise.race([rewritePromise, timeoutPromise]);
    if (!response) return deterministic;

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const candidate = typeof parsed?.standaloneQuery === 'string' ? parsed.standaloneQuery.trim().slice(0, 120) : '';
    if (candidate && candidate.length >= 3) {
      return {
        resolvedQuery: candidate,
        usedContextRewrite: candidate.toLowerCase() !== cleanFollowup.toLowerCase()
      };
    }
    return deterministic;
  } catch {
    return deterministic;
  }
}

export interface AiOverviewPayload {
  answer: string;
  keyPoints: string[];
  confidence: 'high' | 'medium' | 'low';
  layoutType: string;
  modelUsed: AiModelChoice;
  modelLabel: string;
  disagreements: string | null;
  insufficientEvidence: boolean;
  relatedQuestions: string[];
  directAnswer?: string;
}

function formatSourceClassificationLabel(s: HybridSearchResult): string {
  if (s.isOfficialWebsite || s.sourceClass === 'official_website') {
    return `Official Website (verified confidence: ${Math.round((s.officialConfidence || 0.8) * 100)}%)`;
  }
  if (s.isOfficialSubpage || s.sourceClass === 'official_subpage') {
    return `Official Institutional Subpage (${s.discoveredSubpageType || 'internal'})`;
  }
  switch (s.sourceClass) {
    case 'wikipedia':
      return 'Wikipedia / Reference Encyclopedia';
    case 'academic':
      return 'Academic / Peer-Reviewed Source';
    case 'educational_portal':
      return 'Educational Aggregator / Portal';
    case 'directory':
      return 'Third-Party Directory / Profile';
    case 'news':
      return 'News Publication';
    default:
      return 'General Web Source';
  }
}

function buildEvidenceBlock(sources: HybridSearchResult[]): string {
  return sources
    .slice(0, 8)
    .map((s, idx) => {
      const pub = s.publishedAt ? `Published: ${s.publishedAt.slice(0, 10)}` : 'Published date: unavailable';
      const classification = formatSourceClassificationLabel(s);
      const headingsLine = s.headings?.length ? `\nHeadings: ${s.headings.slice(0, 4).join(' | ')}` : '';
      const metaLine = [s.publisher ? `Publisher: ${s.publisher}` : '', s.author ? `Author: ${s.author}` : '', s.isEnriched ? 'Enriched Full Page: Yes' : '']
        .filter(Boolean)
        .join(' | ');
      const body = (s.content || s.snippet || '').slice(0, 800);
      return `[${idx + 1}] Title: ${s.title}\nSource Classification: ${classification}\nPublisher Domain: ${s.domain}\nURL: ${s.url}\n${pub}${metaLine ? `\n${metaLine}` : ''}${headingsLine}\nExcerpt: ${body}`;
    })
    .join('\n\n');
}

export function detectSourceDisagreements(sources: HybridSearchResult[]): string | null {
  if (sources.length < 2) return null;
  const top = sources.slice(0, 5);
  const texts = top.map((s) => `${s.title} ${s.snippet} ${s.content.slice(0, 300)}`.toLowerCase());

  const positiveSignals = ['effective', 'safe', 'recommended', 'beneficial', 'faster', 'improves', 'supports', 'confirmed', 'true'];
  const negativeSignals = ['ineffective', 'unsafe', 'not recommended', 'harmful', 'slower', 'contradicts', 'disputed', 'debunked', 'false', 'controversial'];

  let posIdx = -1;
  let negIdx = -1;

  for (let i = 0; i < texts.length; i++) {
    if (posIdx === -1 && positiveSignals.some((w) => new RegExp(`\\b${w}\\b`).test(texts[i]))) posIdx = i;
    if (negIdx === -1 && negativeSignals.some((w) => new RegExp(`\\b${w}\\b`).test(texts[i]))) negIdx = i;
  }

  if (posIdx !== -1 && negIdx !== -1 && posIdx !== negIdx) {
    return `Retrieved sources show differing perspectives: [${posIdx + 1}] (${top[posIdx].domain}) and [${negIdx + 1}] (${top[negIdx].domain}) report contrasting conclusions.`;
  }

  // Detect differing numerical claims when both share percentages or years in opposing statements
  const pctList = texts.map((t) => t.match(/\b\d{1,3}(?:\.\d+)?%/g) || []);
  if (pctList[0]?.[0] && pctList[1]?.[0] && pctList[0][0] !== pctList[1][0]) {
    return `Retrieved sources report different quantitative figures ([1] cites ${pctList[0][0]}, while [2] cites ${pctList[1][0]}).`;
  }

  return null;
}

function buildFallbackOverview(
  query: string,
  sources: HybridSearchResult[],
  analysis: QueryIntelligence,
  modelChoice: AiModelChoice,
  modelLabel: string,
  directAnswer?: string,
  abstractText?: string,
  options?: {
    isFollowup?: boolean;
    rootQuery?: string;
    resolvedSearchQuery?: string;
    responseStyle?: FollowupResponseStyle;
  }
): AiOverviewPayload {
  const isFollowup = Boolean(options?.isFollowup);
  const displayTopic = options?.resolvedSearchQuery || analysis.correctedQuery || query;

  if (sources.length === 0 && !directAnswer && !abstractText) {
    return {
      answer: `Insufficient retrieved evidence: no verified indexed or external web sources matched "${displayTopic}". Try refining your follow-up or rephrasing with more context.`,
      keyPoints: [],
      confidence: 'low',
      layoutType: analysis.intentCategory,
      modelUsed: modelChoice,
      modelLabel,
      disagreements: null,
      insufficientEvidence: true,
      relatedQuestions: [
        `What are the fundamentals of ${displayTopic}?`,
        `Latest updates on ${displayTopic}`,
        `Key references for ${displayTopic}`
      ]
    };
  }

  const top = sources.slice(0, 5);
  const formatDateTag = (s: HybridSearchResult) =>
    s.publishedAt ? ` · ${String(s.publishedAt).slice(0, 10)}` : '';

  const officialIdx = sources.findIndex((s) => Boolean(s.isOfficialWebsite && (s.officialConfidence || 0) >= 0.62));
  const officialSource = officialIdx >= 0 ? sources[officialIdx] : undefined;
  const computedDirectAnswer =
    directAnswer ||
    (!isFollowup && officialSource
      ? `Official Website: ${officialSource.domain} (${officialSource.officialOrganizationName || analysis.recognizedEntity?.name || officialSource.title}) [${officialIdx + 1}]`
      : undefined);

  const keyPoints = top.slice(0, 4).map(
    (s, idx) =>
      `${s.isOfficialWebsite ? '[Official Website] ' : s.isOfficialSubpage ? '[Official Page] ' : ''}${s.title} (${s.domain}${formatDateTag(s)}): ${s.snippet.slice(0, 140)} [${idx + 1}]`
  );
  const disagreements = detectSourceDisagreements(top);

  let answer = '';
  const style = options?.responseStyle || 'auto';
  if (style === 'compare' && top.length >= 2) {
    const rows = top
      .slice(0, 4)
      .map(
        (s, i) =>
          `| ${s.domain} [${i + 1}] | ${s.title.slice(0, 42)} | ${s.snippet.slice(0, 110).replace(/\|/g, '/')}${formatDateTag(s)} |`
      )
      .join('\n');
    answer = `Grounded comparison for **${displayTopic}**:\n\n| Source | Focus | Key Finding |\n| --- | --- | --- |\n${rows}`;
  } else if (style === 'concise' && top.length >= 1) {
    answer = `${top[0].snippet}${formatDateTag(top[0])} [1]${top[1] ? ` Additionally, **${top[1].domain}** notes: ${top[1].snippet.slice(0, 140)} [2]` : ''}`;
  } else if (!isFollowup && officialSource && !directAnswer) {
    const citeNum = officialIdx + 1;
    const orgLabel = officialSource.officialOrganizationName || analysis.recognizedEntity?.name || officialSource.title;
    const subLinks = sources
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => s.isOfficialSubpage)
      .slice(0, 3)
      .map(({ s, idx }) => `• **${s.title}** (${s.discoveredSubpageType || 'page'}) [${idx + 1}]`)
      .join('\n');
    const refSourceIdx = sources.findIndex((s) => s.sourceClass === 'wikipedia');
    const refNote =
      refSourceIdx >= 0
        ? `\n\nIndependent Reference: **${sources[refSourceIdx].title}** (${sources[refSourceIdx].domain}) [${refSourceIdx + 1}]: ${sources[refSourceIdx].snippet.slice(0, 150)}`
        : '';

    answer = `The verified official website for **${orgLabel}** is **${officialSource.domain}** (${officialSource.url}) [${citeNum}]. ${officialSource.snippet}${subLinks ? `\n\nOfficial Website Sections:\n${subLinks}` : ''}${refNote}`;
  } else if (directAnswer) {
    answer = `${directAnswer}${top[0] ? ` — ${top[0].snippet} [1]` : ''}`;
  } else if (analysis.intent === 'comparison' && top.length >= 2) {
    const rows = top
      .slice(0, 3)
      .map(
        (s, i) =>
          `| ${s.domain} [${i + 1}] | ${s.title.slice(0, 42)} | ${s.snippet.slice(0, 110).replace(/\|/g, '/')}${formatDateTag(s)} |`
      )
      .join('\n');
    answer = `Grounded comparison from retrieved sources:\n\n| Source | Topic | Key Takeaway |\n| --- | --- | --- |\n${rows}`;
  } else if (analysis.intent === 'educational' && top.length >= 1) {
    const steps = top
      .slice(0, 3)
      .map((s, i) => `${i + 1}. **${s.title}** (${s.domain}) [${i + 1}]: ${s.snippet.slice(0, 160)}`)
      .join('\n');
    answer = `Based on the retrieved documentation and guides:\n\n${steps}`;
  } else if (
    abstractText &&
    (analysis.intent === 'definition' || analysis.intent === 'historical' || top[0]?.sourceClass === 'wikipedia')
  ) {
    answer = `${abstractText} [1]${top[1] ? `\n\nSupporting context from **${top[1].domain}**${formatDateTag(top[1])} [2]: ${top[1].snippet.slice(0, 180)}` : ''}`;
  } else {
    const lead = top[0];
    const leadDate = analysis.freshnessNeed === 'high' && lead.publishedAt ? ` (${lead.publishedAt.slice(0, 10)})` : '';
    const extra = top
      .slice(1, style === 'detailed' ? 4 : 3)
      .map((s, i) => `• **${s.title}** (${s.domain}${formatDateTag(s)}) [${i + 2}]: ${s.snippet.slice(0, 150)}`)
      .join('\n');
    answer = `${lead.snippet}${leadDate} [1]${extra ? `\n\nAdditional retrieved findings:\n${extra}` : ''}`;
  }

  if (disagreements) {
    answer += `\n\n**Source Divergence:** ${disagreements}`;
  }

  const uniqueDomains = new Set(top.map((s) => s.domain)).size;
  const topRelevance = top[0]?.scores?.final || 0;
  const topLexical = top[0]?.scores?.lexical || 0;
  const insufficient =
    top.length === 0 ||
    (!officialSource &&
      ((topRelevance < 0.22 && !directAnswer) || (topLexical < 0.18 && !directAnswer && !abstractText)));
  const confidence: 'high' | 'medium' | 'low' =
    officialSource || (!insufficient && top.length >= 3 && uniqueDomains >= 2)
      ? 'high'
      : top.length >= 1 && !insufficient
      ? 'medium'
      : 'low';

  const followupSuggestions = isFollowup
    ? [
        `Compare official details vs independent reviews on ${displayTopic}`,
        `Key limitations or caveats about ${displayTopic}`,
        `Latest updates regarding ${options?.rootQuery || displayTopic}`
      ]
    : analysis.recognizedEntity?.isSpecificEntityQuery
    ? [
        `${analysis.recognizedEntity.name} admissions and courses`,
        `${analysis.recognizedEntity.name} contact and location`,
        `${analysis.recognizedEntity.name} official announcements`
      ]
    : [
        `How does ${analysis.correctedQuery} work in practice?`,
        `Latest developments in ${analysis.correctedQuery}`,
        `Compare key sources on ${analysis.correctedQuery}`
      ];

  return {
    answer,
    keyPoints,
    confidence,
    layoutType: analysis.intentCategory,
    modelUsed: modelChoice,
    modelLabel,
    disagreements,
    insufficientEvidence: insufficient,
    relatedQuestions: followupSuggestions,
    directAnswer: computedDirectAnswer
  };
}

function buildStyleGuidance(style?: FollowupResponseStyle, isFollowup?: boolean): string {
  switch (style) {
    case 'concise':
      return 'Keep the answer concise and scannable (2-4 tight sentences or 3 crisp bullets with [n] citations).';
    case 'detailed':
      return 'Provide a thorough, multi-section breakdown with specific facts, dates, caveats, and [n] citations.';
    case 'compare':
      return 'Structure the answer with a Markdown comparison table across options/sources, followed by key differences.';
    default:
      return isFollowup
        ? 'Answer the user’s follow-up question directly without repeating earlier overview sections verbatim. Reference prior conversation continuity naturally while keeping every claim cited with [n].'
        : 'Provide a clear, factual overview strictly grounded in retrieved sources.';
  }
}

export async function generateAiOverview(params: {
  query: string;
  sources: HybridSearchResult[];
  analysis: QueryIntelligence;
  requestedModel?: string;
  directAnswer?: string;
  abstractText?: string;
  conversationContext?: Array<{ role: 'user' | 'assistant'; content: string }>;
  isFollowup?: boolean;
  rootQuery?: string;
  resolvedSearchQuery?: string;
  responseStyle?: FollowupResponseStyle;
}): Promise<AiOverviewPayload> {
  const {
    query,
    sources,
    analysis,
    directAnswer,
    abstractText,
    conversationContext,
    isFollowup,
    rootQuery,
    resolvedSearchQuery,
    responseStyle
  } = params;
  const modelInfo = resolveModelChoice(params.requestedModel, analysis);

  if (directAnswer && /^Direct Computation:/i.test(directAnswer)) {
    return buildFallbackOverview(query, sources, analysis, modelInfo.choice, modelInfo.label, directAnswer, abstractText, {
      isFollowup,
      rootQuery,
      resolvedSearchQuery,
      responseStyle
    });
  }

  if (sources.length === 0) {
    return buildFallbackOverview(query, sources, analysis, modelInfo.choice, modelInfo.label, directAnswer, abstractText, {
      isFollowup,
      rootQuery,
      resolvedSearchQuery,
      responseStyle
    });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return buildFallbackOverview(query, sources, analysis, modelInfo.choice, modelInfo.label, directAnswer, abstractText, {
      isFollowup,
      rootQuery,
      resolvedSearchQuery,
      responseStyle
    });
  }

  try {
    const evidence = buildEvidenceBlock(sources);
    const historyBlock = conversationContext?.length
      ? `\nConversation History (most recent last):\n${conversationContext
          .slice(-8)
          .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 550)}`)
          .join('\n')}\n`
      : '';

    const layoutGuidance: Record<string, string> = {
      navigational: 'Clearly identify the verified Official Website (only if explicitly labeled Official Website in Source Classification) with its [n] citation, summarize key official information, and separate independent references like Wikipedia or third-party portals.',
      comparison: 'Use a clean Markdown comparison table comparing options backed by [n] citations, followed by key differences.',
      tutorial: 'Use numbered step-by-step instructions grounded in the retrieved sources.',
      research: 'Summarize empirical evidence, methodology or citations rigorously with [n] inline references and publisher names.',
      news: 'Include explicit publication dates (YYYY-MM-DD) and original publisher attribution beside each development.',
      definition: 'Provide a clear, accurate definition followed by supporting context.',
      local: 'Highlight verified addresses, ratings/hours if present in evidence, and proximity details.',
      general: 'Provide a concise, factual overview strictly grounded in retrieved sources.'
    };

    const styleDirective = buildStyleGuidance(responseStyle, isFollowup);
    const sessionHeader = isFollowup
      ? `Original Search Topic: ${rootQuery || query}\nContextualized Retrieval Query: ${resolvedSearchQuery || query}\nCurrent Follow-Up Question: ${query}`
      : `User Query: ${query}`;

    const prompt = `${historyBlock}${sessionHeader}
Detected Intent: ${analysis.intent} (Freshness need: ${analysis.freshnessNeed})
Formatting Guidance: ${layoutGuidance[analysis.intentCategory] || layoutGuidance.general}
Turn Style Guidance: ${styleDirective}

Retrieved Search Sources:
${evidence}

Strict Grounding Rules:
- Answer ONLY using facts from the Retrieved Search Sources above.
- Cite sources inline using [1], [2], etc. and mention original publishers where helpful.
- Pay attention to Source Classification: distinguish Official Websites from Wikipedia encyclopedias, Academic sources, Educational Portals, and Third-Party Directories.
- For organization queries, identify the official website ONLY if one is verified in the sources above. Never invent or guess an official URL.
- For time-sensitive claims or news, always state the explicit publication date from the source metadata.
- Never fabricate URLs, dates, statistics, quotes, or claims.
- If sources disagree, clearly summarize the disagreement in both answer and disagreements.
- If evidence is insufficient to answer confidently, state that honestly and set insufficientEvidence=true.
- Suggest 3 concise, high-value follow-up questions in relatedQuestions that naturally continue this conversation.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: modelInfo.thinkingLevel },
        systemInstruction:
          modelInfo.choice === 'gravity'
            ? `You are Gravity, the deep reasoning and multi-turn research engine for Pendulum Search by HS AI Solutions. Be analytical, thorough, and strictly grounded.${isFollowup ? ' Focus directly on resolving the user’s follow-up question in context without repeating the opening overview.' : ''}`
            : `You are July, the fast grounded AI session assistant for Pendulum Search by HS AI Solutions. Be clear, concise, and strictly grounded.${isFollowup ? ' Answer the follow-up directly in context without repeating earlier answers.' : ''}`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING, description: 'Markdown grounded AI answer with [n] citations' },
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidence: { type: Type.STRING, description: 'high, medium, or low' },
            disagreements: { type: Type.STRING, description: 'Conflicting claims across sources, or empty string if none' },
            insufficientEvidence: { type: Type.BOOLEAN },
            relatedQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['answer', 'keyPoints', 'confidence', 'insufficientEvidence', 'relatedQuestions']
        }
      }
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    if (!parsed.answer) {
      return buildFallbackOverview(query, sources, analysis, modelInfo.choice, modelInfo.label, directAnswer, abstractText, {
        isFollowup,
        rootQuery,
        resolvedSearchQuery,
        responseStyle
      });
    }

    const officialIdx = sources.findIndex((s) => Boolean(s.isOfficialWebsite && (s.officialConfidence || 0) >= 0.62));
    const officialSource = officialIdx >= 0 ? sources[officialIdx] : undefined;
    const computedDirectAnswer =
      directAnswer ||
      (!isFollowup && officialSource
        ? `Official Website: ${officialSource.domain} (${officialSource.officialOrganizationName || analysis.recognizedEntity?.name || officialSource.title}) [${officialIdx + 1}]`
        : undefined);

    const conf = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';
    return {
      answer: String(parsed.answer),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5).map(String) : [],
      confidence: conf as 'high' | 'medium' | 'low',
      layoutType: analysis.intentCategory,
      modelUsed: modelInfo.choice,
      modelLabel: modelInfo.label,
      disagreements:
        parsed.disagreements && String(parsed.disagreements).trim()
          ? String(parsed.disagreements).trim()
          : detectSourceDisagreements(sources),
      insufficientEvidence: Boolean(parsed.insufficientEvidence),
      relatedQuestions: Array.isArray(parsed.relatedQuestions) ? parsed.relatedQuestions.slice(0, 4).map(String) : [],
      directAnswer: computedDirectAnswer
    };
  } catch {
    return buildFallbackOverview(query, sources, analysis, modelInfo.choice, modelInfo.label, directAnswer, abstractText, {
      isFollowup,
      rootQuery,
      resolvedSearchQuery,
      responseStyle
    });
  }
}

export async function streamAiOverviewText(
  params: {
    query: string;
    sources: HybridSearchResult[];
    analysis: QueryIntelligence;
    requestedModel?: string;
    directAnswer?: string;
    abstractText?: string;
    conversationContext?: Array<{ role: 'user' | 'assistant'; content: string }>;
    isFollowup?: boolean;
    rootQuery?: string;
    resolvedSearchQuery?: string;
    responseStyle?: FollowupResponseStyle;
  },
  onChunk: (delta: string) => void
): Promise<AiOverviewPayload> {
  const modelInfo = resolveModelChoice(params.requestedModel, params.analysis);
  const ai = getGeminiClient();

  if (!ai || params.sources.length === 0 || (params.directAnswer && /^Direct Computation:/i.test(params.directAnswer))) {
    const fb = buildFallbackOverview(
      params.query,
      params.sources,
      params.analysis,
      modelInfo.choice,
      modelInfo.label,
      params.directAnswer,
      params.abstractText,
      {
        isFollowup: params.isFollowup,
        rootQuery: params.rootQuery,
        resolvedSearchQuery: params.resolvedSearchQuery,
        responseStyle: params.responseStyle
      }
    );
    const words = fb.answer.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 4) {
      onChunk(words.slice(i, i + 4).join(''));
      await new Promise((r) => setTimeout(r, 12));
    }
    return fb;
  }

  try {
    const evidence = buildEvidenceBlock(params.sources);
    const historyBlock = params.conversationContext?.length
      ? `\nConversation context (oldest to newest):\n${params.conversationContext
          .slice(-8)
          .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
          .join('\n')}\n`
      : '';

    const styleDirective = buildStyleGuidance(params.responseStyle, params.isFollowup);
    const queryHeader = params.isFollowup
      ? `Original Topic: ${params.rootQuery || params.query}\nContextualized Retrieval Query: ${params.resolvedSearchQuery || params.query}\nFollow-up Question: ${params.query}`
      : `Query: ${params.query}`;

    const stream = await ai.models.generateContentStream({
      model: 'gemini-4-hydrogen',
      contents: `${historyBlock}${queryHeader}\nIntent: ${params.analysis.intent} (Freshness: ${params.analysis.freshnessNeed})\nStyle Guidance: ${styleDirective}\n\nEvidence:\n${evidence}\n\nWrite a strictly grounded Markdown response citing retrieved sources with [1], [2], etc. Distinguish verified Official Websites from Wikipedia or third-party directories, identify any verified official website domain ONLY if present in the evidence above, include original publication dates for time-sensitive claims, note any source disagreements, and never invent facts or URLs.`,
      config: {
        thinkingConfig: { thinkingLevel: modelInfo.thinkingLevel },
        systemInstruction:
          modelInfo.choice === 'gravity'
            ? `You are Gravity, Pendulum Search deep research AI. Cite retrieved sources strictly as [1], [2]. Never invent URLs or facts.${params.isFollowup ? ' Directly answer the follow-up in context without repeating the opening overview.' : ''}`
            : `You are July, Pendulum Search AI session engine. Be concise, accurate, and cite retrieved sources strictly as [1], [2].${params.isFollowup ? ' Directly answer the follow-up in context without repeating earlier answers.' : ''}`
      }
    });

    let fullText = '';
    for await (const chunk of stream) {
      const piece = chunk.text || '';
      if (piece) {
        fullText += piece;
        onChunk(piece);
      }
    }

    const fb = buildFallbackOverview(
      params.query,
      params.sources,
      params.analysis,
      modelInfo.choice,
      modelInfo.label,
      params.directAnswer,
      params.abstractText,
      {
        isFollowup: params.isFollowup,
        rootQuery: params.rootQuery,
        resolvedSearchQuery: params.resolvedSearchQuery,
        responseStyle: params.responseStyle
      }
    );
    return {
      ...fb,
      answer: fullText.trim() || fb.answer,
      disagreements: fb.disagreements,
      insufficientEvidence: /insufficient|uncertain|not enough/i.test(fullText)
    };
  } catch {
    const fb = buildFallbackOverview(
      params.query,
      params.sources,
      params.analysis,
      modelInfo.choice,
      modelInfo.label,
      params.directAnswer,
      params.abstractText,
      {
        isFollowup: params.isFollowup,
        rootQuery: params.rootQuery,
        resolvedSearchQuery: params.resolvedSearchQuery,
        responseStyle: params.responseStyle
      }
    );
    onChunk(fb.answer);
    return fb;
  }
}
