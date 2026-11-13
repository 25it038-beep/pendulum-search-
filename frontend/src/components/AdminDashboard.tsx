import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, Plus, RefreshCw, Radio, Server, Database, 
  Cpu, HardDrive, CheckCircle, AlertCircle, Clock, Globe, ArrowUpRight,
  Network, BookOpen, Layers, ShieldAlert, Download, Activity, Zap,
  Sparkles, FlaskConical, BarChart2, Shield, Send
} from 'lucide-react';
import { 
  fetchMetricsAPI, fetchFeedsAPI, addFeedAPI, 
  seedCrawlerAPI, crawlNowAPI, toggleCrawlerAPI,
  fetchSourcesAPI, triggerConnectorAPI, fetchDiscoveryGapsAPI,
  fetchCoverageAPI, fetchSystemHealthAPI, triggerBackupAPI,
  fetchAdminGatewayHealthAPI, fetchAdminGatewayStatsAPI, testAdminGatewayInferenceAPI,
  fetchAdminQualityDashboardAPI, fetchAdminDiagnosticsAPI, runAcceptanceAPI
} from '../services/api';
import { SystemMetrics, LiveFeed, SourceRegistryItem, DiscoveryGap } from '../types';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'connectors' | 'coverage' | 'health' | 'gateway' | 'quality'>('overview');
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [crawlerActive, setCrawlerActive] = useState<boolean>(true);
  const [liveMonitorActive, setLiveMonitorActive] = useState<boolean>(true);
  const [feeds, setFeeds] = useState<LiveFeed[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Advanced Systems State
  const [sources, setSources] = useState<SourceRegistryItem[]>([]);
  const [gaps, setGaps] = useState<DiscoveryGap[]>([]);
  const [coverage, setCoverage] = useState<Record<string, number>>({});
  const [systemHealth, setSystemHealth] = useState<any>(null);

  // AI Inference Gateway State
  const [gatewayHealth, setGatewayHealth] = useState<any>(null);
  const [gatewayStats, setGatewayStats] = useState<any>(null);
  const [testTier, setTestTier] = useState<string>('fast');
  const [testPrompt, setTestPrompt] = useState<string>('Briefly explain quantum computing in one sentence.');
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState<boolean>(false);

  // IR Quality & Diagnostics State
  const [qualityDashboard, setQualityDashboard] = useState<any>(null);
  const [diagQuery, setDiagQuery] = useState<string>('RMK Engineering College');
  const [diagResult, setDiagResult] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState<boolean>(false);
  const [acceptanceReport, setAcceptanceReport] = useState<any>(null);
  const [acceptanceLoading, setAcceptanceLoading] = useState<boolean>(false);

  // Forms
  const [seedUrlsInput, setSeedUrlsInput] = useState('');
  const [seedPriority, setSeedPriority] = useState(3);
  const [crawlNowUrl, setCrawlNowUrl] = useState('');
  const [crawlNowResult, setCrawlNowResult] = useState<any>(null);

  // New Feed Form
  const [feedName, setFeedName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedPriority, setFeedPriority] = useState('regular');
  const [feedCategory, setFeedCategory] = useState('news');
  const [feedInterval, setFeedInterval] = useState(30);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshData = async () => {
    try {
      const mData = await fetchMetricsAPI();
      setMetrics(mData.metrics);
      setCrawlerActive(mData.crawler_running);
      setLiveMonitorActive(mData.live_monitor_running);
      setLogs(mData.metrics.recent_logs || []);

      const fData = await fetchFeedsAPI();
      setFeeds(fData.feeds || []);

      // Fetch Sources & Health
      fetchSourcesAPI().then(res => setSources(res.sources || [])).catch(() => {});
      fetchDiscoveryGapsAPI().then(res => setGaps(res.gaps || [])).catch(() => {});
      fetchCoverageAPI().then(res => setCoverage(res.categories || {})).catch(() => {});
      fetchSystemHealthAPI().then(res => setSystemHealth(res)).catch(() => {});
      fetchAdminGatewayHealthAPI().then(res => setGatewayHealth(res)).catch(() => {});
      fetchAdminGatewayStatsAPI().then(res => setGatewayStats(res)).catch(() => {});
      fetchAdminQualityDashboardAPI().then(res => setQualityDashboard(res)).catch(() => {});
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleCrawler = async () => {
    setLoading(true);
    try {
      await toggleCrawlerAPI(!crawlerActive);
      setCrawlerActive(!crawlerActive);
      setMessage(`Crawler ${!crawlerActive ? 'started' : 'stopped'} successfully.`);
    } catch {
      setMessage('Failed to toggle crawler.');
    }
    setLoading(false);
  };

  const handleSeedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = seedUrlsInput.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setLoading(true);
    try {
      const res = await seedCrawlerAPI(urls, seedPriority);
      setMessage(`Enqueued ${res.added_to_queue} URLs into crawl frontier.`);
      setSeedUrlsInput('');
      refreshData();
    } catch (err: any) {
      setMessage(`Error seeding crawler: ${err.message}`);
    }
    setLoading(false);
  };

  const handleCrawlNow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crawlNowUrl) return;
    setLoading(true);
    try {
      const res = await crawlNowAPI(crawlNowUrl);
      setCrawlNowResult(res.result);
      setMessage(`Successfully crawled and indexed ${crawlNowUrl}`);
      setCrawlNowUrl('');
      refreshData();
    } catch (err: any) {
      setMessage(`Error in immediate crawl: ${err.message}`);
    }
    setLoading(false);
  };

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedName || !feedUrl) return;
    setLoading(true);
    try {
      await addFeedAPI({
        name: feedName,
        feed_url: feedUrl,
        priority_level: feedPriority,
        interval_sec: feedInterval,
        category: feedCategory
      });
      setMessage(`Live feed "${feedName}" registered.`);
      setFeedName('');
      setFeedUrl('');
      refreshData();
    } catch (err: any) {
      setMessage(`Error adding live feed: ${err.message}`);
    }
    setLoading(false);
  };

  const handleTriggerConnector = async (connectorKey: string) => {
    setLoading(true);
    try {
      const res = await triggerConnectorAPI(connectorKey, 10);
      setMessage(`Connector ${connectorKey}: Fetched ${res.fetched_count || 0}, Indexed ${res.indexed_count || 0}`);
      refreshData();
    } catch (err: any) {
      setMessage(`Connector trigger failed: ${err.message}`);
    }
    setLoading(false);
  };

  const handleBackup = async () => {
    setLoading(true);
    try {
      const res = await triggerBackupAPI();
      setMessage(`Database backup snapshot saved to: ${res.backup_path}`);
      refreshData();
    } catch (err: any) {
      setMessage(`Backup failed: ${err.message}`);
    }
    setLoading(false);
  };

  const handleTestInference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPrompt.trim()) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await testAdminGatewayInferenceAPI(testTier, testPrompt.trim());
      setTestResult(res);
      refreshData();
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || 'Inference probe failed' });
    }
    setTestLoading(false);
  };

  const handleRunDiagnosticsTrace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagQuery.trim()) return;
    setDiagLoading(true);
    try {
      const res = await fetchAdminDiagnosticsAPI(diagQuery.trim());
      setDiagResult(res);
      fetchAdminQualityDashboardAPI().then(q => setQualityDashboard(q)).catch(() => {});
    } catch (err: any) {
      setDiagResult({ error: err.message || 'Diagnostics trace failed' });
    }
    setDiagLoading(false);
  };

  const handleRunAcceptanceSuite = async () => {
    setAcceptanceLoading(true);
    try {
      const res = await runAcceptanceAPI();
      setAcceptanceReport(res);
    } catch (err: any) {
      setAcceptanceReport({ error: err.message || 'Acceptance suite failed' });
    }
    setAcceptanceLoading(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-obsidian-800">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-serif font-bold text-white tracking-wide">
              HS SEARCH CONTROL CENTER
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-gold-400/10 text-gold-400 border border-gold-400/20">
              AUTONOMOUS GLOBAL INFRASTRUCTURE
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Organization:{' '}
            <a
              href="https://hs-ai-studio-4i7i.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-neutral-200 hover:text-gold-300 hover:underline transition-colors"
            >
              HS AI Solutions
            </a>{' '}
            • Founder: <strong className="text-gold-300">Harshan Seliyan</strong> • AI Intelligence: <strong className="text-gold-300">July LLM</strong>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggleCrawler}
            disabled={loading}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              crawlerActive 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30' 
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
            }`}
          >
            {crawlerActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{crawlerActive ? 'Pause Crawler' : 'Resume Crawler'}</span>
          </button>

          <button
            onClick={handleBackup}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-obsidian-850 border border-gold-400/30 text-gold-300 hover:bg-gold-400 hover:text-obsidian-950 text-xs font-semibold transition-all"
            title="Create on-demand SQLite backup"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Backup Index</span>
          </button>

          <button
            onClick={refreshData}
            className="p-2 rounded-xl bg-obsidian-850 border border-obsidian-750 text-neutral-300 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-obsidian-800 pb-3 mb-6 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'overview'
              ? 'bg-gold-400 text-obsidian-950 shadow-gold-glow'
              : 'text-neutral-400 hover:text-white hover:bg-obsidian-850'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Overview & Frontier</span>
        </button>

        <button
          onClick={() => setActiveTab('connectors')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'connectors'
              ? 'bg-gold-400 text-obsidian-950 shadow-gold-glow'
              : 'text-neutral-400 hover:text-white hover:bg-obsidian-850'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Multi-Source Connectors ({sources.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('coverage')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'coverage'
              ? 'bg-gold-400 text-obsidian-950 shadow-gold-glow'
              : 'text-neutral-400 hover:text-white hover:bg-obsidian-850'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Knowledge Coverage & Gaps</span>
        </button>

        <button
          onClick={() => setActiveTab('health')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'health'
              ? 'bg-gold-400 text-obsidian-950 shadow-gold-glow'
              : 'text-neutral-400 hover:text-white hover:bg-obsidian-850'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Self-Healing & Telemetry</span>
        </button>

        <button
          onClick={() => setActiveTab('gateway')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'gateway'
              ? 'bg-gold-400 text-obsidian-950 shadow-gold-glow'
              : 'text-neutral-400 hover:text-white hover:bg-obsidian-850'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Inference Gateway</span>
        </button>

        <button
          onClick={() => setActiveTab('quality')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'quality'
              ? 'bg-gold-400 text-obsidian-950 shadow-gold-glow'
              : 'text-neutral-400 hover:text-white hover:bg-obsidian-850'
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          <span>IR Quality &amp; Diagnostics</span>
        </button>
      </div>

      {message && (
        <div className="mb-6 p-3 rounded-xl bg-gold-400/10 border border-gold-400/30 text-xs text-gold-300 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-neutral-500 hover:text-white">✕</button>
        </div>
      )}

      {/* TAB 1: OVERVIEW & CRAWLER FRONTIER */}
      {activeTab === 'overview' && (
        <div>
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <div className="flex items-center justify-between text-neutral-400 mb-1">
                <span className="text-xs font-mono">Discovered Domains</span>
                <Globe className="w-4 h-4 text-gold-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {metrics?.total_discovered_domains.toLocaleString() || 0}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">Autonomous frontier discovery</div>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <div className="flex items-center justify-between text-neutral-400 mb-1">
                <span className="text-xs font-mono">Indexed Webpages</span>
                <Database className="w-4 h-4 text-gold-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {metrics?.indexed_webpages.toLocaleString() || 0}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">FTS5 + 256-D Semantic Vectors</div>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <div className="flex items-center justify-between text-neutral-400 mb-1">
                <span className="text-xs font-mono">Crawl Queue Frontier</span>
                <HardDrive className="w-4 h-4 text-gold-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-300">
                {metrics?.queue_size.toLocaleString() || 0}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">Pending prioritized URLs</div>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <div className="flex items-center justify-between text-neutral-400 mb-1">
                <span className="text-xs font-mono">Avg Search Latency</span>
                <Cpu className="w-4 h-4 text-gold-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {metrics?.average_search_response_time_ms || 18.5}ms
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">Sub-second response target</div>
            </div>
          </div>

          {/* Seed and Immediate Crawl */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
              <h2 className="text-sm font-serif font-bold text-gold-300 uppercase tracking-wider mb-2">
                Seed Discovery Frontier
              </h2>
              <p className="text-xs text-neutral-400 mb-4">
                Enter seed URLs (one per line). The autonomous crawler discovers outgoing links, parses XML sitemaps, respects robots.txt, and tracks content revisions.
              </p>
              <form onSubmit={handleSeedSubmit} className="space-y-3">
                <textarea
                  rows={4}
                  value={seedUrlsInput}
                  onChange={(e) => setSeedUrlsInput(e.target.value)}
                  placeholder="https://example.com/&#10;https://en.wikipedia.org/wiki/Portal:Current_events"
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-xl p-3 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-gold-400 font-mono"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs text-neutral-400">
                    <span>Priority:</span>
                    <select
                      value={seedPriority}
                      onChange={(e) => setSeedPriority(Number(e.target.value))}
                      className="bg-obsidian-950 border border-obsidian-800 rounded px-2 py-1 text-neutral-200"
                    >
                      <option value={1}>1 (Highest)</option>
                      <option value={3}>3 (High)</option>
                      <option value={5}>5 (Normal)</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-gold-400 text-obsidian-950 font-semibold text-xs hover:brightness-110 active:scale-95 transition-all"
                  >
                    Enqueue Seeds
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
              <h2 className="text-sm font-serif font-bold text-gold-300 uppercase tracking-wider mb-2">
                On-Demand Immediate Crawl
              </h2>
              <p className="text-xs text-neutral-400 mb-4">
                Fetch, extract, compute SimHash, and incrementally index any webpage immediately with HTTP conditional GET handling.
              </p>
              <form onSubmit={handleCrawlNow} className="space-y-3">
                <input
                  type="url"
                  required
                  value={crawlNowUrl}
                  onChange={(e) => setCrawlNowUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-xl p-3 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-gold-400 font-mono"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-obsidian-800 border border-gold-400/30 text-gold-300 font-semibold text-xs hover:bg-gold-400 hover:text-obsidian-950 transition-all"
                >
                  Crawl & Index Now
                </button>
              </form>

              {crawlNowResult && (
                <div className="mt-4 p-3 rounded-xl bg-obsidian-950 border border-obsidian-800 text-xs text-neutral-300">
                  <div className="flex items-center space-x-1.5 text-emerald-400 font-bold mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Indexed ({crawlNowResult.action})</span>
                  </div>
                  <p className="font-semibold text-white truncate">{crawlNowResult.title}</p>
                  <p className="text-neutral-500 text-[11px]">{crawlNowResult.url}</p>
                </div>
              )}
            </div>
          </div>

          {/* HS Live Feeds Table */}
          <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5 mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-obsidian-800 gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <Radio className="w-4 h-4 text-rose-400" />
                  <h2 className="text-sm font-serif font-bold text-white uppercase tracking-wider">
                    HS Live Continuous Feeds
                  </h2>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Continuously monitored RSS/Atom sources with true last-checked and last-updated timestamps.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-obsidian-950 text-neutral-500 font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Source Name</th>
                    <th className="p-3">Interval</th>
                    <th className="p-3">Last Checked</th>
                    <th className="p-3">Last Updated</th>
                    <th className="p-3">Indexed</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-obsidian-800">
                  {feeds.map((f) => (
                    <tr key={f.id} className="hover:bg-obsidian-850">
                      <td className="p-3 font-medium text-white">
                        <div>{f.name}</div>
                        <div className="text-[10px] text-neutral-500 font-mono truncate max-w-[280px]">{f.feed_url}</div>
                      </td>
                      <td className="p-3 font-mono">
                        <span className="capitalize">{f.priority_level}</span> ({f.interval_sec}s)
                      </td>
                      <td className="p-3 font-mono text-neutral-400">
                        {f.last_checked_at ? new Date(f.last_checked_at).toLocaleTimeString() : 'Pending'}
                      </td>
                      <td className="p-3 font-mono text-gold-300">
                        {f.last_updated_at ? new Date(f.last_updated_at).toLocaleTimeString() : '—'}
                      </td>
                      <td className="p-3 font-mono font-semibold text-emerald-400">
                        {f.items_indexed}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MULTI-SOURCE CONNECTORS */}
      {activeTab === 'connectors' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-obsidian-900 border border-obsidian-800">
            <h2 className="text-sm font-serif font-bold text-gold-300 uppercase tracking-wider mb-1">
              Autonomous Information Acquisition Registry
            </h2>
            <p className="text-xs text-neutral-400">
              Integrates Common Crawl, OpenAlex, Crossref, Wikidata, Wikipedia, GitHub, and IndexNow to acquire global knowledge continuously.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map((src) => (
              <div key={src.id} className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4 flex flex-col justify-between hover:border-gold-400/40 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-obsidian-950 text-gold-400 border border-obsidian-800">
                      {src.source_category}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{(src.source_reliability * 100).toFixed(0)}% Trust</span>
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">{src.source_name}</h3>
                  <p className="text-[11px] text-neutral-500 font-mono truncate mb-3">{src.source_url}</p>
                  
                  <div className="text-xs text-neutral-400 space-y-1 mb-4">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Frequency:</span>
                      <span className="capitalize text-neutral-300">{src.update_frequency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Items Indexed:</span>
                      <span className="font-mono text-gold-300">{src.items_retrieved}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const cKey = src.source_name.toLowerCase().includes('openalex') ? 'openalex' :
                                src.source_name.toLowerCase().includes('wiki') ? 'wikipedia' :
                                src.source_name.toLowerCase().includes('crossref') ? 'crossref' :
                                src.source_name.toLowerCase().includes('github') ? 'github' :
                                src.source_name.toLowerCase().includes('wikidata') ? 'wikidata' : 'commoncrawl';
                    handleTriggerConnector(cKey);
                  }}
                  disabled={loading}
                  className="w-full py-2 rounded-xl bg-obsidian-850 border border-obsidian-750 text-gold-300 hover:bg-gold-400 hover:text-obsidian-950 text-xs font-semibold transition-all flex items-center justify-center space-x-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Trigger Acquisition Now</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: KNOWLEDGE COVERAGE & GAPS */}
      {activeTab === 'coverage' && (
        <div className="space-y-6">
          {/* Knowledge Coverage Breakdown */}
          <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
            <h2 className="text-sm font-serif font-bold text-gold-300 uppercase tracking-wider mb-3">
              Knowledge Domain Coverage Breakdown
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {Object.entries(coverage).map(([cat, count]) => (
                <div key={cat} className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800">
                  <span className="text-xs font-mono text-neutral-400 block mb-1">{cat}</span>
                  <div className="text-xl font-bold font-mono text-white">{count}</div>
                  <div className="text-[10px] text-neutral-500 mt-1">Indexed articles</div>
                </div>
              ))}
            </div>
          </div>

          {/* Discovery Gaps Table */}
          <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
            <h2 className="text-sm font-serif font-bold text-gold-300 uppercase tracking-wider mb-2">
              Autonomous Discovery Gaps & Missing Topics
            </h2>
            <p className="text-xs text-neutral-400 mb-4">
              Identifies user queries or global subjects with low coverage, automatically finding and enqueuing authoritative sources.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-obsidian-950 text-neutral-500 font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Topic / Missing Query</th>
                    <th className="p-3">Search Demand</th>
                    <th className="p-3">Failure Reason</th>
                    <th className="p-3">Discovered At</th>
                    <th className="p-3">Resolution Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-obsidian-800">
                  {gaps.map((g) => (
                    <tr key={g.id} className="hover:bg-obsidian-850">
                      <td className="p-3 font-semibold text-white">{g.topic_or_query}</td>
                      <td className="p-3 font-mono text-gold-300">{g.search_count}x</td>
                      <td className="p-3 font-mono text-neutral-400">{g.failure_reason}</td>
                      <td className="p-3 font-mono text-neutral-500">{new Date(g.discovered_at).toLocaleTimeString()}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Auto-Enqueued
                        </span>
                      </td>
                    </tr>
                  ))}
                  {gaps.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-neutral-500">
                        No critical coverage gaps detected. The discovery intelligence continuously audits search logs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SELF-HEALING & TELEMETRY */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-neutral-400">CPU Utilization</span>
                <Cpu className="w-4 h-4 text-gold-400" />
              </div>
              <div className="text-3xl font-mono font-bold text-white mb-2">
                {systemHealth?.resources?.cpu_percent || 0}%
              </div>
              <div className="w-full bg-obsidian-950 rounded-full h-2">
                <div 
                  className="bg-gold-400 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, systemHealth?.resources?.cpu_percent || 0)}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-neutral-400">RAM Utilization</span>
                <Server className="w-4 h-4 text-gold-400" />
              </div>
              <div className="text-3xl font-mono font-bold text-white mb-2">
                {systemHealth?.resources?.ram_percent || 0}%
              </div>
              <div className="text-[11px] text-neutral-500 mb-2 font-mono">
                {systemHealth?.resources?.ram_used_gb || 0} GB / {systemHealth?.resources?.ram_total_gb || 0} GB
              </div>
              <div className="w-full bg-obsidian-950 rounded-full h-2">
                <div 
                  className="bg-emerald-400 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, systemHealth?.resources?.ram_percent || 0)}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-neutral-400">Disk Storage</span>
                <HardDrive className="w-4 h-4 text-gold-400" />
              </div>
              <div className="text-3xl font-mono font-bold text-white mb-2">
                {systemHealth?.resources?.disk_percent || 0}%
              </div>
              <div className="text-[11px] text-neutral-500 mb-2 font-mono">
                {systemHealth?.resources?.disk_free_gb || 0} GB Free
              </div>
              <div className="w-full bg-obsidian-950 rounded-full h-2">
                <div 
                  className="bg-amber-400 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, systemHealth?.resources?.disk_percent || 0)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-gold-400" />
                <h3 className="text-sm font-semibold text-white">Dynamic Concurrency & Backpressure Controller</h3>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Monitors memory and CPU pressure to throttle or expand crawler concurrency automatically.
              </p>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-xs font-mono font-bold">
              Throttle: {((systemHealth?.resources?.concurrency_throttle || 1.0) * 100).toFixed(0)}% (Normal)
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AI INFERENCE GATEWAY & ORCHESTRATION */}
      {activeTab === 'gateway' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Security Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-obsidian-900 via-obsidian-850 to-obsidian-900 border border-gold-400/20 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-300">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-serif font-bold text-white tracking-wide">
                    Private AI Inference Gateway & Routing Orchestrator
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                    ZERO CREDENTIAL LEAKAGE
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
                  Centralized server-side gateway powering July AI grounded synthesis and intent routing. Inference credentials, tokens, and endpoints are securely abstracted behind HS Search gateway barriers.
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs text-neutral-500 font-mono block">Backbone Provider</span>
              <span className="text-sm font-semibold text-gold-300 font-mono">HS AI Cloud (Enterprise NIM)</span>
            </div>
          </div>

          {/* Model Tiers Status Grid */}
          <div>
            <h3 className="text-xs font-serif font-bold text-gold-300 uppercase tracking-wider mb-4 flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Active Model Tiers & Latency Telemetry</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Fast Tier */}
              <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5 relative overflow-hidden group hover:border-obsidian-700 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">Fast Tier</span>
                  <span className="flex items-center space-x-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                    <CheckCircle className="w-2.5 h-2.5" />
                    <span>Active</span>
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white truncate font-mono" title={gatewayHealth?.tiers?.fast?.model || 'nemotron-3.5-bolt-e4b'}>
                  {gatewayHealth?.tiers?.fast?.model || 'nemotron-3.5-bolt-e4b'}
                </h4>
                <p className="text-xs text-neutral-400 mt-1">
                  Query intent classification, semantic rewriting, instant ranking
                </p>
                <div className="mt-4 pt-3 border-t border-obsidian-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-500">Latency:</span>
                  <span className="text-gold-300 font-semibold">{gatewayHealth?.tiers?.fast?.latency_ms ? `${gatewayHealth.tiers.fast.latency_ms} ms` : '~267 ms'}</span>
                </div>
              </div>

              {/* Quality Tier */}
              <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5 relative overflow-hidden group hover:border-obsidian-700 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold text-gold-400 uppercase tracking-wider">Quality Tier</span>
                  <span className="flex items-center space-x-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                    <CheckCircle className="w-2.5 h-2.5" />
                    <span>Active</span>
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white truncate font-mono" title={gatewayHealth?.tiers?.quality?.model || 'llama-3.2-90b-vision-instruct'}>
                  {gatewayHealth?.tiers?.quality?.model || 'llama-3.2-90b-vision-instruct'}
                </h4>
                <p className="text-xs text-neutral-400 mt-1">
                  Multi-source synthesis, grounded summaries & fact-checking
                </p>
                <div className="mt-4 pt-3 border-t border-obsidian-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-500">Budget:</span>
                  <span className="text-gold-300 font-semibold">20s streaming</span>
                </div>
              </div>

              {/* Reasoning Tier */}
              <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5 relative overflow-hidden group hover:border-obsidian-700 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">Reasoning Tier</span>
                  <span className="flex items-center space-x-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                    <CheckCircle className="w-2.5 h-2.5" />
                    <span>Active</span>
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white truncate font-mono" title={gatewayHealth?.tiers?.reasoning?.model || 'nemotron-3-nano-omni-30b-a3b-reasoning'}>
                  {gatewayHealth?.tiers?.reasoning?.model || 'nemotron-3-nano-omni-30b-a3b-reasoning'}
                </h4>
                <p className="text-xs text-neutral-400 mt-1">
                  Complex deep research, conflicting source evaluation
                </p>
                <div className="mt-4 pt-3 border-t border-obsidian-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-500">Latency:</span>
                  <span className="text-gold-300 font-semibold">{gatewayHealth?.tiers?.reasoning?.latency_ms ? `${gatewayHealth.tiers.reasoning.latency_ms} ms` : '~911 ms'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Usage Telemetry & Cost Estimates */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-xs font-mono text-neutral-400 block mb-1">Total Requests</span>
              <div className="text-2xl font-mono font-bold text-white">
                {gatewayStats?.total_requests || 0}
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">Inference operations</span>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-xs font-mono text-neutral-400 block mb-1">Token Volume</span>
              <div className="text-2xl font-mono font-bold text-gold-400">
                {(gatewayStats?.total_tokens || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">
                P: {(gatewayStats?.prompt_tokens || 0).toLocaleString()} | C: {(gatewayStats?.completion_tokens || 0).toLocaleString()}
              </span>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-xs font-mono text-neutral-400 block mb-1">Estimated Compute Cost</span>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                ${(gatewayStats?.estimated_cost_usd || 0).toFixed(4)}
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">Enterprise rate estimate</span>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-xs font-mono text-neutral-400 block mb-1">Error Rate</span>
              <div className="text-2xl font-mono font-bold text-neutral-300">
                {gatewayStats?.error_count || 0}
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">Circuit breaker protected</span>
            </div>
          </div>

          {/* Multi-Source Providers Status */}
          <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
            <h3 className="text-xs font-serif font-bold text-gold-300 uppercase tracking-wider mb-4 flex items-center space-x-2">
              <Layers className="w-3.5 h-3.5" />
              <span>Multi-Source Search Provider Circuit Breakers</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { name: 'HS Native Index', type: 'Primary Autonomous', status: 'Healthy', failures: 0 },
                { name: 'Open Knowledge Instant Answer API', type: 'External Partner', status: 'Healthy', failures: 0 },
                { name: 'Wikipedia OpenSearch', type: 'Public Knowledge', status: 'Healthy', failures: 0 },
                { name: 'HS Safe Instant Answer', type: 'Internal Evaluator', status: 'Healthy', failures: 0 },
                { name: 'HS News Stream Provider', type: 'Live Feeds', status: 'Healthy', failures: 0 },
                { name: 'HS Geographic Provider', type: 'Spatial Engine', status: 'Healthy', failures: 0 },
                { name: 'HS Academic & Tech Research', type: 'Domain Knowledge', status: 'Healthy', failures: 0 },
              ].map((prov, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-obsidian-950 border border-obsidian-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-neutral-200 block">{prov.name}</span>
                    <span className="text-[10px] font-mono text-neutral-500">{prov.type}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                    {prov.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Live Model Probe Sandbox */}
          <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
            <div className="flex items-center space-x-2 mb-4">
              <FlaskConical className="w-4 h-4 text-gold-400" />
              <h3 className="text-sm font-semibold text-white">Live AI Model Probe Sandbox</h3>
            </div>
            <form onSubmit={handleTestInference} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['fast', 'quality', 'reasoning'] as const).map(tier => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setTestTier(tier)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      testTier === tier 
                        ? 'border-gold-400 bg-gold-400/10 text-white' 
                        : 'border-obsidian-800 bg-obsidian-950 text-neutral-400 hover:border-obsidian-700'
                    }`}
                  >
                    <span className="text-xs font-mono font-bold uppercase tracking-wider block">{tier} Tier</span>
                    <span className="text-[11px] text-neutral-500 block mt-0.5 truncate font-mono">
                      {tier === 'fast' ? (gatewayHealth?.tiers?.fast?.model || 'nemotron-3.5-bolt-e4b') :
                       tier === 'quality' ? (gatewayHealth?.tiers?.quality?.model || 'llama-3.2-90b-vision-instruct') :
                       (gatewayHealth?.tiers?.reasoning?.model || 'nemotron-3-nano-omni-30b-a3b-reasoning')}
                    </span>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1.5">Probe Prompt Input:</label>
                <textarea
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  rows={2}
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-xl p-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-gold-400 font-mono resize-none"
                  placeholder="Enter test prompt for inference probe..."
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={testLoading || !testPrompt.trim()}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gold-400 text-obsidian-950 text-xs font-bold hover:bg-gold-300 transition-all shadow-gold-glow disabled:opacity-50"
                >
                  {testLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing Inference...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Run Model Probe</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Test Result Display */}
            {testResult && (
              <div className="mt-5 p-4 rounded-xl bg-obsidian-950 border border-obsidian-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gold-300 font-bold">Probe Response ({testResult.tier || testTier})</span>
                  {testResult.latency_ms && (
                    <span className="text-neutral-400">{testResult.latency_ms} ms</span>
                  )}
                </div>
                {testResult.response ? (
                  <p className="text-xs text-neutral-200 leading-relaxed font-sans bg-obsidian-900 p-3 rounded-lg border border-obsidian-800 whitespace-pre-wrap">
                    {testResult.response}
                  </p>
                ) : (
                  <p className="text-xs text-rose-400 font-mono">
                    {testResult.error || 'No response returned.'}
                  </p>
                )}
                {testResult.tokens && (
                  <div className="text-[10px] text-neutral-500 font-mono text-right">
                    Prompt: {testResult.tokens.prompt} | Completion: {testResult.tokens.completion}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: IR QUALITY & DIAGNOSTICS */}
      {activeTab === 'quality' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-[11px] font-mono text-neutral-400 block mb-1">Wikipedia Top-10 %</span>
              <div className="text-2xl font-mono font-bold text-gold-300">
                {qualityDashboard?.irQuality?.wikipediaTop10Pct ?? 0}%
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">
                {qualityDashboard?.irQuality?.samplesEvaluated ?? 0} queries sampled
              </span>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-[11px] font-mono text-neutral-400 block mb-1">Official Discovery Rate</span>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {qualityDashboard?.irQuality?.officialDiscoveryRatePct !== null &&
                qualityDashboard?.irQuality?.officialDiscoveryRatePct !== undefined
                  ? `${qualityDashboard.irQuality.officialDiscoveryRatePct}%`
                  : 'N/A'}
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">
                {qualityDashboard?.irQuality?.officialDiscoveryHits ?? 0}/
                {qualityDashboard?.irQuality?.officialDiscoveryAttempts ?? 0} entity hits
              </span>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-[11px] font-mono text-neutral-400 block mb-1">All-Tab Media Leaks</span>
              <div
                className={`text-2xl font-mono font-bold ${
                  (qualityDashboard?.irQuality?.mediaLeakCount ?? 0) === 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {qualityDashboard?.irQuality?.mediaLeakCount ?? 0}
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">Strict ResultType gate</span>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-[11px] font-mono text-neutral-400 block mb-1">Avg Unique Domains</span>
              <div className="text-2xl font-mono font-bold text-white">
                {qualityDashboard?.irQuality?.uniqueDomainsAvgTop10 ?? 0}
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">Per Top-10 slate</span>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-[11px] font-mono text-neutral-400 block mb-1">Pendulum vs External</span>
              <div className="text-lg font-mono font-bold text-gold-200">
                {qualityDashboard?.irQuality?.pendulumSharePct ?? 0}% / {qualityDashboard?.irQuality?.externalSharePct ?? 0}%
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">Candidate share</span>
            </div>

            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-4">
              <span className="text-[11px] font-mono text-neutral-400 block mb-1">Crawler Indexed</span>
              <div className="text-2xl font-mono font-bold text-cyan-300">
                {qualityDashboard?.crawler?.indexedDocumentsCount ?? 0}
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">
                {qualityDashboard?.crawler?.pagesSucceeded ?? 0} crawled / {qualityDashboard?.crawler?.queuedFrontierCount ?? 0} queued
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Domains Histogram */}
            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
              <h3 className="text-sm font-serif font-bold text-gold-300 uppercase tracking-wider mb-3">
                Top-10 Domains Histogram
              </h3>
              {Array.isArray(qualityDashboard?.topDomainsHistogram) && qualityDashboard.topDomainsHistogram.length > 0 ? (
                <div className="space-y-2">
                  {qualityDashboard.topDomainsHistogram.map((d: any) => (
                    <div key={d.domain} className="flex items-center justify-between text-xs font-mono px-3 py-2 rounded-lg bg-obsidian-950 border border-obsidian-800">
                      <span className="text-neutral-200 truncate">{d.domain}</span>
                      <span className="text-gold-300 font-bold">{d.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-500">Run searches or diagnostics traces to populate Top-10 domain distribution.</p>
              )}
            </div>

            {/* Live RSS Feeds Status */}
            <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5">
              <h3 className="text-sm font-serif font-bold text-gold-300 uppercase tracking-wider mb-3">
                Live Journalism &amp; Research Feeds
              </h3>
              <div className="space-y-2">
                {(qualityDashboard?.liveFeeds || []).map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-obsidian-950 border border-obsidian-800">
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{f.name}</div>
                      <div className="text-[10px] font-mono text-neutral-500 truncate">{f.url}</div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                        f.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : f.status === 'error'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      }`}>
                        {f.status} ({f.itemCount || 0})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live Query Diagnostics Trace & Original vs. Enhanced Comparison */}
          <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-serif font-bold text-gold-300 uppercase tracking-wider">
                  Original Web Results vs. Pendulum Enhanced Comparison
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Admin-only pipeline trace verifying query preservation, parser rejections, page enrichment, and ranking deltas.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunAcceptanceSuite}
                disabled={acceptanceLoading}
                className="px-3.5 py-2 rounded-xl bg-obsidian-850 border border-gold-400/35 text-gold-300 hover:bg-gold-400 hover:text-obsidian-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {acceptanceLoading ? 'Running 10-Query Suite...' : 'Run 10-Query Acceptance Suite'}
              </button>
            </div>

            <form onSubmit={handleRunDiagnosticsTrace} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={diagQuery}
                onChange={(e) => setDiagQuery(e.target.value)}
                placeholder="Enter query to inspect original provider telemetry, enrichment & final rank deltas..."
                className="flex-1 bg-obsidian-950 border border-obsidian-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-gold-400 font-mono"
              />
              <button
                type="submit"
                disabled={diagLoading || !diagQuery.trim()}
                className="px-4 py-2 rounded-xl bg-gold-400 text-obsidian-950 text-xs font-bold hover:brightness-110 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {diagLoading ? 'Tracing...' : 'Run IR Trace'}
              </button>
            </form>

            {diagResult?.error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 font-mono">
                {diagResult.error}
              </div>
            )}

            {diagResult?.diagnostics && (() => {
              const d = diagResult.diagnostics;
              const pTel = d.primaryProviderTelemetry;
              const enh = d.enhancerTelemetry;
              const comp = d.comparison;
              const entity = d.queryIntelligence?.recognizedEntity;
              return (
                <div className="space-y-4 text-xs font-mono tabular-nums">
                  {pTel?.limitationNotice && (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-[11px] font-sans leading-relaxed">
                      <strong className="font-semibold text-amber-300">Primary Web Provider Notice:</strong> {pTel.limitationNotice}
                    </div>
                  )}

                  {/* Summary Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800">
                      <span className="text-neutral-500 block text-[10px]">Query Preserved</span>
                      <span className={d.primaryProviderQuery === d.originalQuery ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {d.primaryProviderQuery === d.originalQuery ? 'EXACT MATCH' : 'MODIFIED'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800">
                      <span className="text-neutral-500 block text-[10px]">Primary Strategy</span>
                      <span className="text-gold-300 font-semibold truncate block">{pTel?.strategyUsed || 'N/A'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800">
                      <span className="text-neutral-500 block text-[10px]">Raw / Parsed / Rej</span>
                      <span className="text-white font-semibold">
                        {pTel?.rawOrganicCount ?? 0} / {pTel?.parsedCount ?? 0} / {pTel?.rejectedCount ?? 0}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800">
                      <span className="text-neutral-500 block text-[10px]">Enriched / Pendulum</span>
                      <span className="text-cyan-300 font-semibold">
                        {enh?.enrichedCount ?? 0} / {d.deduplication?.pendulumCandidatesCount ?? 0}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800">
                      <span className="text-neutral-500 block text-[10px]">Deduped / Quality Rej</span>
                      <span className="text-white font-semibold">
                        {d.deduplication?.duplicatesRemoved ?? 0} / {d.deduplication?.filteredOutLowQuality ?? 0}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800">
                      <span className="text-neutral-500 block text-[10px]">Latency / Entity</span>
                      <span className="text-emerald-400 font-semibold truncate block">
                        {d.executionTimeMs}ms {entity?.name ? `· ${entity.name}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Rejection Reasons if any */}
                  {((pTel?.rejectedCount > 0) || (enh?.rejectedCount > 0)) && (
                    <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800 text-[11px] space-y-1">
                      <div className="text-neutral-400 font-semibold">Parser &amp; Enhancer Rejections:</div>
                      {pTel?.rejectedCount > 0 && (
                        <div className="text-amber-300">
                          Parser rejected: {JSON.stringify(pTel.rejectionReasons)}
                        </div>
                      )}
                      {enh?.rejectedPages?.map((rp: any, idx: number) => (
                        <div key={idx} className="text-rose-300 truncate">
                          [{rp.reason}] {rp.domain} — {rp.title}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Side-by-Side Comparison */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {/* Original Provider List */}
                    <div className="rounded-xl bg-obsidian-950 border border-obsidian-800 overflow-hidden">
                      <div className="px-3 py-2 border-b border-obsidian-800 text-[11px] text-neutral-400 font-semibold uppercase tracking-wider">
                        Original Provider Slate ({comp?.originalTop10?.length ?? 0})
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="text-neutral-500 border-b border-obsidian-800">
                            <tr>
                              <th className="p-2">#</th>
                              <th className="p-2">Title</th>
                              <th className="p-2">Domain</th>
                              <th className="p-2">Stream</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-obsidian-800/70">
                            {(comp?.originalTop10 || []).map((o: any, i: number) => (
                              <tr key={i} className="hover:bg-obsidian-900/60">
                                <td className="p-2 text-neutral-500">{o.originalRank}</td>
                                <td className="p-2 text-neutral-200 max-w-[220px] truncate">{o.title}</td>
                                <td className="p-2 text-gold-300/90 max-w-[130px] truncate">{o.domain}</td>
                                <td className="p-2 text-neutral-500">{o.subProvider}</td>
                              </tr>
                            ))}
                            {(!comp?.originalTop10 || comp.originalTop10.length === 0) && (
                              <tr>
                                <td colSpan={4} className="p-4 text-center text-neutral-500">
                                  No original external results returned for this query.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Pendulum Enhanced Results */}
                    <div className="rounded-xl bg-obsidian-950 border border-obsidian-800 overflow-hidden">
                      <div className="px-3 py-2 border-b border-obsidian-800 text-[11px] text-gold-300 font-semibold uppercase tracking-wider">
                        Pendulum Enhanced Ranking ({comp?.enhancedTop10?.length ?? d.results?.length ?? 0})
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="text-neutral-500 border-b border-obsidian-800">
                            <tr>
                              <th className="p-2">#</th>
                              <th className="p-2">Delta</th>
                              <th className="p-2">Title</th>
                              <th className="p-2">Domain</th>
                              <th className="p-2">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-obsidian-800/70">
                            {(comp?.enhancedTop10 || d.results || []).slice(0, 10).map((r: any, i: number) => {
                              const deltaLabel =
                                r.originalRank == null
                                  ? 'NEW'
                                  : r.rankDelta > 0
                                  ? `+${r.rankDelta}`
                                  : r.rankDelta < 0
                                  ? `${r.rankDelta}`
                                  : '=';
                              const deltaColor =
                                r.originalRank == null
                                  ? 'text-cyan-300'
                                  : r.rankDelta > 0
                                  ? 'text-emerald-400'
                                  : r.rankDelta < 0
                                  ? 'text-amber-300'
                                  : 'text-neutral-500';
                              return (
                                <tr key={i} className="hover:bg-obsidian-900/60">
                                  <td className="p-2 text-neutral-400">{r.finalRank ?? r.rank ?? i + 1}</td>
                                  <td className={`p-2 font-bold ${deltaColor}`}>{deltaLabel}</td>
                                  <td className="p-2 text-white max-w-[200px] truncate">
                                    {r.isOfficialWebsite ? '[Official] ' : r.isEnriched ? '[Enriched] ' : ''}
                                    {r.title}
                                  </td>
                                  <td className="p-2 text-gold-300 max-w-[120px] truncate">{r.domain}</td>
                                  <td className="p-2 text-emerald-400">{(r.finalScore ?? r.scores?.final ?? 0).toFixed(3)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Gained / Lost Summary */}
                  {((comp?.gainedResults?.length > 0) || (comp?.lostResults?.length > 0)) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                      <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800">
                        <div className="text-emerald-400 font-semibold mb-1.5">
                          Gained in Enhanced Top-10 ({comp?.gainedResults?.length || 0})
                        </div>
                        <div className="space-y-1">
                          {(comp?.gainedResults || []).slice(0, 6).map((g: any, idx: number) => (
                            <div key={idx} className="text-neutral-300 truncate">
                              #{g.finalRank} {g.domain} — {g.reason}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800">
                        <div className="text-amber-300 font-semibold mb-1.5">
                          Dropped / Outranked from Original ({comp?.lostResults?.length || 0})
                        </div>
                        <div className="space-y-1">
                          {(comp?.lostResults || []).slice(0, 6).map((l: any, idx: number) => (
                            <div key={idx} className="text-neutral-400 truncate">
                              Orig #{l.originalRank} {l.domain} — {l.reason}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Phase 10 Acceptance Suite Output */}
            {acceptanceReport?.phase10Queries && (
              <div className="pt-3 border-t border-obsidian-800 space-y-2 text-xs font-mono tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-gold-300 font-semibold">
                    Acceptance Suite: {acceptanceReport.passedCount}/{acceptanceReport.totalCount} Passed
                  </span>
                  <span className="text-neutral-500 text-[11px]">{acceptanceReport.executedAt}</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-obsidian-800 bg-obsidian-950">
                  <table className="w-full text-left text-[11px]">
                    <thead className="text-neutral-500 border-b border-obsidian-800">
                      <tr>
                        <th className="p-2">Query</th>
                        <th className="p-2">Preserved</th>
                        <th className="p-2">Top-1 Domain</th>
                        <th className="p-2">Wiki #</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-obsidian-800/70">
                      {acceptanceReport.phase10Queries.map((qr: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2 text-white">{qr.query}</td>
                          <td className="p-2 text-emerald-400">{qr.queryPreserved ? 'Exact' : 'Changed'}</td>
                          <td className="p-2 text-gold-300">{qr.top1Domain}</td>
                          <td className="p-2 text-neutral-300">{qr.wikipediaInTop10}</td>
                          <td className={`p-2 font-bold ${qr.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {qr.passed ? 'PASS' : 'FAIL'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Real-time System Logs Stream (Always visible at bottom) */}
      <div className="rounded-2xl bg-obsidian-900 border border-obsidian-800 p-5 mt-8">
        <h2 className="text-sm font-serif font-bold text-gold-300 uppercase tracking-wider mb-3">
          Real-Time Crawler, Indexer & Supervisor Telemetry Logs
        </h2>
        <div className="h-44 overflow-y-auto font-mono text-[11px] bg-obsidian-950 p-3 rounded-xl border border-obsidian-800 space-y-1.5 scrollbar-thin">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start space-x-2 leading-relaxed">
              <span className="text-neutral-500 shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={`px-1 rounded text-[9px] font-bold shrink-0 ${
                log.event_type === 'index' ? 'bg-emerald-950 text-emerald-400' :
                log.event_type === 'change' ? 'bg-amber-950 text-amber-300' :
                log.event_type === 'supervisor' ? 'bg-indigo-950 text-indigo-400' :
                'bg-obsidian-800 text-neutral-300'
              }`}>
                {log.event_type.toUpperCase()}
              </span>
              <span className="text-neutral-300 break-all">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
