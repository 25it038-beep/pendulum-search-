import React, { useState, useEffect } from 'react';
import { 
  Header 
} from './components/Header';
import { SearchBar } from './components/SearchBar';
import { ModeSelector } from './components/ModeSelector';
import { JulyAnswerCard } from './components/JulyAnswerCard';
import { GravityResearchView } from './components/GravityResearchView';
import { ResultCard } from './components/ResultCard';
import { ImageGrid } from './components/ImageGrid';
import { LiveFeedTicker } from './components/LiveFeedTicker';
import { AdminDashboard } from './components/AdminDashboard';
import { MegaCrawlerDashboard } from './components/MegaCrawlerDashboard';
import { LocationSelectorModal } from './components/LocationSelectorModal';
import { GlobalMapView } from './components/GlobalMapView';
import { LiveLocalWidget } from './components/LiveLocalWidget';
import { ProviderStatsBar } from './components/ProviderStatsBar';
import { searchAPI, fetchMetricsAPI } from './services/api';
import { SearchResponse, SearchMode, SortOrder, LocationState, HybridSearchResponse } from './types';
import { 
  Sparkles, ShieldCheck, Zap, Globe, Cpu, Database, 
  Terminal, ArrowRight, Layers, Radio, MapPin, Navigation
} from 'lucide-react';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'search' | 'admin' | 'megacrawler'>('search');
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('general');
  const [sort, setSort] = useState<SortOrder>('relevance');
  const [aiMode, setAiMode] = useState('auto');
  const [page, setPage] = useState(1);

  // Global Geolocation Intelligence State
  const [locationState, setLocationState] = useState<LocationState>(() => {
    try {
      const saved = localStorage.getItem('hs_geo_location_state');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      mode: 'worldwide',
      displayName: 'Worldwide',
      radiusKm: 25,
      rankingMode: 'most_relevant',
      privacyMode: 'standard'
    };
  });
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [viewLayout, setViewLayout] = useState<'list' | 'split' | 'map'>('list');
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState<HybridSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalIndexed, setTotalIndexed] = useState<number>(0);
  const [isCrawlerActive, setIsCrawlerActive] = useState<boolean>(true);

  // Save locationState to localStorage
  const handleLocationChange = (newState: LocationState) => {
    setLocationState(newState);
    try {
      localStorage.setItem('hs_geo_location_state', JSON.stringify(newState));
    } catch {}
    // Re-run search if query is active
    if (activeQuery) {
      executeSearch(activeQuery, mode, sort, newState);
    }
  };

  // Initial metrics fetch
  useEffect(() => {
    fetchMetricsAPI().then(res => {
      setTotalIndexed(res.metrics.indexed_webpages);
      setIsCrawlerActive(res.crawler_running);
    }).catch(() => {});
  }, []);

  const executeSearch = async (
    q: string, 
    newMode?: SearchMode, 
    newSort?: SortOrder, 
    locState?: LocationState
  ) => {
    const targetQ = q.trim();
    if (!targetQ) return;

    const targetMode = newMode || mode;
    const targetSort = newSort || sort;
    const activeLoc = locState || locationState;

    setActiveQuery(targetQ);
    setLoading(true);
    setError(null);

    try {
      const geoParams = {
        lat: activeLoc.coords?.lat,
        lon: activeLoc.coords?.lon,
        radiusKm: activeLoc.radiusKm,
        location: activeLoc.mode !== 'worldwide' ? activeLoc.displayName : undefined,
        locationMode: activeLoc.mode,
        rankingMode: targetSort === 'closest' 
          ? 'closest_first' 
          : (targetSort === 'best_rated' ? 'best_rated' : activeLoc.rankingMode)
      };

      const res = await searchAPI(
        targetQ, 
        targetMode, 
        targetSort, 
        1, 
        15, 
        aiMode, 
        undefined, 
        geoParams
      );

      setSearchResponse(res);
      setPage(1);

      // If results contain spatial locations or query is geo-aware, suggest split view if not already selected
      const hasSpatialResults = res.results.some(r => r.location && (r.location.lat || r.location.coordinates));
      if ((res.geo_metadata?.is_geo_query || hasSpatialResults) && viewLayout === 'list') {
        setViewLayout('split');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during search.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (q: string) => {
    executeSearch(q, mode, sort);
  };

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    if (activeQuery) {
      executeSearch(activeQuery, newMode, sort);
    }
  };

  const handleSortChange = (newSort: SortOrder) => {
    setSort(newSort);
    if (activeQuery) {
      executeSearch(activeQuery, mode, newSort);
    }
  };

  const handleViewOnMap = (id: number) => {
    setSelectedResultId(id);
    if (viewLayout === 'list') {
      setViewLayout('split');
    }
  };

  const sampleQueries = [
    "Colleges in Tambaram",
    "Restaurants near me",
    "Best hospitals in Chennai",
    "Universities near Coimbatore",
    "Tourist places in Japan",
    "Artificial intelligence breakthroughs",
    "Autonomous web crawler architecture"
  ];

  // Resolve map center coords from geo_metadata, locationState coords, or first result
  const mapCenterCoords = searchResponse?.geo_metadata?.target_lat && searchResponse?.geo_metadata?.target_lon
    ? { lat: searchResponse.geo_metadata.target_lat, lon: searchResponse.geo_metadata.target_lon }
    : (locationState.coords || (
        searchResponse?.results.find(r => r.location?.lat)?.location
          ? { lat: searchResponse!.results.find(r => r.location?.lat)!.location!.lat, lon: searchResponse!.results.find(r => r.location?.lon)!.location!.lon }
          : undefined
      ));

  const hasGeoResults = Boolean(searchResponse?.results.some(r => r.location && (r.location.lat || r.location.coordinates)));

  return (
    <div className="min-h-screen bg-obsidian-950 text-neutral-200 flex flex-col font-sans selection:bg-gold-400 selection:text-obsidian-950">
      {/* Navigation Header */}
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        isCrawlerActive={isCrawlerActive}
        totalIndexed={totalIndexed}
        locationState={locationState}
        onOpenLocationModal={() => setIsLocationModalOpen(true)}
      />

      {/* Location Selector Modal */}
      <LocationSelectorModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        locationState={locationState}
        onLocationChange={handleLocationChange}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentView === 'megacrawler' ? (
          <MegaCrawlerDashboard onClose={() => setCurrentView('search')} />
        ) : currentView === 'admin' ? (
          <AdminDashboard />
        ) : (
          <div>
            {/* Live Ticker */}
            <LiveFeedTicker />

            {/* Landing Hero View (when no active query) */}
            {!activeQuery && (
              <div className="max-w-4xl mx-auto px-4 pt-16 pb-24 text-center">
                {/* Brand Emblem */}
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-gold-300 via-gold-500 to-gold-700 shadow-gold-glow-lg mb-6 transform hover:scale-105 transition-transform duration-500">
                  <span className="font-serif font-black text-obsidian-950 text-4xl tracking-tighter">HS</span>
                </div>

                <h1 className="text-4xl sm:text-6xl font-serif font-bold tracking-tight mb-4">
                  <span className="bg-gradient-to-r from-neutral-100 via-gold-200 to-gold-400 bg-clip-text text-transparent">
                    HS SEARCH
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-neutral-400 font-light max-w-2xl mx-auto mb-4 leading-relaxed">
                  Universal Web Search + Global GeoSearch. Powered by July AI.
                </p>

                {/* Location Quick Switcher Banner */}
                <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-obsidian-900 border border-gold-400/30 text-xs font-mono text-neutral-300 mb-8 shadow-sm">
                  <MapPin className="w-3.5 h-3.5 text-gold-400" />
                  <span>Searching in:</span>
                  <button
                    onClick={() => setIsLocationModalOpen(true)}
                    className="text-gold-300 font-semibold hover:underline flex items-center gap-1"
                  >
                    <span>{locationState.displayName}</span>
                    <span className="text-neutral-500">({locationState.radiusKm} km) ▾</span>
                  </button>
                </div>

                {/* Central Search Bar */}
                <div className="mb-8">
                  <SearchBar
                    query={query}
                    onQueryChange={setQuery}
                    onSearch={(q) => handleSearch(q)}
                  />
                </div>

                {/* Sample Seed Queries */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-16 text-xs">
                  <span className="text-neutral-500 font-mono">Suggested:</span>
                  {sampleQueries.map((sq, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setQuery(sq);
                        handleSearch(sq);
                      }}
                      className="px-3 py-1.5 rounded-full bg-obsidian-900 border border-obsidian-800 text-neutral-300 hover:text-gold-300 hover:border-gold-400/40 transition-colors"
                    >
                      {sq}
                    </button>
                  ))}
                </div>

                {/* Feature Highlights Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left pt-8 border-t border-obsidian-850">
                  <div className="p-4 rounded-2xl bg-obsidian-900/60 border border-obsidian-850">
                    <div className="flex items-center space-x-2 text-gold-400 mb-2 font-mono text-xs font-semibold">
                      <Globe className="w-4 h-4" />
                      <span>GLOBAL GEOSEARCH</span>
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Spatial indexing with R*Tree and Geohash grids. Radius search, nearest-location retrieval, and administrative boundaries across all countries.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-obsidian-900/60 border border-obsidian-850">
                    <div className="flex items-center space-x-2 text-gold-400 mb-2 font-mono text-xs font-semibold">
                      <Radio className="w-4 h-4 text-rose-400" />
                      <span>LIVE LOCAL PULSE</span>
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Real-time weather, public transit status, and municipal announcements with verifiable last-checked timestamps.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-obsidian-900/60 border border-obsidian-850">
                    <div className="flex items-center space-x-2 text-gold-400 mb-2 font-mono text-xs font-semibold">
                      <Sparkles className="w-4 h-4" />
                      <span>JULY AI INTEGRATION</span>
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Spatial query parsing, exact distance calculations, operating status synthesis, and strictly grounded citations.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Search Results View */}
            {activeQuery && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Compact Search Bar Header */}
                <div className="mb-6 max-w-4xl">
                  <SearchBar
                    query={query}
                    onQueryChange={setQuery}
                    onSearch={(q) => handleSearch(q)}
                    compact
                  />
                </div>

                {/* Mode & Sort & Layout Selector */}
                <ModeSelector
                  currentMode={mode}
                  onModeChange={handleModeChange}
                  currentSort={sort}
                  onSortChange={handleSortChange}
                  aiMode={aiMode}
                  onAiModeChange={setAiMode}
                  viewLayout={viewLayout}
                  onViewLayoutChange={setViewLayout}
                  hasGeoResults={hasGeoResults}
                />

                {/* Hybrid Provider Telemetry Bar */}
                {searchResponse && (
                  <ProviderStatsBar
                    sourcesUsed={searchResponse.sources_used}
                    providerStats={searchResponse.provider_stats}
                    queryIntent={searchResponse.query_intent}
                    queryComplexity={searchResponse.query_complexity}
                    executionTimeMs={searchResponse.execution_time_ms}
                  />
                )}

                {/* Loading State */}
                {loading && (
                  <div className="py-20 text-center">
                    <div className="inline-block w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm font-mono text-gold-300">Searching independent global spatial index & synthesizing intelligence...</p>
                  </div>
                )}

                {/* Error State */}
                {error && (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm mb-6">
                    {error}
                  </div>
                )}

                {/* Search Results Content */}
                {!loading && searchResponse && (
                  <div>
                    {/* Live Local Pulse (if city metadata exists) */}
                    {searchResponse.geo_metadata?.live_local_info && (
                      <LiveLocalWidget info={searchResponse.geo_metadata.live_local_info as any} />
                    )}

                    {/* Telemetry Stats Bar */}
                    <div className="flex flex-wrap items-center justify-between text-xs font-mono text-neutral-500 mb-6 pb-2 border-b border-obsidian-850 gap-2">
                      <div className="flex items-center space-x-3">
                        <span>
                          Found <strong className="text-neutral-300">{searchResponse.total_results}</strong> results
                        </span>
                        <span>•</span>
                        <span>
                          Retrieved in <strong className="text-gold-400">{searchResponse.execution_time_ms}ms</strong>
                        </span>
                      </div>

                      {/* Geographic Scope Badge */}
                      {searchResponse.geo_metadata?.is_geo_query && (
                        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-gold-400/10 border border-gold-400/20 text-gold-300">
                          <MapPin className="w-3 h-3 text-gold-400" />
                          <span>Spatial Target: {searchResponse.geo_metadata.target_place || locationState.displayName}</span>
                          {searchResponse.geo_metadata.radius_km && (
                            <span className="text-neutral-400">({searchResponse.geo_metadata.radius_km} km radius)</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* AI Intelligence Panel */}
                    {searchResponse.ai_intelligence && (
                      <div>
                        {searchResponse.ai_intelligence.model?.includes('GRAVITY') ? (
                          <GravityResearchView data={searchResponse.ai_intelligence} />
                        ) : (
                          <JulyAnswerCard 
                            data={searchResponse.ai_intelligence} 
                            geoMetadata={searchResponse.geo_metadata as any} 
                          />
                        )}
                      </div>
                    )}

                    {/* Mode: Image Grid */}
                    {mode === 'image' ? (
                      <ImageGrid results={searchResponse.results} />
                    ) : (
                      /* Layout Management: List vs Split vs Map */
                      <div>
                        {/* 1. Full Map View */}
                        {viewLayout === 'map' && (
                          <div className="space-y-6">
                            <GlobalMapView
                              results={searchResponse.results}
                              centerCoords={mapCenterCoords}
                              radiusKm={searchResponse.geo_metadata?.radius_km || locationState.radiusKm}
                              locationName={searchResponse.geo_metadata?.target_place || locationState.displayName}
                              selectedResultId={selectedResultId}
                              onSelectResult={(id) => setSelectedResultId(id)}
                              className="h-[600px] w-full rounded-2xl shadow-gold-glow"
                            />

                            {/* Floating / Compact Results Cards underneath */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {searchResponse.results.map((item) => (
                                <ResultCard
                                  key={item.id}
                                  item={item}
                                  isSelected={selectedResultId === item.id}
                                  onViewOnMap={handleViewOnMap}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 2. Split View (List on Left, Sticky Map on Right) */}
                        {viewLayout === 'split' && (
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            {/* Left Column: Results List */}
                            <div className="lg:col-span-7 space-y-4">
                              {searchResponse.results.length === 0 ? (
                                <div className="py-16 text-center text-neutral-400 rounded-2xl bg-obsidian-900 border border-obsidian-850 p-8">
                                  <h3 className="text-base font-semibold text-white mb-2">No documents matched your geographic query</h3>
                                  <p className="text-xs text-neutral-400 max-w-md mx-auto mb-4">
                                    Try expanding your search radius or changing your location filters.
                                  </p>
                                </div>
                              ) : (
                                searchResponse.results.map((item) => (
                                  <ResultCard
                                    key={item.id}
                                    item={item}
                                    isSelected={selectedResultId === item.id}
                                    onViewOnMap={handleViewOnMap}
                                  />
                                ))
                              )}
                            </div>

                            {/* Right Column: Sticky Interactive Map */}
                            <div className="lg:col-span-5 lg:sticky lg:top-24">
                              <GlobalMapView
                                results={searchResponse.results}
                                centerCoords={mapCenterCoords}
                                radiusKm={searchResponse.geo_metadata?.radius_km || locationState.radiusKm}
                                locationName={searchResponse.geo_metadata?.target_place || locationState.displayName}
                                selectedResultId={selectedResultId}
                                onSelectResult={(id) => setSelectedResultId(id)}
                                className="h-[550px] w-full rounded-2xl shadow-gold-glow"
                              />
                            </div>
                          </div>
                        )}

                        {/* 3. List View */}
                        {viewLayout === 'list' && (
                          <div className="max-w-4xl space-y-4">
                            {searchResponse.results.length === 0 ? (
                              <div className="py-16 text-center text-neutral-400 rounded-2xl bg-obsidian-900 border border-obsidian-850 p-8">
                                <h3 className="text-base font-semibold text-white mb-2">No documents matched your query</h3>
                                <p className="text-xs text-neutral-400 max-w-md mx-auto mb-4">
                                  HS Search indexes documents independently. You can enqueue additional seed domains or trigger an on-demand crawl in the Admin Dashboard.
                                </p>
                                <button
                                  onClick={() => setCurrentView('admin')}
                                  className="px-4 py-2 rounded-xl bg-gold-400 text-obsidian-950 font-semibold text-xs hover:brightness-110"
                                >
                                  Open Admin Dashboard
                                </button>
                              </div>
                            ) : (
                              searchResponse.results.map((item) => (
                                <ResultCard
                                  key={item.id}
                                  item={item}
                                  isSelected={selectedResultId === item.id}
                                  onViewOnMap={handleViewOnMap}
                                />
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-obsidian-850 bg-obsidian-950 py-8 mt-auto text-xs text-neutral-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-serif font-bold text-gold-400">HS SEARCH</span>
            <span>• Universal Web Search + Global GeoSearch</span>
            <span>• Powered by July AI</span>
            <span>• By HS AI Solutions</span>
            <span>• Founder: Harshan Seliyan</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <span>Spatial R*Tree</span>
            <span>•</span>
            <span>Geohash Grid</span>
            <span>•</span>
            <span>Zero External Search APIs</span>
            <span>•</span>
            <span>Privacy-First Geolocation</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
