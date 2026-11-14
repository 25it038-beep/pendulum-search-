import { fetchWithTimeout, isBlockedHost, stripHtml } from '../providers/duckduckgoProvider';
import { pendulumDocs, NativeIndexedDoc } from '../providers/pendulumProvider';
import { parseRobotsTxt, isPathAllowedByRobots, extractRegistrableHost } from '../entity/officialDiscovery';
import { registerCorpusVocabulary } from '../query/intelligence';
import type { RssFeedItem } from '../providers/webProviders';

export interface CrawlQueueEntry {
  url: string;
  domain: string;
  priority: number;
  category: string;
  status: 'queued' | 'crawling' | 'indexed' | 'skipped' | 'error';
  addedAt: string;
  crawledAt?: string;
  httpStatus?: number;
  error?: string;
  title?: string;
}

const STARTUP_FRONTIER_SEEDS: Array<{ url: string; category: string; priority: number }> = [
  { url: 'https://hs-ai-studio-4i7i.vercel.app/', category: 'tech', priority: 10 },
  { url: 'https://hs-ai-studio-4i7i.vercel.app/products/pendulum', category: 'tech', priority: 10 },
  { url: 'https://hs-ai-studio-4i7i.vercel.app/products/july-llm', category: 'tech', priority: 10 },
  { url: 'https://hs-ai-studio-4i7i.vercel.app/products/gravity-llm', category: 'tech', priority: 10 },
  { url: 'https://react.dev/', category: 'tech', priority: 10 },
  { url: 'https://docs.python.org/3/', category: 'tech', priority: 10 },
  { url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', category: 'tech', priority: 9 },
  { url: 'https://developers.google.com/search/docs/fundamentals/how-search-works', category: 'tech', priority: 9 },
  { url: 'https://arxiv.org/list/cs.AI/recent', category: 'academic', priority: 9 },
  { url: 'https://developer.nvidia.com/rtx', category: 'tech', priority: 9 },
  { url: 'https://scholarships.gov.in/', category: 'government', priority: 10 },
  { url: 'https://www.education.gov.in/scholarships-education-loan-0', category: 'government', priority: 9 },
  { url: 'https://www.nirfindia.org/', category: 'academic', priority: 9 },
  { url: 'https://www.aicte-india.org/', category: 'government', priority: 8 },
  { url: 'https://www.annauniv.edu/', category: 'academic', priority: 8 },
  { url: 'https://www.iitm.ac.in/', category: 'academic', priority: 8 },
  { url: 'https://www.tn.gov.in/scheme', category: 'government', priority: 8 }
];

const robotsPolicyCache = new Map<string, { disallow: string[]; fetchedAt: number }>();
const domainLastCrawlMs = new Map<string, number>();
const crawlQueue = new Map<string, CrawlQueueEntry>();

let crawlerEnabled = true;
let liveCrawlerActive = false;
let warmupStarted = false;
let crawlerDocSeq = 1000;

const telemetry = {
  startedAt: new Date().toISOString(),
  pagesAttempted: 0,
  pagesSucceeded: 0,
  pagesFailed: 0,
  robotsBlocked: 0,
  bytesDownloaded: 0,
  recentLatencyMs: [] as number[],
  crawlLog: [] as Array<{ timestamp: string; url: string; domain: string; status: string; latencyMs: number; title?: string; error?: string }>
};

function recordCrawlEvent(event: { url: string; domain: string; status: string; latencyMs: number; title?: string; error?: string }) {
  telemetry.crawlLog.unshift({ timestamp: new Date().toISOString(), ...event });
  if (telemetry.crawlLog.length > 50) telemetry.crawlLog.pop();
}

function normalizeUrlKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    u.hash = '';
    return u.toString().replace(/\/+$/, '') || u.toString();
  } catch {
    return rawUrl.trim();
  }
}

export async function checkRobotsAllowed(targetUrl: string): Promise<boolean> {
  try {
    const u = new URL(targetUrl);
    const origin = u.origin;
    const cached = robotsPolicyCache.get(origin);
    if (cached && Date.now() - cached.fetchedAt < 30 * 60_000) {
      return isPathAllowedByRobots(u.pathname, cached.disallow);
    }

    const res = await fetchWithTimeout(`${origin}/robots.txt`, { headers: { Accept: 'text/plain' } }, 1800);
    if (res.ok) {
      const txt = await res.text();
      const policy = parseRobotsTxt(txt);
      robotsPolicyCache.set(origin, { disallow: policy.disallow, fetchedAt: Date.now() });
      return isPathAllowedByRobots(u.pathname, policy.disallow);
    }
    robotsPolicyCache.set(origin, { disallow: [], fetchedAt: Date.now() });
    return true;
  } catch {
    return true;
  }
}

export function enqueueFrontierUrls(urls: Array<{ url: string; category?: string; priority?: number }>) {
  const added: string[] = [];
  for (const item of urls) {
    if (!item.url || isBlockedHost(item.url)) continue;
    const key = normalizeUrlKey(item.url);
    if (crawlQueue.has(key)) continue;
    const dom = extractRegistrableHost(item.url);
    crawlQueue.set(key, {
      url: item.url.trim(),
      domain: dom,
      priority: item.priority ?? 5,
      category: item.category || 'general',
      status: 'queued',
      addedAt: new Date().toISOString()
    });
    added.push(item.url.trim());
  }
  return added;
}

export async function crawlUrlAndRecord(
  targetUrl: string,
  options: { category?: string; respectPolitenessDelay?: boolean; timeoutMs?: number } = {}
): Promise<{ action: 'inserted' | 'updated' | 'skipped'; url: string; title: string; doc_id?: number; reason?: string }> {
  if (isBlockedHost(targetUrl)) {
    throw new Error('Blocked or invalid URL scheme/host (SSRF protection).');
  }

  const dom = extractRegistrableHost(targetUrl);
  const key = normalizeUrlKey(targetUrl);
  const t0 = performance.now();
  telemetry.pagesAttempted++;

  const queueEntry = crawlQueue.get(key) || {
    url: targetUrl,
    domain: dom,
    priority: 7,
    category: options.category || 'general',
    status: 'crawling' as const,
    addedAt: new Date().toISOString()
  };
  queueEntry.status = 'crawling';
  crawlQueue.set(key, queueEntry);

  // Robots.txt check
  const allowed = await checkRobotsAllowed(targetUrl);
  if (!allowed) {
    telemetry.robotsBlocked++;
    queueEntry.status = 'skipped';
    queueEntry.error = 'Disallowed by robots.txt';
    queueEntry.crawledAt = new Date().toISOString();
    crawlQueue.set(key, queueEntry);
    recordCrawlEvent({ url: targetUrl, domain: dom, status: 'robots_blocked', latencyMs: Math.round(performance.now() - t0) });
    return { action: 'skipped', url: targetUrl, title: dom, reason: 'robots.txt disallow' };
  }

  // Polite per-domain delay (1.5s) during background crawling
  if (options.respectPolitenessDelay) {
    const prevMs = domainLastCrawlMs.get(dom) || 0;
    const waitMs = 1500 - (Date.now() - prevMs);
    if (waitMs > 0 && waitMs <= 1500) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  domainLastCrawlMs.set(dom, Date.now());

  try {
    const res = await fetchWithTimeout(
      targetUrl,
      { headers: { Accept: 'text/html,application/xhtml+xml' } },
      options.timeoutMs || 4500
    );
    queueEntry.httpStatus = res.status;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    telemetry.bytesDownloaded += Buffer.byteLength(html, 'utf8');

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]).slice(0, 140) : dom;
    const metaMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const pubMatch =
      html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i);

    const headings: string[] = [];
    for (const hm of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
      const hText = stripHtml(hm[1]).slice(0, 120);
      if (hText && headings.length < 15) headings.push(hText);
    }

    const bodyText = stripHtml(
      html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    ).slice(0, 8000);
    const snippet = metaMatch ? stripHtml(metaMatch[1]).slice(0, 320) : bodyText.slice(0, 320);

    // Enqueue clean same-origin / authoritative outbound documentation links up to cap
    if (crawlQueue.size < 250) {
      for (const am of html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"'#]+)["']/gi)) {
        const href = am[1];
        if (!isBlockedHost(href) && !/\.(pdf|jpg|png|gif|svg|css|js|zip|mp4)$/i.test(href)) {
          const hrefDom = extractRegistrableHost(href);
          if (hrefDom === dom) {
            enqueueFrontierUrls([{ url: href, category: options.category || 'general', priority: 4 }]);
            if (crawlQueue.size >= 250) break;
          }
        }
      }
    }

    const crawledAt = new Date().toISOString();
    const latencyMs = Math.round(performance.now() - t0);
    telemetry.pagesSucceeded++;
    telemetry.recentLatencyMs.push(latencyMs);
    if (telemetry.recentLatencyMs.length > 100) telemetry.recentLatencyMs.shift();

    registerCorpusVocabulary([title, snippet, headings.join(' '), bodyText.slice(0, 2000)]);

    const finalUrl = res.url && !isBlockedHost(res.url) ? res.url : targetUrl;
    const existing = pendulumDocs.find(
      (d) => normalizeUrlKey(d.url) === normalizeUrlKey(finalUrl) || normalizeUrlKey(d.url) === key
    );

    if (existing) {
      existing.title = title || existing.title;
      existing.headings = headings.length > 0 ? headings : existing.headings;
      existing.snippet = snippet || existing.snippet;
      if (bodyText.length > 80) existing.content_text = bodyText;
      existing.crawled_at = crawledAt;
      existing.indexed_at = crawledAt;
      existing.is_live = true;
      if (pubMatch?.[1]) existing.published_at = pubMatch[1];

      queueEntry.status = 'indexed';
      queueEntry.title = existing.title;
      queueEntry.crawledAt = crawledAt;
      crawlQueue.set(key, queueEntry);
      recordCrawlEvent({ url: finalUrl, domain: dom, status: 'updated', latencyMs, title: existing.title });
      return { action: 'updated', url: finalUrl, title: existing.title, doc_id: existing.id };
    }

    const docId = ++crawlerDocSeq;
    const newDoc: NativeIndexedDoc = {
      id: docId,
      url: finalUrl,
      domain: dom,
      title: title || dom,
      headings,
      snippet: snippet || `Crawled document from ${dom}.`,
      content_text: bodyText || snippet || title,
      published_at: pubMatch?.[1] || null,
      indexed_at: crawledAt,
      crawled_at: crawledAt,
      category: options.category || 'general',
      language: 'en',
      source_type: 'hs_indexed',
      source_provider: 'HS Autonomous Crawler',
      source_category: 'hs_indexed',
      original_publisher: dom,
      source_attribution: 'Pendulum Indexed',
      credibility_score: /\.(gov|gov\.in|nic\.in|edu|ac\.in)$/i.test(dom) ? 0.94 : 0.88,
      is_live: true,
      images: [],
      videos: []
    };
    pendulumDocs.unshift(newDoc);

    queueEntry.status = 'indexed';
    queueEntry.title = newDoc.title;
    queueEntry.crawledAt = crawledAt;
    crawlQueue.set(key, queueEntry);
    recordCrawlEvent({ url: finalUrl, domain: dom, status: 'inserted', latencyMs, title: newDoc.title });
    return { action: 'inserted', url: finalUrl, title: newDoc.title, doc_id: docId };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - t0);
    telemetry.pagesFailed++;
    queueEntry.status = 'error';
    queueEntry.error = err?.message || 'crawl error';
    queueEntry.crawledAt = new Date().toISOString();
    crawlQueue.set(key, queueEntry);
    recordCrawlEvent({ url: targetUrl, domain: dom, status: 'error', latencyMs, error: queueEntry.error });
    throw err;
  }
}

export function ingestRssArticleAsCrawledDoc(article: RssFeedItem): boolean {
  if (!article.url || isBlockedHost(article.url)) return false;
  const key = normalizeUrlKey(article.url);
  if (pendulumDocs.some((d) => normalizeUrlKey(d.url) === key)) {
    return false;
  }
  const now = new Date().toISOString();
  const docId = ++crawlerDocSeq;
  pendulumDocs.unshift({
    id: docId,
    url: article.url,
    domain: article.domain,
    title: article.title,
    headings: [article.publisher, article.category],
    snippet: article.snippet,
    content_text: article.content,
    published_at: article.publishedAt,
    indexed_at: now,
    crawled_at: now,
    category: article.category || 'news',
    language: 'en',
    source_type: 'hs_indexed',
    source_provider: 'Pendulum Live Feed Crawler',
    source_category: 'hs_indexed',
    original_publisher: article.publisher,
    source_attribution: 'Pendulum Indexed',
    credibility_score: 0.91,
    is_live: true,
    images: [],
    videos: []
  });
  registerCorpusVocabulary([article.title, article.snippet]);
  return true;
}

export function startBackgroundWarmup() {
  if (warmupStarted || !crawlerEnabled) return;
  warmupStarted = true;
  enqueueFrontierUrls(STARTUP_FRONTIER_SEEDS);

  // Run polite background crawl batch without blocking HTTP startup
  (async () => {
    liveCrawlerActive = true;
    try {
      const batch = STARTUP_FRONTIER_SEEDS.slice(0, 8);
      await Promise.allSettled(
        batch.map((seed) =>
          crawlUrlAndRecord(seed.url, {
            category: seed.category,
            respectPolitenessDelay: false,
            timeoutMs: 3600
          }).catch(() => null)
        )
      );
    } finally {
      liveCrawlerActive = false;
    }
  })();
}

export async function runCrawlBatch(maxUrls = 5): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (!crawlerEnabled) return { processed: 0, succeeded: 0, failed: 0 };
  liveCrawlerActive = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const pending = Array.from(crawlQueue.values())
      .filter((q) => q.status === 'queued')
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxUrls);

    for (const entry of pending) {
      if (!crawlerEnabled) break;
      processed++;
      try {
        const res = await crawlUrlAndRecord(entry.url, {
          category: entry.category,
          respectPolitenessDelay: true,
          timeoutMs: 3600
        });
        if (res.action !== 'skipped') succeeded++;
      } catch {
        failed++;
      }
    }
  } finally {
    liveCrawlerActive = false;
  }

  return { processed, succeeded, failed };
}

export function toggleCrawler(enabled?: boolean): boolean {
  crawlerEnabled = typeof enabled === 'boolean' ? enabled : !crawlerEnabled;
  return crawlerEnabled;
}

export function isCrawlerEnabled(): boolean {
  return crawlerEnabled;
}

export function getCrawlQueueSnapshot() {
  return Array.from(crawlQueue.values()).slice(0, 60);
}

export function getCrawlerTelemetry() {
  const avgLatencyMs =
    telemetry.recentLatencyMs.length > 0
      ? Math.round((telemetry.recentLatencyMs.reduce((a, b) => a + b, 0) / telemetry.recentLatencyMs.length) * 10) / 10
      : 0;
  const elapsedSec = Math.max(1, (Date.now() - Date.parse(telemetry.startedAt)) / 1000);
  const actualPagesPerMin = Math.round((telemetry.pagesSucceeded / (elapsedSec / 60)) * 10) / 10;

  const domainCounts = new Map<string, number>();
  for (const d of pendulumDocs) {
    domainCounts.set(d.domain, (domainCounts.get(d.domain) || 0) + 1);
  }

  const queuedCount = Array.from(crawlQueue.values()).filter((q) => q.status === 'queued').length;

  return {
    crawlerEnabled,
    liveCrawlerActive,
    startedAt: telemetry.startedAt,
    indexedDocumentsCount: pendulumDocs.length,
    uniqueDomainsCount: domainCounts.size,
    pagesAttempted: telemetry.pagesAttempted,
    pagesSucceeded: telemetry.pagesSucceeded,
    pagesFailed: telemetry.pagesFailed,
    robotsBlocked: telemetry.robotsBlocked,
    bytesDownloaded: telemetry.bytesDownloaded,
    avgCrawlLatencyMs: avgLatencyMs,
    actualPagesPerMin,
    queuedFrontierCount: queuedCount,
    recentLogs: telemetry.crawlLog.slice(0, 20),
    topIndexedDomains: Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([domain, count]) => ({ domain, count }))
  };
}
