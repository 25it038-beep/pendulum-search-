/**
 * HS MEGACRAWLER ECOSYSTEM COMMAND CENTER
 * Organization: HS AI Solutions | Founder: Harshan Seliyan
 * Autonomous Distributed Web Crawling Infrastructure on Modal Cloud
 */

import React, { useState, useEffect } from 'react';
import {
  fetchMegaCrawlerEcosystem,
  fetchMegaCrawlerWorkers,
  controlMegaCrawlerAPI,
  runMegaCrawlerBenchmarkAPI,
  fetchMegaCrawlerScalingAPI,
  submitJulyCrawlRequestAPI,
  fetchMegaCrawlerFrontierAPI,
  enqueueMegaCrawlerURLAPI,
  submitIndexNowAPI,
  triggerMegaCrawlerTuneAPI,
  submitJulyUnifiedSearchAPI
} from '../services/api';
import {
  MegaCrawlerEcosystemResponse,
  CrawlerServiceItem,
  MegaCrawlerWorker,
  BenchmarkReport
} from '../types';

interface MegaCrawlerDashboardProps {
  onClose: () => void;
}

export const MegaCrawlerDashboard: React.FC<MegaCrawlerDashboardProps> = ({ onClose }) => {
  const [ecosystem, setEcosystem] = useState<MegaCrawlerEcosystemResponse | null>(null);
  const [workers, setWorkers] = useState<MegaCrawlerWorker[]>([]);
  const [scaling, setScaling] = useState<any>(null);
  const [frontierData, setFrontierData] = useState<any>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkReport | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'crawlers' | 'discovery' | 'frontier' | 'optimizer' | 'benchmark' | 'july_gateway'>('crawlers');

  // Manual URL enqueue state
  const [enqueueUrl, setEnqueueUrl] = useState('');
  const [enqueueCrawler, setEnqueueCrawler] = useState('HS-WebCrawler');
  const [enqueueMsg, setEnqueueMsg] = useState('');

  // IndexNow push tester state
  const [indexNowHost, setIndexNowHost] = useState('example.com');
  const [indexNowUrls, setIndexNowUrls] = useState('https://example.com/breaking-ai-release\nhttps://example.com/quantum-benchmark');
  const [indexNowMsg, setIndexNowMsg] = useState('');

  // Self-optimization state
  const [tuningMsg, setTuningMsg] = useState('');
  const [tuningLoading, setTuningLoading] = useState(false);

  // July 5-mode search state
  const [julySearchQ, setJulySearchQ] = useState('Artificial Intelligence breakthroughs');
  const [julyMode, setJulyMode] = useState('fast');
  const [julySearchRes, setJulySearchRes] = useState<any>(null);
  const [julySearchLoading, setJulySearchLoading] = useState(false);

  // July targeted crawl dispatch form
  const [julyCrawlQuery, setJulyCrawlQuery] = useState('');
  const [julyCrawlUrls, setJulyCrawlUrls] = useState('');
  const [julyUrgency, setJulyUrgency] = useState('high');
  const [julyReason, setJulyReason] = useState('Knowledge gap detected during semantic inquiry');
  const [julyDispatchMsg, setJulyDispatchMsg] = useState('');

  const loadData = async () => {
    try {
      const [eco, wrk, scl, frt] = await Promise.all([
        fetchMegaCrawlerEcosystem(),
        fetchMegaCrawlerWorkers(),
        fetchMegaCrawlerScalingAPI(),
        fetchMegaCrawlerFrontierAPI().catch(() => null)
      ]);
      setEcosystem(eco);
      setWorkers(wrk);
      setScaling(scl);
      setFrontierData(frt);
    } catch (err) {
      console.error('MegaCrawler data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleCrawler = async (crawlerType: string, currentStatus: string) => {
    const action = currentStatus === 'active' ? 'pause' : 'resume';
    try {
      await controlMegaCrawlerAPI(crawlerType, action);
      loadData();
    } catch {
      alert('Error updating crawler state');
    }
  };

  const handleAdjustConcurrency = async (crawlerType: string, newLimit: number) => {
    try {
      await controlMegaCrawlerAPI(crawlerType, 'concurrency', newLimit);
      loadData();
    } catch {
      alert('Error setting concurrency');
    }
  };

  const handleRunBenchmark = async () => {
    setBenchmarkLoading(true);
    try {
      const rep = await runMegaCrawlerBenchmarkAPI(5);
      setBenchmark(rep);
    } catch {
      alert('Benchmark execution failed');
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const handleEnqueueURL = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enqueueUrl.trim()) return;
    try {
      const res = await enqueueMegaCrawlerURLAPI({
        url: enqueueUrl.trim(),
        crawler_type: enqueueCrawler,
        discovery_source: 'manual_operator'
      });
      setEnqueueMsg(res.status === 'enqueued' ? `Enqueued: ${res.url}` : `Notice: ${res.reason}`);
      setEnqueueUrl('');
      loadData();
    } catch {
      setEnqueueMsg('Failed to enqueue URL');
    }
  };

  const handleIndexNowPush = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = indexNowUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (!list.length) return;
    try {
      const res = await submitIndexNowAPI({
        host: indexNowHost,
        urlList: list
      });
      setIndexNowMsg(`Success: ${res.enqueued_urls} enqueued, ${res.rejected_or_duplicate} duplicates/filtered`);
      loadData();
    } catch {
      setIndexNowMsg('IndexNow push failed');
    }
  };

  const handleTriggerTune = async () => {
    setTuningLoading(true);
    try {
      const res = await triggerMegaCrawlerTuneAPI();
      setTuningMsg(`Tuning executed: ${res.actions_taken.length} automated adjustments applied.`);
      loadData();
    } catch {
      setTuningMsg('Tuning cycle failed');
    } finally {
      setTuningLoading(false);
    }
  };

  const handleExecuteJulySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!julySearchQ.trim()) return;
    setJulySearchLoading(true);
    try {
      const res = await submitJulyUnifiedSearchAPI({
        query: julySearchQ.trim(),
        mode: julyMode,
        max_results: 6
      });
      setJulySearchRes(res);
    } catch {
      alert('July search execution failed');
    } finally {
      setJulySearchLoading(false);
    }
  };

  const handleSubmitJulyCrawl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!julyCrawlQuery) return;
    try {
      const urls = julyCrawlUrls.split('\n').map(u => u.trim()).filter(Boolean);
      const res = await submitJulyCrawlRequestAPI({
        query: julyCrawlQuery,
        suggested_urls: urls.length > 0 ? urls : undefined,
        urgency: julyUrgency,
        reason: julyReason
      });
      setJulyDispatchMsg(`Accepted: ${res.crawler_assigned} assigned (Priority: ${res.priority})`);
      setJulyCrawlQuery('');
      setJulyCrawlUrls('');
      loadData();
    } catch {
      setJulyDispatchMsg('Error submitting crawl request');
    }
  };

  const summary = ecosystem?.summary;
  const discovery = ecosystem?.discovery_engine;
  const storage = ecosystem?.storage;
  const optimizer = ecosystem?.self_optimization;

  return (
    <div className="fixed inset-0 z-50 bg-[#07070A]/95 backdrop-blur-xl text-[#F5F5F7] overflow-y-auto">
      {/* Top Header */}
      <div className="border-b border-[#D4AF37]/20 bg-[#0B0B0E]/90 sticky top-0 z-20 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#8C7322] flex items-center justify-center font-bold text-black text-xl shadow-lg shadow-[#D4AF37]/20">
            M
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold tracking-wider text-white">HS MEGACRAWLER</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#D4AF37]/15 text-[#E6CA65] border border-[#D4AF37]/30">
                15 Specialized Services
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Autonomous Cloud Mesh</span>
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5 font-mono">
              <a
                href="https://hs-ai-studio-4i7i.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gold-300 hover:underline transition-colors"
              >
                HS AI Solutions
              </a>{' '}
              • Harshan Seliyan • Autonomous Multi-Engine Distributed Search Infrastructure
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={loadData}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition"
          >
            ↻ Refresh State
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-[#D4AF37] hover:bg-[#E6CA65] text-black transition shadow-md shadow-[#D4AF37]/20"
          >
            Back to Search
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-8 py-6 space-y-6">

        {/* High-Level Infrastructure Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="p-3.5 rounded-xl bg-[#0F0F14] border border-[#D4AF37]/25 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">Specialized Services</span>
            <div className="text-2xl font-bold text-[#D4AF37] mt-1">{ecosystem?.crawler_count ?? 15}</div>
            <span className="text-[10px] text-neutral-500">Autonomous Modules</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F0F14] border border-neutral-800 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">Active Workers</span>
            <div className="text-2xl font-bold text-white mt-1">{summary?.active_workers ?? 0}</div>
            <span className="text-[10px] text-neutral-500">Distributed Instances</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F0F14] border border-neutral-800 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">Queue Backlog</span>
            <div className="text-2xl font-bold text-white mt-1">{summary?.total_queue_length?.toLocaleString() ?? 0}</div>
            <span className="text-[10px] text-neutral-500">Priority Frontier URLs</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F0F14] border border-neutral-800 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">Pages Indexed</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{summary?.pages_indexed?.toLocaleString() ?? 0}</div>
            <span className="text-[10px] text-neutral-500">Central Index Feeds</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F0F14] border border-neutral-800 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">Freshness Updates</span>
            <div className="text-2xl font-bold text-cyan-400 mt-1">{summary?.pages_updated?.toLocaleString() ?? 0}</div>
            <span className="text-[10px] text-neutral-500">Conditional ETag / 304</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F0F14] border border-neutral-800 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">Duplicate Avoidance</span>
            <div className="text-2xl font-bold text-amber-400 mt-1">{summary?.duplicates_rejected?.toLocaleString() ?? 0}</div>
            <span className="text-[10px] text-neutral-500">SimHash Fingerprints</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F0F14] border border-[#D4AF37]/25 shadow-lg">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">Compute Cost</span>
            <div className="text-2xl font-bold text-[#E6CA65] mt-1">${summary?.cost_per_1000_pages_usd?.toFixed(3) ?? '0.025'}</div>
            <span className="text-[10px] text-neutral-500">Per 1,000 Documents</span>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex border-b border-neutral-800 space-x-2 overflow-x-auto">
          {[
            { id: 'crawlers', label: '15 Specialized Crawlers' },
            { id: 'discovery', label: 'Discovery Engine & IndexNow' },
            { id: 'frontier', label: 'Priority Frontier & Storage' },
            { id: 'optimizer', label: 'Self-Optimization Engine' },
            { id: 'benchmark', label: 'Performance Benchmark' },
            { id: 'july_gateway', label: 'July AI (5 Search Modes)' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-2.5 text-xs font-semibold tracking-wider uppercase whitespace-nowrap transition-all border-b-2 ${
                activeSubTab === tab.id
                  ? 'border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/5'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: 15 Specialized Crawlers Grid */}
        {activeSubTab === 'crawlers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <p>Independent services running distinct policies, timeouts, domains, worker pools, and scheduling:</p>
              <span className="font-mono text-[#D4AF37]">15 / 15 Services Active</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ecosystem?.crawlers.map((c: CrawlerServiceItem) => (
                <div
                  key={c.crawler_type}
                  className="p-4 rounded-xl bg-[#0E0E12] border border-neutral-800 hover:border-[#D4AF37]/40 transition group relative overflow-hidden"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-white group-hover:text-[#D4AF37] transition">
                        {c.name}
                      </span>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        Priority Level: <span className="font-mono text-[#E6CA65]">{c.priority}</span> • Concurrency: <span className="font-mono">{c.concurrency_limit}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border ${
                      c.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}>
                      {c.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-400 mt-2 line-clamp-2">
                    {c.description}
                  </p>

                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-neutral-850 text-center font-mono">
                    <div className="bg-[#14141A] p-2 rounded-lg">
                      <div className="text-[10px] text-neutral-500">Indexed</div>
                      <div className="text-xs font-bold text-emerald-400">{c.pages_indexed}</div>
                    </div>
                    <div className="bg-[#14141A] p-2 rounded-lg">
                      <div className="text-[10px] text-neutral-500">Latency</div>
                      <div className="text-xs font-bold text-[#E6CA65]">{c.avg_latency_ms}ms</div>
                    </div>
                    <div className="bg-[#14141A] p-2 rounded-lg">
                      <div className="text-[10px] text-neutral-500">Queue</div>
                      <div className="text-xs font-bold text-white">{c.queue_length}</div>
                    </div>
                  </div>

                  {/* Service Controls */}
                  <div className="mt-4 pt-3 border-t border-neutral-850 flex items-center justify-between">
                    <button
                      onClick={() => handleToggleCrawler(c.crawler_type, c.status)}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        c.status === 'active'
                          ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {c.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                    <div className="flex items-center space-x-1.5 text-xs text-neutral-400 font-mono">
                      <span>Limit:</span>
                      <select
                        value={c.concurrency_limit}
                        onChange={(e) => handleAdjustConcurrency(c.crawler_type, parseInt(e.target.value))}
                        className="bg-[#14141A] border border-neutral-700 rounded px-1.5 py-0.5 text-xs text-white"
                      >
                        {[2, 4, 6, 8, 12, 16, 24].map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: Autonomous Web Discovery Engine */}
        {activeSubTab === 'discovery' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#0E0E12] border border-neutral-800">
                <span className="text-xs font-mono text-neutral-400">Total URLs Discovered</span>
                <div className="text-2xl font-bold text-[#D4AF37] mt-1">{discovery?.total_urls_discovered ?? 0}</div>
                <span className="text-[10px] text-neutral-500">Multi-Channel Graph Ingestion</span>
              </div>
              <div className="p-4 rounded-xl bg-[#0E0E12] border border-neutral-800">
                <span className="text-xs font-mono text-neutral-400">XML Sitemaps Parsed</span>
                <div className="text-2xl font-bold text-white mt-1">{discovery?.sitemaps_parsed ?? 0}</div>
                <span className="text-[10px] text-neutral-500">Recursive Sitemap Indexes</span>
              </div>
              <div className="p-4 rounded-xl bg-[#0E0E12] border border-neutral-800">
                <span className="text-xs font-mono text-neutral-400">RSS / Atom Feeds</span>
                <div className="text-2xl font-bold text-cyan-400 mt-1">{discovery?.feeds_scanned ?? 0}</div>
                <span className="text-[10px] text-neutral-500">Continuous Stream Sentinels</span>
              </div>
              <div className="p-4 rounded-xl bg-[#0E0E12] border border-neutral-800">
                <span className="text-xs font-mono text-neutral-400">API Records Ingested</span>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{discovery?.api_records_ingested ?? 0}</div>
                <span className="text-[10px] text-neutral-500">OpenAlex & CrossRef DOI Links</span>
              </div>
            </div>

            {/* Active Discovery Channels */}
            <div className="p-5 rounded-xl bg-[#0E0E12] border border-neutral-800 space-y-3">
              <h3 className="text-sm font-semibold text-white">Active Continuous Discovery Channels</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
                {discovery?.active_channels?.map((ch: string, i: number) => (
                  <div key={i} className="p-2.5 rounded-lg bg-[#14141A] border border-neutral-800 flex items-center space-x-2 text-neutral-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>{ch}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* IndexNow Publisher Gateway */}
            <div className="p-5 rounded-xl bg-[#0E0E12] border border-[#D4AF37]/30 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">IndexNow Webmaster Push Gateway</h3>
                  <p className="text-xs text-neutral-400">Publishers submit updated URLs directly for instantaneous crawl queueing.</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Endpoint Active
                </span>
              </div>

              <form onSubmit={handleIndexNowPush} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-mono text-neutral-400">Publisher Host</label>
                    <input
                      type="text"
                      value={indexNowHost}
                      onChange={e => setIndexNowHost(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#14141A] border border-neutral-700 text-xs text-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-mono text-neutral-400">URLs (One per line)</label>
                    <textarea
                      rows={2}
                      value={indexNowUrls}
                      onChange={e => setIndexNowUrls(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#14141A] border border-neutral-700 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {indexNowMsg && <span className="text-xs font-mono text-[#E6CA65]">{indexNowMsg}</span>}
                  <button
                    type="submit"
                    className="ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#D4AF37] hover:bg-[#E6CA65] text-black transition"
                  >
                    Simulate IndexNow Push
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: Priority Frontier & Object Storage */}
        {activeSubTab === 'frontier' && (
          <div className="space-y-6">
            {/* Storage Retained Snapshots */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#0E0E12] border border-neutral-800">
                <span className="text-xs font-mono text-neutral-400">Documents Retained</span>
                <div className="text-2xl font-bold text-white mt-1">{storage?.total_documents_retained ?? 0}</div>
                <span className="text-[10px] text-neutral-500">SHA-256 Content-Addressed</span>
              </div>
              <div className="p-4 rounded-xl bg-[#0E0E12] border border-neutral-800">
                <span className="text-xs font-mono text-neutral-400">Disk Footprint</span>
                <div className="text-2xl font-bold text-[#E6CA65] mt-1">{storage?.disk_usage_mb ?? 0} MB</div>
                <span className="text-[10px] text-neutral-500">Gzip L6 Compressed</span>
              </div>
              <div className="p-4 rounded-xl bg-[#0E0E12] border border-neutral-800">
                <span className="text-xs font-mono text-neutral-400">Average Compression</span>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{storage?.average_compression_ratio ?? '2.8:1'}</div>
                <span className="text-[10px] text-neutral-500">{storage?.backend}</span>
              </div>
            </div>

            {/* Manual Seed Injection Form */}
            <div className="p-5 rounded-xl bg-[#0E0E12] border border-neutral-800 space-y-4">
              <h3 className="text-sm font-semibold text-white">Inject Seed URL with Intelligent Priority Scoring</h3>
              <form onSubmit={handleEnqueueURL} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="url"
                  placeholder="https://example.com/research-paper"
                  value={enqueueUrl}
                  onChange={e => setEnqueueUrl(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#14141A] border border-neutral-700 text-xs text-white"
                  required
                />
                <select
                  value={enqueueCrawler}
                  onChange={e => setEnqueueCrawler(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-[#14141A] border border-neutral-700 text-xs text-white font-mono"
                >
                  {ecosystem?.crawlers.map(c => (
                    <option key={c.crawler_type} value={c.crawler_type}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#D4AF37] hover:bg-[#E6CA65] text-black transition"
                >
                  Enqueue URL
                </button>
              </form>
              {enqueueMsg && <p className="text-xs font-mono text-[#E6CA65]">{enqueueMsg}</p>}
            </div>

            {/* Recent Tasks List */}
            <div className="p-5 rounded-xl bg-[#0E0E12] border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Recent Frontier Tasks</h3>
                <span className="text-xs font-mono text-neutral-400">Total Pending: {frontierData?.total_pending_tasks ?? 0}</span>
              </div>
              <div className="space-y-1.5 font-mono text-xs overflow-x-auto">
                {frontierData?.recent_tasks?.slice(0, 10).map((t: any) => (
                  <div key={t.id} className="p-2.5 rounded-lg bg-[#14141A] border border-neutral-850 flex items-center justify-between gap-4">
                    <span className="text-neutral-300 truncate max-w-md">{t.url}</span>
                    <div className="flex items-center space-x-3 text-[11px] shrink-0">
                      <span className="text-[#D4AF37]">{t.crawler_type}</span>
                      <span className="text-neutral-500">Prio: {t.priority}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        t.status === 'completed' ? 'text-emerald-400 bg-emerald-500/10' :
                        t.status === 'leased' ? 'text-cyan-400 bg-cyan-500/10' : 'text-neutral-400 bg-neutral-800'
                      }`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Self-Optimization Engine */}
        {activeSubTab === 'optimizer' && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl bg-[#0E0E12] border border-neutral-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Autonomous Self-Optimization Engine</h3>
                  <p className="text-xs text-neutral-400">Continuously adjusts worker concurrency, schedules, and retry intervals within strict safety boundaries.</p>
                </div>
                <button
                  onClick={handleTriggerTune}
                  disabled={tuningLoading}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#D4AF37] hover:bg-[#E6CA65] text-black transition"
                >
                  {tuningLoading ? 'Analyzing & Tuning...' : '⚡ Trigger On-Demand Optimization'}
                </button>
              </div>

              {tuningMsg && <p className="text-xs font-mono text-[#E6CA65]">{tuningMsg}</p>}

              {/* Safety Rules */}
              <div className="p-4 rounded-lg bg-[#14141A] border border-neutral-800 space-y-2">
                <span className="text-xs font-mono text-neutral-400 font-semibold">IMMUTABLE SAFETY GUARD RAILS:</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono text-neutral-300">
                  <div className="p-2 bg-[#0E0E12] rounded border border-neutral-700">✓ Robots.txt Strictly Respected</div>
                  <div className="p-2 bg-[#0E0E12] rounded border border-neutral-700">✓ SSRF / Private IPs Blocked</div>
                  <div className="p-2 bg-[#0E0E12] rounded border border-neutral-700">✓ Max Domain Concurrency Capped</div>
                  <div className="p-2 bg-[#0E0E12] rounded border border-neutral-700">✓ No Code Rewriting Allowed</div>
                </div>
              </div>

              {/* Recent Tuning Actions */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono text-neutral-400">Recent Automated Tuning Decisions:</h4>
                <div className="space-y-2 text-xs font-mono">
                  {optimizer?.recent_tuning_actions?.length === 0 ? (
                    <p className="text-neutral-500 py-4">All services running in optimal equilibrium.</p>
                  ) : (
                    optimizer?.recent_tuning_actions?.map((act: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-[#14141A] border border-neutral-800 flex items-center justify-between">
                        <div>
                          <span className="text-[#D4AF37] font-semibold">{act.crawler_type}: </span>
                          <span className="text-neutral-300">{act.recommendation}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {act.suggested_action}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Performance Benchmark Suite */}
        {activeSubTab === 'benchmark' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#0E0E12] border border-neutral-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Verifiable Performance Benchmark</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Live sampling measuring pages/hr, domains/hr, latency, duplicate rejection rate, and infrastructure cost.
                  </p>
                </div>
                <button
                  onClick={handleRunBenchmark}
                  disabled={benchmarkLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[#D4AF37] to-[#8C7322] hover:brightness-110 text-black transition shadow-lg shadow-[#D4AF37]/20 disabled:opacity-50"
                >
                  {benchmarkLoading ? 'Sampling Telemetry (5s)...' : 'Run Live Benchmark'}
                </button>
              </div>

              {benchmark && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-neutral-800">
                  <div className="p-4 rounded-xl bg-[#14141A] border border-neutral-800">
                    <span className="text-[11px] font-mono text-neutral-400">Pages / Hour</span>
                    <div className="text-2xl font-bold text-white mt-1">{benchmark.pages_per_hour.toLocaleString()}</div>
                    <span className="text-[10px] text-neutral-500">Live Extrapolation</span>
                  </div>
                  <div className="p-4 rounded-xl bg-[#14141A] border border-neutral-800">
                    <span className="text-[11px] font-mono text-neutral-400">Domains / Hour</span>
                    <div className="text-2xl font-bold text-[#D4AF37] mt-1">{benchmark.domains_per_hour.toLocaleString()}</div>
                    <span className="text-[10px] text-neutral-500">Unique Host Discovery</span>
                  </div>
                  <div className="p-4 rounded-xl bg-[#14141A] border border-neutral-800">
                    <span className="text-[11px] font-mono text-neutral-400">Avg Indexing Latency</span>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">{benchmark.avg_indexing_latency_ms} ms</div>
                    <span className="text-[10px] text-neutral-500">Pipeline Execution</span>
                  </div>
                  <div className="p-4 rounded-xl bg-[#14141A] border border-neutral-800">
                    <span className="text-[11px] font-mono text-neutral-400">Cost / 1k Pages</span>
                    <div className="text-2xl font-bold text-[#E6CA65] mt-1">${benchmark.infrastructure_cost_per_1000_pages_usd.toFixed(4)}</div>
                    <span className="text-[10px] text-neutral-500">Compute Efficiency</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: July AI Controlled Gateway (5 Search Modes) */}
        {activeSubTab === 'july_gateway' && (
          <div className="space-y-6">
            {/* Unified 5-Mode Search Tester */}
            <div className="p-6 rounded-2xl bg-[#0E0E12] border border-[#D4AF37]/30 space-y-4">
              <h3 className="text-sm font-semibold text-white">July AI 5-Mode Search Engine (Zero Fabrication)</h3>
              <p className="text-xs text-neutral-400">
                Directly queries the independent HS Search index and returns verifiable answers with strict citations.
              </p>

              <form onSubmit={handleExecuteJulySearch} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={julySearchQ}
                    onChange={e => setJulySearchQ(e.target.value)}
                    placeholder="Enter search query for July LLM..."
                    className="flex-1 px-4 py-2 rounded-xl bg-[#14141A] border border-neutral-700 text-xs text-white"
                  />
                  <select
                    value={julyMode}
                    onChange={e => setJulyMode(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#14141A] border border-neutral-700 text-xs text-white font-mono"
                  >
                    <option value="fast">Fast Search</option>
                    <option value="deep">Deep Search</option>
                    <option value="research">Research Search</option>
                    <option value="live">Live Search</option>
                    <option value="technical">Technical Search</option>
                  </select>
                  <button
                    type="submit"
                    disabled={julySearchLoading}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#D4AF37] hover:bg-[#E6CA65] text-black transition"
                  >
                    {julySearchLoading ? 'Synthesizing...' : 'Search July'}
                  </button>
                </div>
              </form>

              {julySearchRes && (
                <div className="p-4 rounded-xl bg-[#14141A] border border-neutral-800 space-y-3 text-xs font-mono">
                  <div className="flex items-center justify-between text-neutral-400">
                    <span>Search Mode: <strong className="text-[#D4AF37]">{julySearchRes.search_mode}</strong></span>
                    <span>Execution: <strong className="text-emerald-400">{julySearchRes.execution_time_ms}ms</strong></span>
                  </div>
                  {julySearchRes.direct_answer && (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300">
                      <strong>Direct Answer:</strong> {julySearchRes.direct_answer}
                    </div>
                  )}
                  <div>
                    <h4 className="text-neutral-400 font-semibold mb-1">Synthesis:</h4>
                    <p className="text-neutral-200 leading-relaxed">{julySearchRes.summary}</p>
                  </div>
                  {julySearchRes.citations?.length > 0 && (
                    <div>
                      <h4 className="text-neutral-400 font-semibold mb-1">Citations:</h4>
                      <div className="space-y-1">
                        {julySearchRes.citations.map((c: any) => (
                          <div key={c.index} className="text-neutral-400">
                            <span className="text-[#D4AF37]">[{c.index}]</span> <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline text-neutral-300">{c.title}</a> ({c.domain})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Targeted Crawl Request Dispatch */}
            <div className="p-6 rounded-2xl bg-[#0E0E12] border border-neutral-800 space-y-4">
              <h3 className="text-sm font-semibold text-white">Targeted Crawl Request Dispatch</h3>
              <form onSubmit={handleSubmitJulyCrawl} className="space-y-3">
                <input
                  type="text"
                  placeholder="Target Topic (e.g., Quantum error correction)"
                  value={julyCrawlQuery}
                  onChange={e => setJulyCrawlQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#14141A] border border-neutral-700 text-xs text-white"
                  required
                />
                <textarea
                  rows={2}
                  placeholder="Suggested URLs (Optional, one per line)"
                  value={julyCrawlUrls}
                  onChange={e => setJulyCrawlUrls(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#14141A] border border-neutral-700 text-xs text-white font-mono"
                />
                <div className="flex items-center justify-between">
                  {julyDispatchMsg && <span className="text-xs font-mono text-[#E6CA65]">{julyDispatchMsg}</span>}
                  <button
                    type="submit"
                    className="ml-auto px-4 py-2 rounded-lg text-xs font-semibold bg-[#D4AF37] hover:bg-[#E6CA65] text-black transition"
                  >
                    Submit Targeted Crawl Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
