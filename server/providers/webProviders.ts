import { ProviderRawResult, QueryIntelligence, ResultType } from '../types';
import { TtlCache } from '../metrics';
import { fetchWithTimeout, isBlockedHost, stripHtml } from './duckduckgoProvider';

const mdnCache = new TtlCache<ProviderRawResult[]>(5 * 60_000, 100);
const soCache = new TtlCache<ProviderRawResult[]>(5 * 60_000, 100);
const npmCache = new TtlCache<ProviderRawResult[]>(5 * 60_000, 100);
const githubCache = new TtlCache<ProviderRawResult[]>(5 * 60_000, 100);
const arxivCache = new TtlCache<ProviderRawResult[]>(5 * 60_000, 100);
const openAlexCache = new TtlCache<ProviderRawResult[]>(5 * 60_000, 100);
const crossrefCache = new TtlCache<ProviderRawResult[]>(5 * 60_000, 100);
const directoryCache = new TtlCache<ProviderRawResult[]>(5 * 60_000, 100);
const wikiCache = new TtlCache<ProviderRawResult[]>(5 * 60_000, 100);

export interface RssFeedItem {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  content: string;
  publishedAt: string | null;
  publisher: string;
  category: string;
  feedId: string;
}

export interface LiveFeedState {
  id: string;
  name: string;
  url: string;
  category: string;
  status: 'active' | 'pending' | 'error';
  lastFetchedAt: string | null;
  itemCount: number;
  error?: string;
  latestHeadlines: Array<{ title: string; url: string; publishedAt: string | null }>;
}

const LIVE_RSS_FEEDS = [
  { id: 'bbc_tech', name: 'BBC News Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'news' },
  { id: 'guardian_tech', name: 'The Guardian Technology', url: 'https://www.theguardian.com/technology/rss', category: 'news' },
  { id: 'mit_tech_review', name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', category: 'news' },
  { id: 'thehindu_edu', name: 'The Hindu Education', url: 'https://www.thehindu.com/education/feeder/default.rss', category: 'news' },
  { id: 'arxiv_cs_ai', name: 'arXiv cs.AI Daily', url: 'https://rss.arxiv.org/rss/cs.AI', category: 'academic' }
];

const rssFeedItemCache = new TtlCache<RssFeedItem[]>(5 * 60_000, 20);
const feedStateMap = new Map<string, LiveFeedState>(
  LIVE_RSS_FEEDS.map((f) => [
    f.id,
    {
      id: f.id,
      name: f.name,
      url: f.url,
      category: f.category,
      status: 'pending',
      lastFetchedAt: null,
      itemCount: 0,
      latestHeadlines: []
    }
  ])
);

function domainOf(urlStr: string, fallback = 'web.source'): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return fallback;
  }
}

function faviconFor(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractXmlTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeXmlEntities(stripHtml(m[1])) : '';
}

function parseRssOrAtomXml(xml: string, feed: { id: string; name: string; category: string }): RssFeedItem[] {
  const items: RssFeedItem[] = [];
  const rssMatches = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi));
  const entryMatches = rssMatches.length === 0 ? Array.from(xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) : [];
  const blocks = rssMatches.length > 0 ? rssMatches : entryMatches;

  for (const m of blocks.slice(0, 25)) {
    const block = m[1];
    const title = extractXmlTag(block, 'title');
    let link = extractXmlTag(block, 'link');
    if (!link) {
      const atomLink = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (atomLink?.[1]) link = decodeXmlEntities(atomLink[1]);
    }
    if (!title || !link || isBlockedHost(link)) continue;

    const descRaw =
      extractXmlTag(block, 'description') ||
      extractXmlTag(block, 'summary') ||
      extractXmlTag(block, 'content');
    const pubRaw =
      extractXmlTag(block, 'pubDate') ||
      extractXmlTag(block, 'published') ||
      extractXmlTag(block, 'updated') ||
      extractXmlTag(block, 'dc:date');

    let publishedAt: string | null = null;
    if (pubRaw) {
      const ts = Date.parse(pubRaw);
      if (Number.isFinite(ts)) publishedAt = new Date(ts).toISOString();
    }

    const dom = domainOf(link);
    const snippet = descRaw.slice(0, 320) || `Published by ${feed.name} (${dom}).`;
    items.push({
      title: title.slice(0, 180),
      url: link,
      domain: dom,
      snippet,
      content: `${title}. ${descRaw}`.slice(0, 1200),
      publishedAt,
      publisher: feed.name,
      category: feed.category,
      feedId: feed.id
    });
  }

  return items;
}

export function getLiveFeedStates(): LiveFeedState[] {
  return Array.from(feedStateMap.values());
}

export async function refreshLiveRssFeeds(
  timeoutMs = 2600,
  onItemsDiscovered?: (items: RssFeedItem[]) => void
): Promise<RssFeedItem[]> {
  const allItems: RssFeedItem[] = [];

  await Promise.allSettled(
    LIVE_RSS_FEEDS.map(async (feed) => {
      const cached = rssFeedItemCache.get(feed.id);
      if (cached) {
        allItems.push(...cached);
        return;
      }

      try {
        const res = await fetchWithTimeout(
          feed.url,
          { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } },
          timeoutMs
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const parsed = parseRssOrAtomXml(xml, feed);
        rssFeedItemCache.set(feed.id, parsed);
        feedStateMap.set(feed.id, {
          id: feed.id,
          name: feed.name,
          url: feed.url,
          category: feed.category,
          status: parsed.length > 0 ? 'active' : 'error',
          lastFetchedAt: new Date().toISOString(),
          itemCount: parsed.length,
          latestHeadlines: parsed.slice(0, 3).map((i) => ({
            title: i.title,
            url: i.url,
            publishedAt: i.publishedAt
          }))
        });
        if (parsed.length > 0 && onItemsDiscovered) {
          onItemsDiscovered(parsed);
        }
        allItems.push(...parsed);
      } catch (err: any) {
        const prev = feedStateMap.get(feed.id);
        feedStateMap.set(feed.id, {
          id: feed.id,
          name: feed.name,
          url: feed.url,
          category: feed.category,
          status: 'error',
          lastFetchedAt: prev?.lastFetchedAt || null,
          itemCount: prev?.itemCount || 0,
          error: err?.message || 'feed fetch error',
          latestHeadlines: prev?.latestHeadlines || []
        });
      }
    })
  );

  return allItems;
}

export async function fetchDeveloperDocsAndPackages(
  query: string,
  intel: QueryIntelligence,
  limit = 16,
  timeoutMs = 2800
): Promise<{
  results: ProviderRawResult[];
  metrics: Record<string, { count: number; latencyMs: number; status: string }>;
}> {
  const results: ProviderRawResult[] = [];
  const metrics: Record<string, { count: number; latencyMs: number; status: string }> = {};
  const qLower = query.toLowerCase();

  const mdnTask = (async () => {
    const t0 = performance.now();
    const cacheKey = `${qLower}:mdn`;
    const cached = mdnCache.get(cacheKey);
    if (cached) {
      results.push(...cached);
      metrics.mdn_docs = { count: cached.length, latencyMs: 0, status: 'ok' };
      return;
    }
    try {
      const url = `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=en-US`;
      const res = await fetchWithTimeout(url, {}, Math.min(timeoutMs, 2600));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const docs = (data?.documents || []).slice(0, Math.min(limit, 8));
      const mapped: ProviderRawResult[] = docs
        .filter((d: any) => d?.mdn_url && d?.title)
        .map((d: any, idx: number) => {
          const fullUrl = `https://developer.mozilla.org${d.mdn_url}`;
          const summary = stripHtml(String(d.summary || '')).slice(0, 320);
          return {
            id: `ext-mdn-${idx}-${String(d.slug || d.title).slice(0, 12)}`,
            title: `${String(d.title)} — MDN Web Docs`,
            url: fullUrl,
            canonicalUrl: fullUrl,
            snippet: summary || `MDN Web Docs reference for ${d.title}.`,
            domain: 'developer.mozilla.org',
            content: `${d.title} ${summary}`,
            publishedAt: null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'mdn_docs',
            providerDetail: 'MDN Web Docs',
            rank: idx + 1,
            rawScore: Math.max(0.62, 0.94 - idx * 0.03),
            resultType: 'web' as ResultType,
            category: 'tech',
            language: 'en',
            favicon: faviconFor('developer.mozilla.org')
          };
        });
      mdnCache.set(cacheKey, mapped);
      results.push(...mapped);
      metrics.mdn_docs = { count: mapped.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      metrics.mdn_docs = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'skipped' };
    }
  })();

  const soTask = (async () => {
    const t0 = performance.now();
    const cacheKey = `${qLower}:so`;
    const cached = soCache.get(cacheKey);
    if (cached) {
      results.push(...cached);
      metrics.stackoverflow = { count: cached.length, latencyMs: 0, status: 'ok' };
      return;
    }
    try {
      const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=6`;
      const res = await fetchWithTimeout(url, {}, Math.min(timeoutMs, 2600));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const items = (data?.items || []).slice(0, 6);
      const mapped: ProviderRawResult[] = items
        .filter((it: any) => it?.link && it?.title && !isBlockedHost(it.link))
        .map((it: any, idx: number) => {
          const title = stripHtml(String(it.title));
          const tags = Array.isArray(it.tags) ? it.tags.slice(0, 4).join(', ') : '';
          const snippet = `Stack Overflow Q&A (${it.score || 0} votes, ${it.answer_count || 0} answers${it.is_answered ? ', accepted/answered' : ''})${tags ? ` · Tags: ${tags}` : ''}.`;
          return {
            id: `ext-so-${it.question_id || idx}`,
            title,
            url: String(it.link),
            canonicalUrl: String(it.link),
            snippet,
            domain: 'stackoverflow.com',
            content: `${title} ${tags} ${snippet}`,
            publishedAt: it.last_activity_date ? new Date(it.last_activity_date * 1000).toISOString() : null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'stackoverflow',
            providerDetail: 'Stack Overflow',
            rank: idx + 1,
            rawScore: Math.max(0.58, 0.89 - idx * 0.03),
            resultType: 'web' as ResultType,
            category: 'tech',
            language: 'en',
            favicon: faviconFor('stackoverflow.com')
          };
        });
      soCache.set(cacheKey, mapped);
      results.push(...mapped);
      metrics.stackoverflow = { count: mapped.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      metrics.stackoverflow = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'skipped' };
    }
  })();

  const npmTask = (async () => {
    const t0 = performance.now();
    const shouldQueryNpm =
      intel.intent === 'technical' ||
      intel.credibilityProfile === 'technical' ||
      /\b(react|vue|angular|next|vite|node|typescript|javascript|npm|package|library|framework|sdk|docs|documentation)\b/i.test(qLower);
    if (!shouldQueryNpm) {
      metrics.npm_registry = { count: 0, latencyMs: 0, status: 'skipped' };
      return;
    }
    const cacheKey = `${qLower}:npm`;
    const cached = npmCache.get(cacheKey);
    if (cached) {
      results.push(...cached);
      metrics.npm_registry = { count: cached.length, latencyMs: 0, status: 'ok' };
      return;
    }
    try {
      const cleanTerm = intel.tokens.filter((t) => !['official', 'documentation', 'docs', 'guide', 'tutorial'].includes(t)).join(' ') || query;
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(cleanTerm)}&size=5`;
      const res = await fetchWithTimeout(url, {}, Math.min(timeoutMs, 2400));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const objs = (data?.objects || []).slice(0, 5);
      const mapped: ProviderRawResult[] = [];
      const seenUrls = new Set<string>();

      objs.forEach((obj: any, idx: number) => {
        const pkg = obj?.package;
        if (!pkg?.name) return;
        const homepage = pkg?.links?.homepage;
        const npmUrl = pkg?.links?.npm || `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`;
        if (homepage && /^https?:\/\//i.test(homepage) && !isBlockedHost(homepage) && !homepage.includes('github.com') && !seenUrls.has(homepage)) {
          seenUrls.add(homepage);
          const hpDom = domainOf(homepage);
          mapped.push({
            id: `ext-npm-hp-${pkg.name}-${idx}`,
            title: `${pkg.name} — Official Project Homepage & Docs`,
            url: homepage,
            canonicalUrl: homepage,
            snippet: `${pkg.description || `${pkg.name} documentation and package homepage.`} (v${pkg.version || 'latest'}).`,
            domain: hpDom,
            content: `${pkg.name} ${pkg.description || ''} ${(pkg.keywords || []).join(' ')}`,
            publishedAt: pkg.date || null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'npm_homepage',
            providerDetail: hpDom,
            rank: idx + 1,
            rawScore: Math.max(0.68, 0.94 - idx * 0.04),
            resultType: 'web',
            category: 'tech',
            language: 'en',
            favicon: faviconFor(hpDom)
          });
        }
        if (!seenUrls.has(npmUrl)) {
          seenUrls.add(npmUrl);
          mapped.push({
            id: `ext-npm-pkg-${pkg.name}-${idx}`,
            title: `${pkg.name} — npm Package Registry`,
            url: npmUrl,
            canonicalUrl: npmUrl,
            snippet: `${pkg.description || 'JavaScript/TypeScript package on npm.'} Latest release: ${pkg.version || 'N/A'}.`,
            domain: 'npmjs.com',
            content: `${pkg.name} ${pkg.description || ''} ${(pkg.keywords || []).join(' ')}`,
            publishedAt: pkg.date || null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'npm_registry',
            providerDetail: 'npm Registry',
            rank: idx + 2,
            rawScore: Math.max(0.55, 0.82 - idx * 0.04),
            resultType: 'web',
            category: 'tech',
            language: 'en',
            favicon: faviconFor('npmjs.com')
          });
        }
      });
      npmCache.set(cacheKey, mapped);
      results.push(...mapped);
      metrics.npm_registry = { count: mapped.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      metrics.npm_registry = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'skipped' };
    }
  })();

  const githubTask = (async () => {
    const t0 = performance.now();
    const cacheKey = `${qLower}:gh`;
    const cached = githubCache.get(cacheKey);
    if (cached) {
      results.push(...cached);
      metrics.github_repos = { count: cached.length, latencyMs: 0, status: 'ok' };
      return;
    }
    try {
      const ghQuery = intel.tokens.filter((t) => !['official', 'documentation', 'docs'].includes(t)).join(' ') || query;
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(ghQuery)}&sort=stars&order=desc&per_page=8`;
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/vnd.github+json' } }, Math.min(timeoutMs, 2600));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const items = (data?.items || []).slice(0, 8);
      const mapped: ProviderRawResult[] = [];
      const seenHomepages = new Set<string>();

      const queryTokensNorm = intel.tokens
        .map((t) => t.toLowerCase())
        .filter((t) => t.length >= 2 && !['official', 'documentation', 'docs', 'website', 'solutions', 'studio'].includes(t));

      items.forEach((repo: any, idx: number) => {
        if (!repo?.html_url) return;
        const hp = typeof repo.homepage === 'string' ? repo.homepage.trim() : '';
        const repoNameLower = String(repo.name || '').toLowerCase();
        const fullNameLower = String(repo.full_name || '').toLowerCase();
        const stars = Number(repo.stargazers_count || 0);
        const exactNameMatch = queryTokensNorm.length > 0 && queryTokensNorm.every((t) => repoNameLower.includes(t) || fullNameLower.includes(t));
        const hasCredibleMatch = exactNameMatch && (stars >= 5 || repoNameLower === queryTokensNorm.join('') || repoNameLower === queryTokensNorm.join('-'));

        if (hp && /^https?:\/\//i.test(hp) && !isBlockedHost(hp) && !hp.includes('github.com') && !seenHomepages.has(hp) && idx < 4 && hasCredibleMatch) {
          seenHomepages.add(hp);
          const hpDom = domainOf(hp);
          mapped.push({
            id: `ext-gh-hp-${repo.id || idx}`,
            title: `${repo.name} — Project Website (${hpDom})`,
            url: hp,
            canonicalUrl: hp,
            snippet: `${repo.description || repo.full_name} · Linked from ${repo.full_name} (${stars} stars).`,
            domain: hpDom,
            content: `${repo.full_name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`,
            publishedAt: repo.pushed_at || repo.updated_at || null,
            updatedAt: repo.updated_at || null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'github_homepage',
            providerDetail: hpDom,
            rank: idx + 1,
            rawScore: Math.max(0.6, 0.85 - idx * 0.03),
            resultType: 'web',
            category: 'tech',
            language: 'en',
            favicon: faviconFor(hpDom)
          });
        }

        const desc = `${repo.description || 'Open-source repository'} · ★ ${repo.stargazers_count || 0}${repo.language ? ` · ${repo.language}` : ''}`;
        mapped.push({
          id: `ext-gh-${repo.id || idx}`,
          title: `${repo.full_name} — GitHub Repository`,
          url: repo.html_url,
          canonicalUrl: repo.html_url,
          snippet: desc.slice(0, 320),
          domain: 'github.com',
          content: `${repo.full_name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`,
          publishedAt: repo.pushed_at || repo.updated_at || null,
          updatedAt: repo.updated_at || null,
          indexedAt: new Date().toISOString(),
          source: 'external',
          subProvider: 'github_repos',
          providerDetail: 'GitHub',
          rank: idx + 1,
          rawScore: Math.max(0.55, 0.88 - idx * 0.025),
          resultType: 'web',
          category: 'tech',
          language: 'en',
          favicon: faviconFor('github.com')
        });
      });

      githubCache.set(cacheKey, mapped);
      results.push(...mapped);
      metrics.github_repos = { count: mapped.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      metrics.github_repos = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'skipped' };
    }
  })();

  await Promise.allSettled([mdnTask, soTask, npmTask, githubTask]);
  return { results, metrics };
}

export async function fetchLiveJournalismFeeds(
  query: string,
  intel: QueryIntelligence,
  limit = 16,
  timeoutMs = 2800,
  onRssArticles?: (items: RssFeedItem[]) => void
): Promise<{
  results: ProviderRawResult[];
  metrics: Record<string, { count: number; latencyMs: number; status: string }>;
}> {
  const results: ProviderRawResult[] = [];
  const metrics: Record<string, { count: number; latencyMs: number; status: string }> = {};

  const rssTask = (async () => {
    const t0 = performance.now();
    try {
      const feedItems = await refreshLiveRssFeeds(Math.min(timeoutMs, 2600), onRssArticles);
      const coreTokens = intel.tokens.filter((t) => !['latest', 'news', 'today', 'recent', 'developments', 'update', 'updates'].includes(t));
      const expandSet = new Set(intel.expandedTokens);

      const scored = feedItems
        .map((item) => {
          const hay = `${item.title} ${item.snippet}`.toLowerCase();
          let hits = 0;
          for (const tok of coreTokens) {
            if (hay.includes(tok)) hits += 2;
          }
          for (const et of expandSet) {
            if (hay.includes(et)) hits += 0.5;
          }
          return { item, hits };
        })
        .filter(({ hits }) => (coreTokens.length === 0 ? true : hits >= 1.5))
        .sort((a, b) => {
          if (b.hits !== a.hits) return b.hits - a.hits;
          const ta = a.item.publishedAt ? Date.parse(a.item.publishedAt) || 0 : 0;
          const tb = b.item.publishedAt ? Date.parse(b.item.publishedAt) || 0 : 0;
          return tb - ta;
        })
        .slice(0, Math.min(limit, 10));

      scored.forEach(({ item }, idx) => {
        results.push({
          id: `ext-rss-${item.feedId}-${idx}-${Buffer.from(item.url).toString('base64').slice(0, 8)}`,
          title: item.title,
          url: item.url,
          canonicalUrl: item.url,
          snippet: item.snippet,
          domain: item.domain,
          content: item.content,
          publishedAt: item.publishedAt,
          indexedAt: new Date().toISOString(),
          crawledAt: new Date().toISOString(),
          source: 'external',
          subProvider: 'live_rss_journalism',
          providerDetail: item.publisher,
          rank: idx + 1,
          rawScore: Math.max(0.65, 0.93 - idx * 0.03),
          resultType: item.category === 'academic' ? 'research' : 'news',
          category: item.category,
          language: 'en',
          favicon: faviconFor(item.domain),
          isLive: true
        });
      });

      metrics.live_rss = { count: scored.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      metrics.live_rss = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'error' };
    }
  })();

  const hnTask = (async () => {
    const t0 = performance.now();
    try {
      const endpoint = intel.freshnessNeed === 'high' ? 'search_by_date' : 'search';
      const url = `https://hn.algolia.com/api/v1/${endpoint}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${Math.min(limit, 15)}`;
      const res = await fetchWithTimeout(url, {}, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      let count = 0;
      (data?.hits || [])
        .filter((h: any) => h.title && h.url && !isBlockedHost(h.url))
        .slice(0, 12)
        .forEach((h: any, idx: number) => {
          const dom = domainOf(h.url, 'news.ycombinator.com');
          const text = h.story_text
            ? stripHtml(h.story_text)
            : `Reported on ${dom} (${h.points || 0} community votes, ${h.num_comments || 0} comments).`;
          count++;
          results.push({
            id: `ext-hn-${h.objectID || idx}`,
            title: String(h.title),
            url: String(h.url),
            canonicalUrl: String(h.url),
            snippet: text.slice(0, 300),
            domain: dom,
            content: text,
            publishedAt: h.created_at || null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'hackernews',
            providerDetail: dom,
            rank: idx + 1,
            rawScore: Math.max(0.54, 0.88 - idx * 0.02),
            resultType: 'news',
            category: 'news',
            language: 'en',
            favicon: faviconFor(dom),
            isLive: true
          });
        });
      metrics.hackernews = { count, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      metrics.hackernews = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'error' };
    }
  })();

  await Promise.allSettled([rssTask, hnTask]);
  return { results, metrics };
}

export async function fetchAcademicWeb(
  query: string,
  limit = 16,
  timeoutMs = 3000
): Promise<{
  results: ProviderRawResult[];
  metrics: Record<string, { count: number; latencyMs: number; status: string }>;
}> {
  const results: ProviderRawResult[] = [];
  const metrics: Record<string, { count: number; latencyMs: number; status: string }> = {};
  const qLower = query.toLowerCase();

  const arxivTask = (async () => {
    const t0 = performance.now();
    const cacheKey = `${qLower}:arxiv`;
    const cached = arxivCache.get(cacheKey);
    if (cached) {
      results.push(...cached);
      metrics.arxiv = { count: cached.length, latencyMs: 0, status: 'ok' };
      return;
    }
    try {
      const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${Math.min(limit, 8)}`;
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/atom+xml,text/xml' } }, Math.min(timeoutMs, 2800));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi));
      const mapped: ProviderRawResult[] = [];

      entries.forEach((em, idx) => {
        const block = em[1];
        const title = extractXmlTag(block, 'title');
        const idUrl = extractXmlTag(block, 'id').replace(/^http:\/\//i, 'https://');
        const summary = extractXmlTag(block, 'summary');
        const published = extractXmlTag(block, 'published') || null;
        const authors = Array.from(block.matchAll(/<author>\s*<name>([^<]+)<\/name>/gi))
          .slice(0, 3)
          .map((a) => decodeXmlEntities(a[1]))
          .join(', ');
        if (!title || !idUrl || isBlockedHost(idUrl)) return;
        const snippet = `${authors ? `Authors: ${authors}. ` : ''}${summary}`.slice(0, 360);
        mapped.push({
          id: `ext-arxiv-${idx}-${idUrl.split('/').pop() || idx}`,
          title,
          url: idUrl,
          canonicalUrl: idUrl,
          snippet,
          domain: 'arxiv.org',
          content: `${title}. ${authors}. ${summary}`.slice(0, 1200),
          publishedAt: published,
          indexedAt: new Date().toISOString(),
          source: 'external',
          subProvider: 'arxiv_api',
          providerDetail: 'Cornell University arXiv',
          rank: idx + 1,
          rawScore: Math.max(0.62, 0.93 - idx * 0.03),
          resultType: 'research',
          category: 'academic',
          language: 'en',
          favicon: faviconFor('arxiv.org')
        });
      });

      arxivCache.set(cacheKey, mapped);
      results.push(...mapped);
      metrics.arxiv = { count: mapped.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      metrics.arxiv = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'skipped' };
    }
  })();

  const openAlexTask = (async () => {
    const t0 = performance.now();
    const cacheKey = `${qLower}:openalex`;
    const cached = openAlexCache.get(cacheKey);
    if (cached) {
      results.push(...cached);
      metrics.openalex = { count: cached.length, latencyMs: 0, status: 'ok' };
      return;
    }
    try {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${Math.min(limit, 12)}`;
      const res = await fetchWithTimeout(url, {}, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const items = data?.results || [];
      const mapped: ProviderRawResult[] = items.map((w: any, idx: number) => {
        const workUrl = w.primary_location?.landing_page_url || w.doi || w.id || 'https://openalex.org';
        const safeUrl = isBlockedHost(workUrl) ? w.doi || w.id || 'https://openalex.org' : workUrl;
        const authors = (w.authorships || []).slice(0, 3).map((a: any) => a?.author?.display_name).filter(Boolean).join(', ');
        const venue = w.primary_location?.source?.display_name || 'Scholarly Publication';
        const pubDate = w.publication_date || (w.publication_year ? `${w.publication_year}-01-01` : null);
        const desc = `${authors ? `Authors: ${authors}. ` : ''}Published in ${venue}${w.publication_year ? ` (${w.publication_year})` : ''}. Cited by ${w.cited_by_count ?? 0} works.`;
        const dom = domainOf(safeUrl, 'openalex.org');
        return {
          id: `ext-openalex-${idx}`,
          title: w.title || 'Academic Publication',
          url: safeUrl,
          canonicalUrl: safeUrl,
          snippet: desc,
          domain: dom,
          content: desc,
          publishedAt: pubDate,
          indexedAt: new Date().toISOString(),
          source: 'external' as const,
          subProvider: 'openalex',
          providerDetail: venue,
          rank: idx + 1,
          rawScore: Math.max(0.54, 0.90 - idx * 0.022),
          resultType: 'research' as ResultType,
          category: 'academic',
          language: 'en',
          favicon: faviconFor(dom)
        };
      });
      openAlexCache.set(cacheKey, mapped);
      results.push(...mapped);
      metrics.openalex = { count: mapped.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      metrics.openalex = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'error' };
    }
  })();

  const crossrefTask = (async () => {
    const t0 = performance.now();
    const cacheKey = `${qLower}:crossref`;
    const cached = crossrefCache.get(cacheKey);
    if (cached) {
      results.push(...cached);
      metrics.crossref = { count: cached.length, latencyMs: 0, status: 'ok' };
      return;
    }
    try {
      const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${Math.min(limit, 8)}&select=DOI,title,author,published-print,container-title,URL`;
      const res = await fetchWithTimeout(url, {}, Math.min(timeoutMs, 2800));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const items = data?.message?.items || [];
      const mapped: ProviderRawResult[] = [];
      items.forEach((item: any, idx: number) => {
        const title = Array.isArray(item.title) ? item.title[0] : item.title;
        const itemUrl = item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : '');
        if (!title || !itemUrl || isBlockedHost(itemUrl)) return;
        const authors = Array.isArray(item.author)
          ? item.author.slice(0, 3).map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).join(', ')
          : '';
        const journal = Array.isArray(item['container-title']) ? item['container-title'][0] : '';
        const dateParts = item['published-print']?.['date-parts']?.[0];
        const pubDate =
          Array.isArray(dateParts) && dateParts[0]
            ? `${dateParts[0]}-${String(dateParts[1] || 1).padStart(2, '0')}-${String(dateParts[2] || 1).padStart(2, '0')}`
            : null;
        const snippet = `${authors ? `${authors}. ` : ''}${journal ? `Journal: ${journal}. ` : ''}DOI: ${item.DOI || 'Indexed academic work'}.`;
        mapped.push({
          id: `ext-crossref-${idx}`,
          title: String(title),
          url: itemUrl,
          canonicalUrl: itemUrl,
          snippet,
          domain: domainOf(itemUrl, 'doi.org'),
          content: snippet,
          publishedAt: pubDate,
          indexedAt: new Date().toISOString(),
          source: 'external',
          subProvider: 'crossref',
          providerDetail: journal || 'CrossRef',
          rank: idx + 1,
          rawScore: Math.max(0.55, 0.89 - idx * 0.025),
          resultType: 'research',
          category: 'academic',
          language: 'en',
          favicon: faviconFor('doi.org')
        });
      });
      crossrefCache.set(cacheKey, mapped);
      results.push(...mapped);
      metrics.crossref = { count: mapped.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' };
    } catch {
      metrics.crossref = { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'skipped' };
    }
  })();

  await Promise.allSettled([arxivTask, openAlexTask, crossrefTask]);
  return { results, metrics };
}

export async function fetchDirectoryAndInstitutionalWeb(
  query: string,
  intel: QueryIntelligence,
  limit = 12,
  timeoutMs = 2800
): Promise<{
  results: ProviderRawResult[];
  metrics: Record<string, { count: number; latencyMs: number; status: string }>;
}> {
  const results: ProviderRawResult[] = [];
  const metrics: Record<string, { count: number; latencyMs: number; status: string }> = {};
  const cacheKey = `${query.toLowerCase()}:dir`;
  const cached = directoryCache.get(cacheKey);
  if (cached) {
    return {
      results: cached,
      metrics: { directory_registries: { count: cached.length, latencyMs: 0, status: 'ok' } }
    };
  }

  const t0 = performance.now();
  const tasks: Array<Promise<void>> = [];
  const qClean = intel.tokens
    .filter((t) => !['best', 'top', 'official', 'website', 'how', 'does', 'work'].includes(t))
    .join(' ') || query;

  // Task 1: OpenAlex Institutions (surfaces official college/university homepages dynamically)
  if (/\b(colleges?|universit|institute|iit|nit|engineering|education|scholarship|research)\b/i.test(query)) {
    tasks.push(
      (async () => {
        try {
          const url = `https://api.openalex.org/institutions?search=${encodeURIComponent(qClean)}&per-page=${Math.min(limit, 8)}`;
          const res = await fetchWithTimeout(url, {}, Math.min(timeoutMs, 2600));
          if (!res.ok) return;
          const data: any = await res.json();
          (data?.results || []).forEach((inst: any, idx: number) => {
            const hp = inst?.homepage_url;
            if (!hp || !/^https?:\/\//i.test(hp) || isBlockedHost(hp)) return;
            const dom = domainOf(hp);
            const geoLabel = [inst.geo?.city, inst.geo?.region, inst.geo?.country].filter(Boolean).join(', ');
            results.push({
              id: `ext-oa-inst-${idx}-${dom}`,
              title: `${inst.display_name || dom} — Official Website`,
              url: hp,
              canonicalUrl: hp,
              snippet: `${inst.display_name} (${inst.type || 'institution'}${geoLabel ? ` · ${geoLabel}` : ''}). ${inst.works_count || 0} indexed research publications.`,
              domain: dom,
              content: `${inst.display_name} ${(inst.display_name_alternatives || []).join(' ')} ${geoLabel}`,
              publishedAt: null,
              indexedAt: new Date().toISOString(),
              source: 'external',
              subProvider: 'openalex_institutions',
              providerDetail: dom,
              rank: idx + 1,
              rawScore: Math.max(0.64, 0.91 - idx * 0.03),
              resultType: 'web',
              category: 'academic',
              language: 'en',
              favicon: faviconFor(dom),
              location: inst.geo?.latitude
                ? {
                    city: inst.geo?.city,
                    region: inst.geo?.region,
                    country: inst.geo?.country,
                    lat: inst.geo.latitude,
                    lon: inst.geo.longitude
                  }
                : undefined
            });
          });
        } catch {}
      })()
    );
  }

  // Task 2: ROR v2 Organization Registry (surfaces official .gov / .org / .edu / corporate homepages)
  tasks.push(
    (async () => {
      try {
        const url = `https://api.ror.org/v2/organizations?query=${encodeURIComponent(qClean)}`;
        const res = await fetchWithTimeout(url, {}, Math.min(timeoutMs, 2600));
        if (!res.ok) return;
        const data: any = await res.json();
        (data?.items || []).slice(0, 6).forEach((org: any, idx: number) => {
          const hp = org?.links?.find((l: any) => l.type === 'website')?.value;
          if (!hp || !/^https?:\/\//i.test(hp) || isBlockedHost(hp)) return;
          const name =
            org?.names?.find((n: any) => (n.types || []).includes('ror_display'))?.value ||
            org?.names?.[0]?.value ||
            '';
          if (!name) return;
          const loc = org?.locations?.[0]?.geonames_details;
          const geoStr = [loc?.name, loc?.country_subdivision_name, loc?.country_name].filter(Boolean).join(', ');
          const dom = domainOf(hp);
          results.push({
            id: `ext-ror-org-${idx}-${dom}`,
            title: `${name} — Official Organization Portal`,
            url: hp,
            canonicalUrl: hp,
            snippet: `${name} official portal${geoStr ? ` (${geoStr})` : ''}. Registered in Global Research Organization Registry (ROR).`,
            domain: dom,
            content: `${name} ${geoStr} ${(org.types || []).join(' ')}`,
            publishedAt: null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'ror_directory',
            providerDetail: dom,
            rank: idx + 1,
            rawScore: Math.max(0.60, 0.88 - idx * 0.03),
            resultType: 'web',
            category: (org.types || []).includes('government') ? 'government' : 'general',
            language: 'en',
            favicon: faviconFor(dom),
            location: loc?.lat
              ? { city: loc.name, region: loc.country_subdivision_name, country: loc.country_name, lat: loc.lat, lon: loc.lng }
              : undefined
          });
        });
      } catch {}
    })()
  );

  // Task 3: Dynamic Wikidata P856 Official Website Lookup (restores official site discovery even on non-entity topic queries)
  tasks.push(
    (async () => {
      try {
        const wdSearchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(qClean)}&language=en&limit=6&format=json`;
        const sRes = await fetchWithTimeout(wdSearchUrl, {}, Math.min(timeoutMs, 2200));
        if (!sRes.ok) return;
        const sData: any = await sRes.json();
        const ids = (sData?.search || []).map((h: any) => h.id).filter(Boolean).slice(0, 5);
        if (ids.length === 0) return;

        const entUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(ids.join('|'))}&props=claims|labels|descriptions&languages=en&format=json`;
        const eRes = await fetchWithTimeout(entUrl, {}, Math.min(timeoutMs, 2200));
        if (!eRes.ok) return;
        const eData: any = await eRes.json();

        let idx = 0;
        for (const ent of Object.values(eData?.entities || {}) as any[]) {
          const label = ent?.labels?.en?.value || '';
          const desc = ent?.descriptions?.en?.value || '';
          const p856 = ent?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
          if (typeof p856 !== 'string' || !/^https?:\/\//i.test(p856) || isBlockedHost(p856)) continue;
          const dom = domainOf(p856);
          if (dom.includes('wikipedia.org') || dom.includes('wikidata.org')) continue;
          results.push({
            id: `ext-wd-p856-${ent.id || idx}`,
            title: `${label || dom} — Official Website`,
            url: p856,
            canonicalUrl: p856,
            snippet: desc ? `${desc} (${dom}).` : `Verified official website for ${label} (${dom}).`,
            domain: dom,
            content: `${label} ${desc} official website`,
            publishedAt: null,
            indexedAt: new Date().toISOString(),
            source: 'external',
            subProvider: 'wikidata_official_links',
            providerDetail: dom,
            rank: idx + 1,
            rawScore: Math.max(0.66, 0.90 - idx * 0.03),
            resultType: 'web',
            category: 'general',
            language: 'en',
            favicon: faviconFor(dom)
          });
          idx++;
        }
      } catch {}
    })()
  );

  await Promise.allSettled(tasks);
  if (results.length > 0) {
    directoryCache.set(cacheKey, results);
  }
  metrics.directory_registries = {
    count: results.length,
    latencyMs: Math.round(performance.now() - t0),
    status: results.length > 0 ? 'ok' : 'skipped'
  };
  return { results, metrics };
}

export async function fetchWikipediaSecondary(
  query: string,
  limit = 4,
  timeoutMs = 2800
): Promise<{
  results: ProviderRawResult[];
  metrics: { count: number; latencyMs: number; status: string };
}> {
  const t0 = performance.now();
  const cappedLimit = Math.min(limit, 4);
  const cacheKey = `${query.toLowerCase()}:wiki:${cappedLimit}`;
  const cached = wikiCache.get(cacheKey);
  if (cached) {
    return { results: cached, metrics: { count: cached.length, latencyMs: 0, status: 'ok' } };
  }

  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${cappedLimit}&utf8=1`;
    const res = await fetchWithTimeout(url, {}, timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const items = (data?.query?.search || []).slice(0, cappedLimit);
    const mapped: ProviderRawResult[] = items.map((item: any, idx: number) => {
      const title = String(item.title || 'Wikipedia');
      const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
      const snippet = stripHtml(String(item.snippet || ''));
      return {
        id: `ext-wiki-${idx}-${title.slice(0, 12)}`,
        title,
        url: pageUrl,
        canonicalUrl: pageUrl,
        snippet: snippet || `Reference encyclopedia entry on ${title}.`,
        domain: 'en.wikipedia.org',
        content: snippet,
        publishedAt: item.timestamp || null,
        indexedAt: new Date().toISOString(),
        source: 'external',
        subProvider: 'wikipedia',
        providerDetail: 'Wikipedia Encyclopedia',
        rank: idx + 1,
        rawScore: Math.max(0.42, 0.72 - idx * 0.04),
        resultType: 'web' as ResultType,
        category: 'reference',
        language: 'en',
        favicon: faviconFor('en.wikipedia.org')
      };
    });
    wikiCache.set(cacheKey, mapped);
    return {
      results: mapped,
      metrics: { count: mapped.length, latencyMs: Math.round(performance.now() - t0), status: 'ok' }
    };
  } catch {
    return {
      results: [],
      metrics: { count: 0, latencyMs: Math.round(performance.now() - t0), status: 'error' }
    };
  }
}
