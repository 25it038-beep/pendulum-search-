import React, { useState, useEffect, useRef } from 'react';
import {
  SlidersHorizontal, Grid, User, BarChart3, Compass, Gauge, Globe,
  Image as ImageIcon, Play, Newspaper, MapPin, ShoppingBag, BookOpen,
  FlaskConical, AlertCircle, RefreshCw, Sparkles, Clock, ShieldCheck, ExternalLink
} from 'lucide-react';
import type {
  PendulumCategory,
  PendulumCitation,
  PendulumImageItem,
  PendulumOverview,
  PendulumRecognizedEntity,
  PendulumResultItem,
  PendulumSearchAttribution,
  PendulumSort,
  PendulumUserSettings,
  PendulumVideoItem,
  TimeRangeFilter
} from '../../types';
import {
  postHybridSearchAPI,
  streamAiSearchSSE
} from '../../services/api';
import { PendulumLogo } from './PendulumLogo';
import { SearchInputBox } from './SearchInputBox';
import { JulyOverviewPanel } from './JulyOverviewPanel';
import { SearchResultRow, SearchResultSkeleton } from './SearchResultRow';
import { ImagesWorkspace, InlineGeoMapPreview, MapsWorkspace, VideosWorkspace } from './MediaAndMapsViews';
import { KnowledgeGraphCard } from '../KnowledgeGraphCard';
import { useAuth } from '../../context/AuthContext';

interface SearchResultsPageProps {
  query: string;
  category: PendulumCategory;
  sort: PendulumSort;
  timeRange: TimeRangeFilter;
  settings: PendulumUserSettings;
  recentQueries: string[];
  savedUrls?: Set<string>;
  onToggleSaveResult?: (item: PendulumResultItem) => void;
  onNavigateHome: () => void;
  onNavigateSearch: (
    nextQuery: string,
    opts?: { category?: PendulumCategory; sort?: PendulumSort; timeRange?: TimeRangeFilter }
  ) => void;
  onNavigateRoute: (path: string) => void;
  onOpenSettings: () => void;
  onOpenEval: () => void;
  onOpenProfile: () => void;
  onPlayVideo: (video: PendulumVideoItem, all: PendulumVideoItem[]) => void;
  onOpenImage: (image: PendulumImageItem, all: PendulumImageItem[]) => void;
}

const CATEGORIES: Array<{ id: PendulumCategory; label: string; icon: React.ReactNode }> = [
  { id: 'All', label: 'All', icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'Images', label: 'Images', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'Videos', label: 'Videos', icon: <Play className="w-3.5 h-3.5" /> },
  { id: 'News', label: 'News', icon: <Newspaper className="w-3.5 h-3.5" /> },
  { id: 'Maps', label: 'Maps', icon: <MapPin className="w-3.5 h-3.5" /> },
  { id: 'Shopping', label: 'Shopping', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
  { id: 'Books', label: 'Books', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'Research', label: 'Research', icon: <FlaskConical className="w-3.5 h-3.5" /> }
];

const TIME_OPTIONS: Array<{ value: TimeRangeFilter; label: string }> = [
  { value: 'any', label: 'Any time' },
  { value: 'hour', label: 'Past hour' },
  { value: 'day', label: 'Past 24 hours' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'year', label: 'Past year' }
];

export const SearchResultsPage: React.FC<SearchResultsPageProps> = ({
  query,
  category,
  sort,
  timeRange,
  settings,
  recentQueries,
  savedUrls,
  onToggleSaveResult,
  onNavigateHome,
  onNavigateSearch,
  onNavigateRoute,
  onOpenSettings,
  onOpenEval,
  onOpenProfile,
  onPlayVideo,
  onOpenImage
}) => {
  const { user } = useAuth();
  const [inputQuery, setInputQuery] = useState(query);
  const [appsOpen, setAppsOpen] = useState(false);

  // Unified web/news/research state
  const [loadingResults, setLoadingResults] = useState(false);
  const [results, setResults] = useState<PendulumResultItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [partialWarning, setPartialWarning] = useState(false);
  const [correctedHint, setCorrectedHint] = useState<string | undefined>(undefined);
  const [queryIntent, setQueryIntent] = useState<string | undefined>(undefined);
  const [attribution, setAttribution] = useState<PendulumSearchAttribution | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requestedLimit, setRequestedLimit] = useState(settings.limit || 20);
  const [loadingMore, setLoadingMore] = useState(false);

  // July AI Overview state
  const [isStreamingAi, setIsStreamingAi] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [overview, setOverview] = useState<PendulumOverview | null>(null);
  const [citations, setCitations] = useState<PendulumCitation[]>([]);
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([]);
  const [citedOnly, setCitedOnly] = useState(false);

  // Right-rail Entity & Geo context
  const [kgCard, setKgCard] = useState<any>(null);
  const [recognizedEntity, setRecognizedEntity] = useState<PendulumRecognizedEntity | null>(null);
  const [geoMeta, setGeoMeta] = useState<any>(null);
  const [inlineVideos, setInlineVideos] = useState<PendulumVideoItem[]>([]);
  const [inlineImages, setInlineImages] = useState<PendulumImageItem[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  // Keep top input synced when user hits Back/Forward or clicks related question
  useEffect(() => {
    setInputQuery(query);
    setRequestedLimit(settings.limit || 20);
    setCitedOnly(false);
  }, [query, settings.limit]);

  const isSpecializedTab = category === 'Images' || category === 'Videos' || category === 'Maps';

  const runWebSearch = async (limitToUse: number, isLoadMore: boolean = false) => {
    if (!query.trim() || isSpecializedTab) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoadingResults(true);
      setSearchError(null);
      setCorrectedHint(undefined);
      setAttribution(null);
      setKgCard(null);
      setRecognizedEntity(null);
      setGeoMeta(null);
      setInlineVideos([]);
      setInlineImages([]);
    }

    const useAiStream =
      !isLoadMore &&
      settings.aiOverview &&
      (category === 'All' || category === 'Research' || category === 'News' || category === 'Books');

    if (useAiStream) {
      setIsStreamingAi(true);
      setStreamText('');
      setOverview(null);
      setCitations([]);
      setRelatedQuestions([]);

      try {
        await streamAiSearchSSE(
          {
            query,
            model: settings.aiModel,
            type: category,
            sort,
            timeRange,
            limit: limitToUse,
            settings
          },
          {
            onSources: (meta) => {
              setLoadingResults(false);
              setResults(meta.results || []);
              setTotalCount(meta.total || meta.results?.length || 0);
              setDuplicatesRemoved(meta.deduplication?.duplicatesRemoved || 0);
              setPartialWarning(Boolean(meta.partial));
              setCorrectedHint(meta.correctedQueryHint);
              setQueryIntent(meta.query_intent);
              setAttribution(meta.attribution || null);
              setCitations(meta.sources || []);
              setGeoMeta(meta.geo_metadata || null);
              setKgCard(meta.ai_intelligence?.knowledge_graph_card || null);
              setRecognizedEntity(meta.recognized_entity || null);
              setInlineVideos((meta.media?.videos as PendulumVideoItem[]) || []);
              setInlineImages((meta.media?.images as PendulumImageItem[]) || []);
            },
            onDelta: (delta) => {
              setStreamText((prev) => prev + delta);
            },
            onDone: (finalPayload) => {
              setIsStreamingAi(false);
              setLoadingResults(false);
              if (finalPayload.overview) setOverview(finalPayload.overview);
              if (finalPayload.relatedQuestions) setRelatedQuestions(finalPayload.relatedQuestions);
              if (finalPayload.results && finalPayload.results.length > 0) setResults(finalPayload.results);
              if (finalPayload.sources && finalPayload.sources.length > 0) setCitations(finalPayload.sources);
              if (finalPayload.recognized_entity) setRecognizedEntity(finalPayload.recognized_entity);
              if (finalPayload.attribution) setAttribution(finalPayload.attribution);
            }
          },
          ctrl.signal
        );
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setIsStreamingAi(false);
        // Graceful fallback to hybrid results if AI streaming fails
        try {
          const fallback = await postHybridSearchAPI(
            {
              query,
              type: category,
              sort,
              timeRange,
              limit: limitToUse,
              aiOverview: false,
              settings
            },
            ctrl.signal
          );
          setResults(fallback.results || []);
          setTotalCount(fallback.total || 0);
          setDuplicatesRemoved(fallback.deduplication?.duplicatesRemoved || 0);
          setPartialWarning(Boolean(fallback.partial));
          setCorrectedHint(fallback.correctedQueryHint);
          setQueryIntent(fallback.query_intent);
          setAttribution(fallback.attribution || null);
          setCitations(fallback.sources || []);
          setGeoMeta(fallback.geo_metadata || null);
          setRecognizedEntity(fallback.recognized_entity || null);
        } catch (fallbackErr: any) {
          if (fallbackErr?.name !== 'AbortError') {
            setSearchError(fallbackErr?.message || 'Unable to reach Pendulum Search.');
          }
        } finally {
          setLoadingResults(false);
        }
      }
      return;
    }

    // Standard hybrid search (Shopping, AI Overview off, or Load More)
    setIsStreamingAi(false);
    if (!isLoadMore) {
      setOverview(null);
      setStreamText('');
      setCitations([]);
      setRelatedQuestions([]);
    }
    try {
      const data = await postHybridSearchAPI(
        {
          query,
          type: category,
          sort,
          timeRange,
          limit: limitToUse,
          aiOverview: false,
          settings
        },
        ctrl.signal
      );
      setResults(data.results || []);
      setTotalCount(data.total || data.results?.length || 0);
      setDuplicatesRemoved(data.deduplication?.duplicatesRemoved || 0);
      setPartialWarning(Boolean(data.partial));
      setCorrectedHint(data.correctedQueryHint);
      setQueryIntent(data.query_intent);
      setAttribution(data.attribution || null);
      setCitations(data.sources || []);
      setGeoMeta(data.geo_metadata || null);
      setKgCard(data.ai_intelligence?.knowledge_graph_card || null);
      setRecognizedEntity(data.recognized_entity || null);
      setInlineVideos((data.media?.videos as PendulumVideoItem[]) || []);
      setInlineImages((data.media?.images as PendulumImageItem[]) || []);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setSearchError(err?.message || 'Search request failed.');
      }
    } finally {
      setLoadingResults(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    runWebSearch(requestedLimit, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [query, category, sort, timeRange, settings.aiOverview, settings.aiModel, settings.locationEnabled, settings.city, settings.country]);

  const handleLoadMore = () => {
    const nextLimit = Math.min(requestedLimit + 15, 50);
    setRequestedLimit(nextLimit);
    runWebSearch(nextLimit, true);
  };

  const citedUrls = new Set(citations.map((c) => c.url));
  const visibleResults = citedOnly
    ? results.filter((r) => citedUrls.has(r.url))
    : results;

  const hasRightPanel =
    !isSpecializedTab &&
    (Boolean(kgCard) || Boolean(recognizedEntity?.verifiedOfficialWebsite) || Boolean(recognizedEntity?.possibleMatches?.length) || Boolean(geoMeta?.target_place) || citations.length > 0);

  const hasExplicitVideoIntent = /\b(videos?|watch|clips?|documentary|lectures?|trailers?|youtube)\b/i.test(query);
  const hasExplicitImageIntent = /\b(images?|photos?|pictures?|wallpapers?|diagrams?|screenshots?|infographics?)\b/i.test(query);

  return (
    <div className="min-h-screen flex flex-col text-[#f3f0e9]">
      {/* Sticky Top Search Header */}
      <header className="sticky top-0 z-40 bg-[#090a0c]/92 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-[1360px] mx-auto px-3 sm:px-6 lg:px-10 py-2.5 sm:py-3 flex items-center gap-3 sm:gap-5">
          {/* Left: Pendulum Logo */}
          <PendulumLogo variant="compact" onClick={onNavigateHome} />

          {/* Center: Wide Search Input */}
          <div className="flex-1 min-w-0">
            <SearchInputBox
              value={inputQuery}
              onChange={setInputQuery}
              onSubmit={(q) => onNavigateSearch(q, { category, sort, timeRange })}
              variant="compact"
              recentQueries={recentQueries}
            />
          </div>

          {/* Right: Settings, Applications Menu, Profile */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Settings"
              title="Search Settings"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[#c5c7ca] hover:text-gold-200 hover:bg-white/[0.06] transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAppsOpen((v) => !v)}
                aria-label="Applications Menu"
                title="Pendulum Applications"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[#c5c7ca] hover:text-gold-200 hover:bg-white/[0.06] transition-colors"
              >
                <Grid className="w-4 h-4" />
              </button>
              {appsOpen && (
                <div
                  onMouseLeave={() => setAppsOpen(false)}
                  className="absolute right-0 top-[calc(100%+8px)] w-60 rounded-2xl bg-[#111316]/98 backdrop-blur-xl border border-gold-400/25 shadow-obsidian-elevated p-2 z-50 space-y-1"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAppsOpen(false);
                      onNavigateRoute('/dashboard');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.05] text-xs text-[#f3f0e9] text-left"
                  >
                    <Gauge className="w-4 h-4 text-gold-400" />
                    <span>Control Center</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAppsOpen(false);
                      onNavigateRoute('/megacrawler');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.05] text-xs text-[#f3f0e9] text-left"
                  >
                    <Compass className="w-4 h-4 text-gold-400" />
                    <span>HS MegaCrawler</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAppsOpen(false);
                      onOpenEval();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.05] text-xs text-[#f3f0e9] text-left"
                  >
                    <BarChart3 className="w-4 h-4 text-gold-400" />
                    <span>Quality &amp; Acceptance</span>
                  </button>
                  <a
                    href="https://hs-ai-studio-4i7i.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setAppsOpen(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.05] text-xs text-[#f3f0e9] text-left"
                  >
                    <Sparkles className="w-4 h-4 text-gold-400" />
                    <span>HS AI Solutions</span>
                  </a>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenProfile}
              aria-label="User Workspace"
              title={user?.email ? `Workspace (${user.email})` : 'Search Workspace & Sign In'}
              className="w-9 h-9 rounded-full bg-gold-400/15 border border-gold-400/40 flex items-center justify-center text-xs font-bold text-gold-200 hover:border-gold-400 transition-colors overflow-hidden"
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Account'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : user ? (
                <span>{(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}</span>
              ) : (
                <User className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Category Navigation Strip Directly Below Header */}
        <div className="max-w-[1360px] mx-auto px-3 sm:px-6 lg:px-10">
          <nav
            aria-label="Search Categories"
            className="flex items-center gap-1 overflow-x-auto scrollbar-none -mb-px"
          >
            {CATEGORIES.map((cat) => {
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onNavigateSearch(query, { category: cat.id, sort, timeRange })}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 min-h-[42px] ${
                    active
                      ? 'border-gold-400 text-gold-200'
                      : 'border-transparent text-[#9a9da3] hover:text-[#f3f0e9]'
                  }`}
                >
                  {cat.icon}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-3 sm:px-6 lg:px-10 py-5 sm:py-6">
        {/* Empty Query Guard */}
        {!query.trim() ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-base text-[#c5c7ca]">Enter a query above to explore the web with Pendulum Search.</p>
            <button
              type="button"
              onClick={onNavigateHome}
              className="px-4 py-2 rounded-xl bg-[#111316] border border-white/10 text-xs text-gold-200 hover:border-gold-400/45"
            >
              Return to Homepage
            </button>
          </div>
        ) : (
          <>
            {/* Filter & Sort Controls (for Web / News / Shopping / Books / Research) */}
            {!isSpecializedTab && (
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 mb-4 border-b border-white/[0.06]">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'relevance', label: 'Relevance' },
                      { id: 'latest', label: 'Latest' },
                      { id: 'local', label: 'Local results' }
                    ] as Array<{ id: PendulumSort; label: string }>
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onNavigateSearch(query, { category, sort: s.id, timeRange })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                        sort === s.id
                          ? 'bg-gold-400/15 border-gold-400/50 text-gold-200'
                          : 'bg-[#111316] border-white/10 text-[#c5c7ca] hover:border-white/25'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}

                  {/* Quick vertical switches requested */}
                  <button
                    type="button"
                    onClick={() => onNavigateSearch(query, { category: 'Images', sort, timeRange })}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#111316] border border-white/10 text-[#c5c7ca] hover:border-gold-400/40 hover:text-gold-200 whitespace-nowrap shrink-0"
                  >
                    Images
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateSearch(query, { category: 'Videos', sort, timeRange })}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#111316] border border-white/10 text-[#c5c7ca] hover:border-gold-400/40 hover:text-gold-200 whitespace-nowrap shrink-0"
                  >
                    Videos
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateSearch(query, { category: 'Research', sort, timeRange })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 ${
                      category === 'Research'
                        ? 'bg-gold-400/15 border-gold-400/50 text-gold-200'
                        : 'bg-[#111316] border-white/10 text-[#c5c7ca] hover:border-gold-400/40 hover:text-gold-200'
                    }`}
                  >
                    Research papers
                  </button>
                </div>

                {/* Genuine Time Range Selector + Cited Only */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-[#111316] border border-white/10 rounded-lg px-2.5 h-8">
                    <Clock className="w-3.5 h-3.5 text-gold-400" />
                    <select
                      value={timeRange}
                      onChange={(e) =>
                        onNavigateSearch(query, {
                          category,
                          sort,
                          timeRange: e.target.value as TimeRangeFilter
                        })
                      }
                      aria-label="Time filter"
                      className="bg-transparent text-xs text-[#e8e5de] focus:outline-none"
                    >
                      {TIME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#111316] text-[#f3f0e9]">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {citations.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCitedOnly((v) => !v)}
                      className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                        citedOnly
                          ? 'bg-gold-400/15 border-gold-400/50 text-gold-200'
                          : 'bg-[#111316] border-white/10 text-[#c5c7ca] hover:border-white/25'
                      }`}
                    >
                      Cited only
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Query Stats, DuckDuckGo Primary + Pendulum Enhancement Attribution & Spell Hint */}
            {!isSpecializedTab && !loadingResults && !searchError && (
              <div className="mb-4 space-y-1.5 text-xs text-[#8d9198]">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 tabular-nums">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>About {totalCount} results</span>
                    {duplicatesRemoved > 0 && <span>· {duplicatesRemoved} duplicates merged</span>}
                    {timeRange !== 'any' && (
                      <span className="text-gold-300">
                        · Filtered: {TIME_OPTIONS.find((t) => t.value === timeRange)?.label}
                      </span>
                    )}
                    {partialWarning && (
                      <span className="text-amber-300">
                        · Showing available sources (one external provider timed out)
                      </span>
                    )}
                  </div>

                  <div className="inline-flex items-center gap-1.5 text-[12px] text-[#c5c7ca]">
                    <span className="text-gold-300 font-medium">
                      Enhanced by Pendulum
                      {typeof attribution?.pendulumEnhancedCount === 'number' && attribution.pendulumEnhancedCount > 0
                        ? ` (${attribution.pendulumEnhancedCount})`
                        : ''}
                    </span>
                  </div>
                </div>

                {correctedHint && correctedHint.toLowerCase() !== query.toLowerCase() && (
                  <div className="text-xs text-[#c5c7ca]">
                    Showing expanded results including{' '}
                    <button
                      type="button"
                      onClick={() => onNavigateSearch(correctedHint, { category, sort, timeRange })}
                      className="text-gold-200 hover:underline font-medium"
                    >
                      {correctedHint}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Specialized Workspaces (Images, Videos, Maps) */}
            {category === 'Images' && <ImagesWorkspace query={query} onOpenImage={onOpenImage} />}
            {category === 'Videos' && <VideosWorkspace query={query} onPlayVideo={onPlayVideo} />}
            {category === 'Maps' && (
              <MapsWorkspace
                query={query}
                initialLat={settings.lat}
                initialLon={settings.lon}
                locationLabel={settings.locationEnabled ? `${settings.city}, ${settings.country}` : 'Global Map'}
              />
            )}

            {/* Two-Column Web Results Experience */}
            {!isSpecializedTab && (
              <div className="flex flex-col xl:flex-row items-start gap-8">
                {/* Primary Results Column */}
                <div className="w-full max-w-[760px] min-w-0">
                  {/* July AI Overview Card */}
                  {settings.aiOverview && (
                    <JulyOverviewPanel
                      query={query}
                      queryIntent={queryIntent}
                      overview={overview}
                      streamText={streamText}
                      isStreaming={isStreamingAi}
                      citations={citations}
                      relatedQuestions={relatedQuestions}
                      resultsPool={results}
                      aiModel={settings.aiModel}
                      settings={settings}
                      onSelectQuery={(nextQ) => onNavigateSearch(nextQ, { category: 'All', sort: 'relevance', timeRange: 'any' })}
                      onOverviewUpdated={(nextOv, nextRel) => {
                        setOverview(nextOv);
                        setStreamText('');
                        if (nextRel) setRelatedQuestions(nextRel);
                      }}
                    />
                  )}

                  {/* Compact Inline Image Strip on All only when query explicitly requests images */}
                  {category === 'All' && hasExplicitImageIntent && inlineImages.length > 0 && (
                    <section className="mb-6 p-4 rounded-2xl bg-[#111316]/85 border border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono uppercase tracking-[0.12em] text-gold-300">
                          Images
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigateSearch(query, { category: 'Images', sort, timeRange })}
                          className="text-xs text-gold-200 hover:underline"
                        >
                          View all images →
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {inlineImages.slice(0, 4).map((img, i) => {
                          const normalized: PendulumImageItem = {
                            id: img.id || `inline-img-${i}`,
                            title: img.title || (img as any).alt || query,
                            thumbnailUrl: img.thumbnailUrl || (img as any).src || img.originalUrl,
                            originalUrl: img.originalUrl || (img as any).src || img.thumbnailUrl,
                            sourceUrl: img.sourceUrl || img.originalUrl || '',
                            domain: img.domain,
                            width: img.width,
                            height: img.height,
                            creator: img.creator,
                            license: img.license,
                            sourceProvider: img.sourceProvider || img.provider || 'DuckDuckGo',
                            provider: img.provider || img.sourceProvider || 'DuckDuckGo'
                          };
                          return (
                            <button
                              key={normalized.id}
                              type="button"
                              onClick={() =>
                                onOpenImage(
                                  normalized,
                                  inlineImages.map((item, idx) => ({
                                    id: item.id || `inline-img-${idx}`,
                                    title: item.title || (item as any).alt || query,
                                    thumbnailUrl: item.thumbnailUrl || (item as any).src || item.originalUrl,
                                    originalUrl: item.originalUrl || (item as any).src || item.thumbnailUrl,
                                    sourceUrl: item.sourceUrl || item.originalUrl || '',
                                    domain: item.domain,
                                    width: item.width,
                                    height: item.height,
                                    creator: item.creator,
                                    license: item.license,
                                    sourceProvider: item.sourceProvider || item.provider || 'DuckDuckGo',
                                    provider: item.provider || item.sourceProvider || 'DuckDuckGo'
                                  }))
                                )
                              }
                              className="group text-left rounded-xl bg-[#171a1e] border border-white/10 hover:border-gold-400/45 overflow-hidden transition-colors"
                            >
                              <div className="aspect-[4/3] bg-black overflow-hidden">
                                <img
                                  src={normalized.thumbnailUrl || normalized.originalUrl}
                                  alt={normalized.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                                />
                              </div>
                              <div className="p-2">
                                <div className="text-[11px] font-medium text-[#f3f0e9] truncate">{normalized.title}</div>
                                <div className="text-[10px] font-mono text-[#9a9da3] truncate">{normalized.domain || 'Web Image'}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Compact Inline Video Strip on All only when query explicitly requests videos */}
                  {category === 'All' && hasExplicitVideoIntent && inlineVideos.length > 0 && (
                    <section className="mb-6 p-4 rounded-2xl bg-[#111316]/85 border border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono uppercase tracking-[0.12em] text-gold-300">
                          Videos
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigateSearch(query, { category: 'Videos', sort, timeRange })}
                          className="text-xs text-gold-200 hover:underline"
                        >
                          View all videos →
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {inlineVideos.slice(0, 3).map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => onPlayVideo(v, inlineVideos)}
                            className="group text-left rounded-xl bg-[#171a1e] border border-white/10 hover:border-gold-400/45 overflow-hidden transition-colors"
                          >
                            <div className="relative aspect-video bg-black">
                              {v.thumbnailUrl && (
                                <img
                                  src={v.thumbnailUrl}
                                  alt={v.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                                <div className="w-8 h-8 rounded-full bg-obsidian-950/85 border border-gold-400/60 flex items-center justify-center text-gold-300">
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                </div>
                              </div>
                              {v.duration && (
                                <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white tabular-nums">
                                  {v.duration}
                                </div>
                              )}
                            </div>
                            <div className="p-2.5">
                              <div className="text-xs font-medium text-[#f3f0e9] line-clamp-1">{v.title}</div>
                              <div className="text-[11px] font-mono text-[#9a9da3] truncate mt-0.5">
                                {v.publisher || v.sourceDomain}{v.views ? ` · ${v.views}` : ''}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Search Error State */}
                  {searchError && (
                    <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-400/25 text-sm text-rose-200 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{searchError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => runWebSearch(requestedLimit, false)}
                        className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white flex items-center gap-1.5 shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}

                  {/* Loading Skeletons */}
                  {loadingResults && (
                    <div>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <SearchResultSkeleton key={i} />
                      ))}
                    </div>
                  )}

                  {/* Traditional Search Results List */}
                  {!loadingResults && !searchError && visibleResults.length > 0 && (
                    <div>
                      {visibleResults.map((item, idx) => (
                        <SearchResultRow
                          key={`${item.id}-${item.url}-${idx}`}
                          item={item}
                          index={idx}
                          isSaved={savedUrls?.has(item.url)}
                          onToggleSave={onToggleSaveResult}
                          onOpenMapItem={(resItem) =>
                            onNavigateSearch(resItem.title || query, { category: 'Maps', sort, timeRange })
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* Honest Empty State */}
                  {!loadingResults && !searchError && visibleResults.length === 0 && (
                    <div className="py-12 px-5 rounded-2xl bg-[#111316] border border-white/10 text-center space-y-3">
                      <div className="text-base font-semibold text-[#f3f0e9]">
                        No matching results found for &ldquo;{query}&rdquo;
                      </div>
                      <p className="text-xs text-[#9a9da3] max-w-md mx-auto">
                        {timeRange !== 'any'
                          ? 'No results fell inside the selected time range. Try resetting the time filter to Any time.'
                          : 'Try broader keywords, remove quotes, or switch to another category tab.'}
                      </p>
                      {timeRange !== 'any' && (
                        <button
                          type="button"
                          onClick={() => onNavigateSearch(query, { category, sort, timeRange: 'any' })}
                          className="px-4 py-2 rounded-xl bg-gold-400/15 border border-gold-400/40 text-xs font-medium text-gold-200"
                        >
                          Reset Time Filter
                        </button>
                      )}
                    </div>
                  )}

                  {/* Pagination / Load More */}
                  {!loadingResults && !citedOnly && totalCount > results.length && requestedLimit < 50 && (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="px-6 py-2.5 rounded-xl bg-[#111316] hover:bg-[#171a1e] border border-white/15 hover:border-gold-400/45 text-xs sm:text-sm font-medium text-gold-200 transition-colors disabled:opacity-50"
                      >
                        {loadingMore ? 'Loading more results...' : 'Load More Results'}
                      </button>
                    </div>
                  )}

                  {/* Related Searches Footer Strip */}
                  {!loadingResults && relatedQuestions.length > 0 && (
                    <section className="mt-8 pt-6 border-t border-white/[0.07]">
                      <div className="text-xs font-mono uppercase tracking-[0.12em] text-[#9a9da3] mb-3">
                        Related Searches
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {relatedQuestions.slice(0, 4).map((rq, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              onNavigateSearch(rq, { category: 'All', sort: 'relevance', timeRange: 'any' })
                            }
                            className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#111316] hover:bg-[#171a1e] border border-white/10 hover:border-gold-400/40 text-left text-xs sm:text-sm text-[#e8e5de] hover:text-gold-200 transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-gold-400 shrink-0" />
                            <span className="truncate">{rq}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                {/* Optional Right Information Panel (Desktop) */}
                {hasRightPanel && (
                  <aside className="hidden xl:block w-[320px] shrink-0 space-y-4">
                    {kgCard && <KnowledgeGraphCard card={kgCard} />}

                    {recognizedEntity && (recognizedEntity.verifiedOfficialWebsite || (recognizedEntity.possibleMatches && recognizedEntity.possibleMatches.length > 0)) && (
                      <div className="p-4 rounded-2xl bg-[#111316] border border-gold-400/25 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-gold-300">
                            <ShieldCheck className="w-3.5 h-3.5 text-gold-400" />
                            <span>Official Organization</span>
                          </span>
                          <span className="text-[10px] font-mono uppercase text-[#9a9da3]">
                            {recognizedEntity.entityType.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div>
                          <h2 className="text-base font-display font-bold text-[#f3f0e9]">
                            {recognizedEntity.verifiedOfficialWebsite?.organizationName || recognizedEntity.name}
                          </h2>
                          {(recognizedEntity.location || recognizedEntity.region || recognizedEntity.country) && (
                            <p className="text-xs text-[#9a9da3] mt-0.5">
                              {[recognizedEntity.location, recognizedEntity.region, recognizedEntity.country].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>

                        {recognizedEntity.verifiedOfficialWebsite && (
                          <a
                            href={recognizedEntity.verifiedOfficialWebsite.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-gold-400/10 hover:bg-gold-400/15 border border-gold-400/35 text-xs font-medium text-gold-200 transition-colors"
                          >
                            <span className="truncate font-mono">{recognizedEntity.verifiedOfficialWebsite.domain}</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                        )}

                        {recognizedEntity.possibleMatches && recognizedEntity.possibleMatches.length > 1 && (
                          <div className="pt-2.5 border-t border-white/[0.07] space-y-1.5">
                            <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#9a9da3]">
                              {recognizedEntity.isAmbiguous ? 'Possible Matching Institutions' : 'Related Entities'}
                            </div>
                            <div className="space-y-1">
                              {recognizedEntity.possibleMatches.slice(0, 4).map((pm, idx) => (
                                <button
                                  key={`${pm.name}-${idx}`}
                                  type="button"
                                  onClick={() => onNavigateSearch(pm.name, { category: 'All', sort: 'relevance', timeRange: 'any' })}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[#171a1e] hover:bg-[#20242a] border border-white/[0.06] hover:border-gold-400/35 transition-colors"
                                >
                                  <div className="text-xs font-medium text-[#e8e5de] truncate">{pm.name}</div>
                                  {pm.officialDomain && (
                                    <div className="text-[10px] font-mono text-gold-300/80 truncate">{pm.officialDomain}</div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {geoMeta?.target_place && (
                      <div className="p-4 rounded-2xl bg-[#111316] border border-white/10 space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.12em] text-gold-300">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Geographic Context</span>
                        </div>
                        <div className="text-base font-display font-bold text-[#f3f0e9]">
                          {geoMeta.target_place}
                        </div>
                        {Number.isFinite(geoMeta.target_lat) && Number.isFinite(geoMeta.target_lon) && (
                          <>
                            <InlineGeoMapPreview
                              lat={Number(geoMeta.target_lat)}
                              lon={Number(geoMeta.target_lon)}
                              label={geoMeta.target_place}
                            />
                            <div className="text-xs font-mono text-[#9a9da3] tabular-nums">
                              {Number(geoMeta.target_lat).toFixed(4)}, {Number(geoMeta.target_lon).toFixed(4)}
                            </div>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => onNavigateSearch(query, { category: 'Maps', sort, timeRange })}
                          className="w-full h-9 rounded-xl bg-[#171a1e] hover:bg-[#20242a] border border-white/10 text-xs font-medium text-gold-200 transition-colors"
                        >
                          Open Interactive Map
                        </button>
                      </div>
                    )}

                    {hasExplicitImageIntent && inlineImages.length > 0 && (
                      <div className="p-4 rounded-2xl bg-[#111316] border border-white/10 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono uppercase tracking-[0.12em] text-[#9a9da3]">Images</span>
                          <button
                            type="button"
                            onClick={() => onNavigateSearch(query, { category: 'Images', sort, timeRange })}
                            className="text-xs text-gold-200 hover:underline"
                          >
                            Explore →
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {inlineImages.slice(0, 4).map((im: any, idx: number) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() =>
                                onOpenImage(
                                  {
                                    id: `inline-img-${idx}`,
                                    title: im.title || im.alt || query,
                                    thumbnailUrl: im.src || im.thumbnailUrl,
                                    originalUrl: im.originalUrl || im.src,
                                    sourceUrl: im.sourceUrl || im.src,
                                    domain: im.domain
                                  },
                                  inlineImages.map((x: any, i: number) => ({
                                    id: `inline-img-${i}`,
                                    title: x.title || x.alt || query,
                                    thumbnailUrl: x.src || x.thumbnailUrl,
                                    originalUrl: x.originalUrl || x.src,
                                    sourceUrl: x.sourceUrl || x.src,
                                    domain: x.domain
                                  }))
                                )
                              }
                              className="aspect-square rounded-lg overflow-hidden bg-black border border-white/10"
                            >
                              <img
                                src={im.src || im.thumbnailUrl}
                                alt={im.alt || query}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </aside>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="px-4 sm:px-8 lg:px-12 py-4 border-t border-white/[0.055] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#8d9198]">
        <div>
          <span className="text-[#c5c7ca] font-medium">Pendulum Search</span> · Built by{' '}
          <a
            href="https://hs-ai-studio-4i7i.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-300 hover:text-gold-200 hover:underline transition-colors font-medium"
          >
            HS AI Solutions
          </a>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://hs-ai-studio-4i7i.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gold-200 transition-colors"
          >
            HS AI Solutions
          </a>
          <button
            type="button"
            onClick={() => onNavigateRoute('/dashboard')}
            className="hover:text-gold-200 transition-colors"
          >
            Control Center
          </button>
          <button
            type="button"
            onClick={() => onNavigateRoute('/megacrawler')}
            className="hover:text-gold-200 transition-colors"
          >
            MegaCrawler
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="hover:text-gold-200 transition-colors"
          >
            Preferences
          </button>
        </div>
      </footer>
    </div>
  );
};
