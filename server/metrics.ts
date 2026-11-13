import { AdminDiagnosticRecord, HybridSearchResult, ProviderStatusMetric } from './types';

interface CategoryMetric {
  searches: number;
  totalLatencyMs: number;
  avgRrfTopScoreSum: number;
  clicks: number;
}

class EvaluationTelemetryStore {
  totalSearches = 0;
  pendulumRetrievedTotal = 0;
  externalRetrievedTotal = 0;
  uniqueAfterDedupeTotal = 0;
  duplicatesRemovedTotal = 0;
  searchLatenciesMs: number[] = [];
  adminDiagnosticsHistory: AdminDiagnosticRecord[] = [];

  providerStats = {
    pendulum: { calls: 0, failures: 0, latenciesMs: [] as number[] },
    external: { calls: 0, failures: 0, latenciesMs: [] as number[] }
  };

  totalClicks = 0;
  feedback = { helpful: 0, notHelpful: 0 };
  byCategory: Record<string, CategoryMetric> = {};

  // Genuine IR Quality KPIs
  qualitySamplesCount = 0;
  wikipediaInTop10Total = 0;
  top10SlotsTotal = 0;
  officialDiscoveryAttempts = 0;
  officialDiscoveryHits = 0;
  mediaLeakCount = 0;
  uniqueDomainsTop10Sum = 0;
  topDomainsHistogram = new Map<string, number>();
  recentQueries: Array<{
    query: string;
    category: string;
    latencyMs: number;
    pendulumCount: number;
    externalCount: number;
    uniqueCount: number;
    duplicatesRemoved: number;
    timestamp: string;
  }> = [];

  recordSearch(params: {
    query: string;
    category: string;
    totalLatencyMs: number;
    pendulumMetric: ProviderStatusMetric;
    externalMetric: ProviderStatusMetric;
    uniqueCount: number;
    duplicatesRemoved: number;
    topScore: number;
    diagnosticRecord?: AdminDiagnosticRecord;
  }) {
    this.totalSearches += 1;
    this.pendulumRetrievedTotal += params.pendulumMetric.count;
    this.externalRetrievedTotal += params.externalMetric.count;
    this.uniqueAfterDedupeTotal += params.uniqueCount;
    this.duplicatesRemovedTotal += params.duplicatesRemoved;
    this.searchLatenciesMs.push(params.totalLatencyMs);
    if (this.searchLatenciesMs.length > 200) this.searchLatenciesMs.shift();

    this.recordProvider('pendulum', params.pendulumMetric);
    this.recordProvider('external', params.externalMetric);

    const cat = params.category || 'general';
    if (!this.byCategory[cat]) {
      this.byCategory[cat] = { searches: 0, totalLatencyMs: 0, avgRrfTopScoreSum: 0, clicks: 0 };
    }
    this.byCategory[cat].searches += 1;
    this.byCategory[cat].totalLatencyMs += params.totalLatencyMs;
    this.byCategory[cat].avgRrfTopScoreSum += params.topScore;

    this.recentQueries.unshift({
      query: params.query,
      category: cat,
      latencyMs: params.totalLatencyMs,
      pendulumCount: params.pendulumMetric.count,
      externalCount: params.externalMetric.count,
      uniqueCount: params.uniqueCount,
      duplicatesRemoved: params.duplicatesRemoved,
      timestamp: new Date().toISOString()
    });
    if (this.recentQueries.length > 30) this.recentQueries.pop();

    if (params.diagnosticRecord) {
      this.adminDiagnosticsHistory.unshift(params.diagnosticRecord);
      if (this.adminDiagnosticsHistory.length > 30) this.adminDiagnosticsHistory.pop();
    }
  }

  private recordProvider(key: 'pendulum' | 'external', m: ProviderStatusMetric) {
    if (m.status === 'disabled') return;
    const bucket = this.providerStats[key];
    bucket.calls += 1;
    if (m.status === 'error' || m.status === 'timeout') {
      bucket.failures += 1;
    }
    bucket.latenciesMs.push(m.latencyMs);
    if (bucket.latenciesMs.length > 200) bucket.latenciesMs.shift();
  }

  recordClick(category = 'general') {
    this.totalClicks += 1;
    if (this.byCategory[category]) {
      this.byCategory[category].clicks += 1;
    }
  }

  recordFeedback(helpful: boolean) {
    if (helpful) this.feedback.helpful += 1;
    else this.feedback.notHelpful += 1;
  }

  private avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  }

  /** Public evaluation snapshot — strips private diagnostics and internal logs */
  getSnapshot() {
    const totalRaw = this.pendulumRetrievedTotal + this.externalRetrievedTotal;
    const dupPct = totalRaw > 0 ? Math.round((this.duplicatesRemovedTotal / totalRaw) * 1000) / 10 : 0;
    const ctrPct = this.totalSearches > 0 ? Math.round((this.totalClicks / this.totalSearches) * 1000) / 10 : 0;

    return {
      totalSearches: this.totalSearches,
      pendulumRetrieved: this.pendulumRetrievedTotal,
      externalRetrieved: this.externalRetrievedTotal,
      uniqueResultsAfterDedupe: this.uniqueAfterDedupeTotal,
      duplicatesRemoved: this.duplicatesRemovedTotal,
      duplicatePercentage: dupPct,
      avgSearchLatencyMs: this.avg(this.searchLatenciesMs),
      providers: {
        pendulum: {
          calls: this.providerStats.pendulum.calls,
          avgLatencyMs: this.avg(this.providerStats.pendulum.latenciesMs),
          failureRatePct:
            this.providerStats.pendulum.calls > 0
              ? Math.round((this.providerStats.pendulum.failures / this.providerStats.pendulum.calls) * 1000) / 10
              : 0
        },
        external: {
          calls: this.providerStats.external.calls,
          avgLatencyMs: this.avg(this.providerStats.external.latenciesMs),
          failureRatePct:
            this.providerStats.external.calls > 0
              ? Math.round((this.providerStats.external.failures / this.providerStats.external.calls) * 1000) / 10
              : 0
        }
      },
      clickThroughRatePct: ctrPct,
      totalClicks: this.totalClicks,
      relevanceFeedback: {
        helpful: this.feedback.helpful,
        notHelpful: this.feedback.notHelpful,
        satisfactionPct:
          this.feedback.helpful + this.feedback.notHelpful > 0
            ? Math.round((this.feedback.helpful / (this.feedback.helpful + this.feedback.notHelpful)) * 1000) / 10
            : null
      },
      categoryPerformance: Object.entries(this.byCategory).map(([category, m]) => ({
        category,
        searches: m.searches,
        avgLatencyMs: m.searches > 0 ? Math.round((m.totalLatencyMs / m.searches) * 10) / 10 : 0,
        avgTopHybridScore: m.searches > 0 ? Math.round((m.avgRrfTopScoreSum / m.searches) * 1000) / 1000 : 0,
        clicks: m.clicks
      })),
      recentQueries: this.recentQueries.slice(0, 12)
    };
  }

  recordQualitySample(params: {
    results: HybridSearchResult[];
    isSpecificEntityQuery: boolean;
    hasOfficialHit: boolean;
    isAllNonMediaMode: boolean;
    mediaImagesCount: number;
    mediaVideosCount: number;
  }) {
    this.qualitySamplesCount += 1;
    const top10 = params.results.slice(0, 10);
    this.top10SlotsTotal += top10.length;

    let wikiCount = 0;
    const domains = new Set<string>();
    for (const r of top10) {
      const dom = (r.domain || 'unknown').toLowerCase();
      domains.add(dom);
      this.topDomainsHistogram.set(dom, (this.topDomainsHistogram.get(dom) || 0) + 1);
      if (dom.includes('wikipedia.org') || r.sourceClass === 'wikipedia') {
        wikiCount += 1;
      }
    }
    this.wikipediaInTop10Total += wikiCount;
    this.uniqueDomainsTop10Sum += domains.size;

    if (params.isSpecificEntityQuery) {
      this.officialDiscoveryAttempts += 1;
      if (params.hasOfficialHit) {
        this.officialDiscoveryHits += 1;
      }
    }

    if (params.isAllNonMediaMode && (params.mediaImagesCount > 0 || params.mediaVideosCount > 0)) {
      this.mediaLeakCount += params.mediaImagesCount + params.mediaVideosCount;
    }
  }

  getQualityDashboard(crawlerTelemetry?: any, liveFeeds?: any[]) {
    const snapshot = this.getSnapshot();
    const wikipediaTop10Pct =
      this.top10SlotsTotal > 0 ? Math.round((this.wikipediaInTop10Total / this.top10SlotsTotal) * 1000) / 10 : 0;
    const officialDiscoveryRatePct =
      this.officialDiscoveryAttempts > 0
        ? Math.round((this.officialDiscoveryHits / this.officialDiscoveryAttempts) * 1000) / 10
        : null;
    const uniqueDomainsAvg =
      this.qualitySamplesCount > 0 ? Math.round((this.uniqueDomainsTop10Sum / this.qualitySamplesCount) * 10) / 10 : 0;
    const totalSourcesRetrieved = this.pendulumRetrievedTotal + this.externalRetrievedTotal;

    return {
      ...snapshot,
      irQuality: {
        samplesEvaluated: this.qualitySamplesCount,
        wikipediaTop10Pct,
        officialDiscoveryRatePct,
        officialDiscoveryAttempts: this.officialDiscoveryAttempts,
        officialDiscoveryHits: this.officialDiscoveryHits,
        mediaLeakCount: this.mediaLeakCount,
        uniqueDomainsAvgTop10: uniqueDomainsAvg,
        pendulumSharePct:
          totalSourcesRetrieved > 0 ? Math.round((this.pendulumRetrievedTotal / totalSourcesRetrieved) * 1000) / 10 : 0,
        externalSharePct:
          totalSourcesRetrieved > 0 ? Math.round((this.externalRetrievedTotal / totalSourcesRetrieved) * 1000) / 10 : 0
      },
      topDomainsHistogram: Array.from(this.topDomainsHistogram.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([domain, count]) => ({ domain, count })),
      crawler: crawlerTelemetry || null,
      liveFeeds: liveFeeds || []
    };
  }

  getLatestAdminDiagnostics(): AdminDiagnosticRecord | null {
    return this.adminDiagnosticsHistory[0] || null;
  }

  getAdminDiagnosticsHistory(): AdminDiagnosticRecord[] {
    return this.adminDiagnosticsHistory;
  }
}

export const evaluationMetrics = new EvaluationTelemetryStore();

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  constructor(private defaultTtlMs = 60_000, private maxSize = 200) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs) {
    if (this.map.size >= this.maxSize) {
      const firstKey = this.map.keys().next().value;
      if (firstKey) this.map.delete(firstKey);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private windowMs = 60_000, private maxRequests = 90) {}

  allow(ip: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const list = (this.hits.get(ip) || []).filter((ts) => ts > cutoff);
    if (list.length >= this.maxRequests) {
      this.hits.set(ip, list);
      return { allowed: false, remaining: 0 };
    }
    list.push(now);
    this.hits.set(ip, list);
    return { allowed: true, remaining: this.maxRequests - list.length };
  }
}
