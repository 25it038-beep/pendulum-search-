import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import type {
  PendulumCategory,
  PendulumImageItem,
  PendulumResultItem,
  PendulumSearchHistoryEntry,
  PendulumSort,
  PendulumUserSettings,
  PendulumVideoItem,
  SavedSearchResultItem,
  TimeRangeFilter
} from './types';
import {
  clearUserHistoryAPI,
  detectGeoAPI,
  fetchUserWorkspaceAPI,
  recordUserHistoryAPI,
  removeSavedResultAPI,
  saveSearchResultAPI,
  saveUserPreferencesAPI
} from './services/api';
import { useAuth } from './context/AuthContext';
import { HomePage } from './components/pendulum/HomePage';
import { SearchResultsPage } from './components/pendulum/SearchResultsPage';
import {
  EvaluationModal,
  ImageViewerModal,
  ProfileModal,
  SettingsModal,
  VideoPlayerModal
} from './components/pendulum/Modals';
import { AdminDashboard } from './components/AdminDashboard';
import { MegaCrawlerDashboard } from './components/MegaCrawlerDashboard';

const SETTINGS_STORAGE_KEY = 'pendulum_settings_v2';
const HISTORY_STORAGE_KEY = 'pendulum_history_v2';

const DEFAULT_SETTINGS: PendulumUserSettings = {
  aiOverview: true,
  aiModel: 'auto',
  limit: 20,
  safeSearch: true,
  locationEnabled: true,
  city: 'Chennai',
  country: 'India',
  lat: 12.9249,
  lon: 80.1
};

const VALID_CATEGORIES: PendulumCategory[] = [
  'All',
  'Images',
  'Videos',
  'News',
  'Maps',
  'Shopping',
  'Books',
  'Research'
];

const VALID_SORTS: PendulumSort[] = ['relevance', 'latest', 'local'];
const VALID_TIME_RANGES: TimeRangeFilter[] = ['any', 'hour', 'day', 'week', 'month', 'year'];

interface ParsedRoute {
  pathname: string;
  query: string;
  category: PendulumCategory;
  sort: PendulumSort;
  timeRange: TimeRangeFilter;
}

function parseLocation(): ParsedRoute {
  if (typeof window === 'undefined') {
    return { pathname: '/', query: '', category: 'All', sort: 'relevance', timeRange: 'any' };
  }
  const pathname = window.location.pathname || '/';
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || '';
  const rawCat = params.get('type') || 'All';
  const category = VALID_CATEGORIES.find((c) => c.toLowerCase() === rawCat.toLowerCase()) || 'All';
  const rawSort = params.get('sort') || 'relevance';
  const sort = VALID_SORTS.includes(rawSort as PendulumSort) ? (rawSort as PendulumSort) : 'relevance';
  const rawTime = params.get('time') || 'any';
  const timeRange = VALID_TIME_RANGES.includes(rawTime as TimeRangeFilter)
    ? (rawTime as TimeRangeFilter)
    : 'any';

  return { pathname, query: q, category, sort, timeRange };
}

function loadSettings(): PendulumUserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function loadHistory(): PendulumSearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function App() {
  const { user, getAuthToken } = useAuth();
  const [route, setRoute] = useState<ParsedRoute>(() => parseLocation());
  const [settings, setSettings] = useState<PendulumUserSettings>(() => loadSettings());
  const [history, setHistory] = useState<PendulumSearchHistoryEntry[]>(() => loadHistory());
  const [savedResults, setSavedResults] = useState<SavedSearchResultItem[]>([]);

  // Shared Modal State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<{ item: PendulumVideoItem; list: PendulumVideoItem[] } | null>(null);
  const [activeImage, setActiveImage] = useState<{ item: PendulumImageItem; list: PendulumImageItem[] } | null>(null);

  // Sync user workspace from PostgreSQL when signed in
  useEffect(() => {
    if (!user) {
      setSavedResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token || cancelled) return;
        const workspace = await fetchUserWorkspaceAPI(token);
        if (cancelled) return;
        if (workspace.preferences) {
          setSettings((prev) => ({
            ...prev,
            aiOverview: workspace.preferences!.aiOverview,
            aiModel: (['auto', 'july', 'gravity'].includes(workspace.preferences!.aiModel)
              ? workspace.preferences!.aiModel
              : 'auto') as PendulumUserSettings['aiModel'],
            limit: workspace.preferences!.resultLimit,
            safeSearch: workspace.preferences!.safeSearch,
            locationEnabled: workspace.preferences!.locationEnabled,
            city: workspace.preferences!.city,
            country: workspace.preferences!.country
          }));
        }
        if (Array.isArray(workspace.history) && workspace.history.length > 0) {
          setHistory(
            workspace.history.map((h) => ({
              query: h.query,
              category: (VALID_CATEGORIES.find((c) => c.toLowerCase() === h.category.toLowerCase()) || 'All') as PendulumCategory,
              timestamp: h.createdAt
            }))
          );
        }
        if (Array.isArray(workspace.saved)) {
          setSavedResults(workspace.saved);
        }
      } catch (err) {
        console.error('Workspace sync skipped:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, getAuthToken]);

  // Initial IP/Geo detection when user hasn't customized settings
  useEffect(() => {
    try {
      if (localStorage.getItem(SETTINGS_STORAGE_KEY)) return;
    } catch {}
    detectGeoAPI()
      .then((geo) => {
        setSettings((prev) => {
          const next = {
            ...prev,
            city: geo.city || prev.city,
            country: geo.country_name || prev.country,
            lat: geo.lat ?? prev.lat,
            lon: geo.lon ?? prev.lon
          };
          try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
      })
      .catch(() => {});
  }, []);

  // Browser Back / Forward support via popstate
  useEffect(() => {
    const handlePop = () => {
      setRoute(parseLocation());
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Dynamic Document Title
  useEffect(() => {
    if (route.pathname.startsWith('/search') && route.query.trim()) {
      document.title = `${route.query.trim()} — Pendulum Search`;
    } else if (route.pathname.startsWith('/dashboard') || route.pathname.startsWith('/admin')) {
      document.title = 'Control Center — Pendulum Search';
    } else if (route.pathname.startsWith('/megacrawler')) {
      document.title = 'HS MegaCrawler — Pendulum Search';
    } else {
      document.title = 'Pendulum Search — Explore the world';
    }
  }, [route]);

  const updateSettings = (next: PendulumUserSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    if (user) {
      getAuthToken()
        .then((token) => {
          if (token) return saveUserPreferencesAPI(token, next);
        })
        .catch(() => {});
    }
  };

  const recordHistory = useCallback((q: string, category: PendulumCategory) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.query.toLowerCase() !== trimmed.toLowerCase());
      const next = [{ query: trimmed, category, timestamp: new Date().toISOString() }, ...filtered].slice(0, 25);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (user) {
      getAuthToken()
        .then((token) => {
          if (token) return recordUserHistoryAPI(token, trimmed, category);
        })
        .catch(() => {});
    }
  }, [user, getAuthToken]);

  const savedUrls = React.useMemo(() => new Set(savedResults.map((s) => s.url)), [savedResults]);

  const handleToggleSaveResult = useCallback(
    async (item: PendulumResultItem) => {
      if (!user) {
        setProfileOpen(true);
        return;
      }
      const token = await getAuthToken();
      if (!token) {
        setProfileOpen(true);
        return;
      }
      if (savedUrls.has(item.url)) {
        setSavedResults((prev) => prev.filter((s) => s.url !== item.url));
        try {
          await removeSavedResultAPI(token, item.url);
        } catch {}
      } else {
        const optimistic: SavedSearchResultItem = {
          url: item.url,
          title: item.title,
          snippet: item.snippet,
          domain: item.domain,
          category: item.category || 'All',
          createdAt: new Date().toISOString()
        };
        setSavedResults((prev) => [optimistic, ...prev.filter((s) => s.url !== item.url)]);
        try {
          const res = await saveSearchResultAPI(token, optimistic);
          if (res.saved) {
            setSavedResults((prev) => [res.saved, ...prev.filter((s) => s.url !== item.url)]);
          }
        } catch {}
      }
    },
    [user, getAuthToken, savedUrls]
  );

  const handleRemoveSaved = useCallback(
    async (url: string) => {
      setSavedResults((prev) => prev.filter((s) => s.url !== url));
      if (user) {
        const token = await getAuthToken();
        if (token) {
          removeSavedResultAPI(token, url).catch(() => {});
        }
      }
    },
    [user, getAuthToken]
  );

  const navigateToSearch = useCallback(
    (
      nextQuery: string,
      opts?: { category?: PendulumCategory; sort?: PendulumSort; timeRange?: TimeRangeFilter }
    ) => {
      const trimmed = nextQuery.trim();
      if (!trimmed) return;

      const cat = opts?.category || 'All';
      const sort = opts?.sort || 'relevance';
      const timeRange = opts?.timeRange || 'any';

      const params = new URLSearchParams();
      params.set('q', trimmed);
      if (cat !== 'All') params.set('type', cat);
      if (sort !== 'relevance') params.set('sort', sort);
      if (timeRange !== 'any') params.set('time', timeRange);

      const url = `/search?${params.toString()}`;
      window.history.pushState({}, '', url);
      setRoute({ pathname: '/search', query: trimmed, category: cat, sort, timeRange });
      recordHistory(trimmed, cat);
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [recordHistory]
  );

  const navigateHome = useCallback(() => {
    window.history.pushState({}, '', '/');
    setRoute({ pathname: '/', query: '', category: 'All', sort: 'relevance', timeRange: 'any' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const navigateRoute = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    setRoute({ pathname: path, query: '', category: 'All', sort: 'relevance', timeRange: 'any' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const recentQueryStrings = history.map((h) => h.query);

  // Admin / Control Center & MegaCrawler sub-routes preserved inside same SPA
  if (route.pathname.startsWith('/dashboard') || route.pathname.startsWith('/admin')) {
    return (
      <div className="min-h-screen bg-obsidian-950 text-[#f3f0e9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={navigateHome}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#111316] border border-white/10 hover:border-gold-400/45 text-xs font-medium text-gold-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Pendulum Search</span>
          </button>
        </div>
        <AdminDashboard />
      </div>
    );
  }

  if (route.pathname.startsWith('/megacrawler')) {
    return (
      <div className="min-h-screen bg-obsidian-950 text-[#f3f0e9]">
        <MegaCrawlerDashboard onClose={navigateHome} />
      </div>
    );
  }

  return (
    <>
      {route.pathname.startsWith('/search') ? (
        <SearchResultsPage
          query={route.query}
          category={route.category}
          sort={route.sort}
          timeRange={route.timeRange}
          settings={settings}
          recentQueries={recentQueryStrings}
          savedUrls={savedUrls}
          onToggleSaveResult={handleToggleSaveResult}
          onNavigateHome={navigateHome}
          onNavigateSearch={navigateToSearch}
          onNavigateRoute={navigateRoute}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenEval={() => setEvalOpen(true)}
          onOpenProfile={() => setProfileOpen(true)}
          onPlayVideo={(item, list) => setActiveVideo({ item, list })}
          onOpenImage={(item, list) => setActiveImage({ item, list })}
        />
      ) : (
        <HomePage
          settings={settings}
          recentQueries={recentQueryStrings}
          onSearch={(q, cat) => navigateToSearch(q, { category: cat || 'All' })}
          onUpdateSettings={updateSettings}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenEval={() => setEvalOpen(true)}
          onOpenProfile={() => setProfileOpen(true)}
          onNavigateRoute={navigateRoute}
        />
      )}

      {/* Shared Modals */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={updateSettings}
      />

      <EvaluationModal
        open={evalOpen}
        onClose={() => setEvalOpen(false)}
        onNavigateRoute={navigateRoute}
      />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        history={history}
        savedResults={savedResults}
        onSelectQuery={(q) => navigateToSearch(q, { category: 'All' })}
        onClearHistory={() => {
          setHistory([]);
          try {
            localStorage.removeItem(HISTORY_STORAGE_KEY);
          } catch {}
          if (user) {
            getAuthToken()
              .then((token) => {
                if (token) return clearUserHistoryAPI(token);
              })
              .catch(() => {});
          }
        }}
        onRemoveSaved={handleRemoveSaved}
        settings={settings}
      />

      <VideoPlayerModal
        video={activeVideo?.item || null}
        relatedVideos={activeVideo?.list || []}
        onClose={() => setActiveVideo(null)}
        onSelectVideo={(v) => setActiveVideo((prev) => (prev ? { ...prev, item: v } : null))}
      />

      <ImageViewerModal
        image={activeImage?.item || null}
        allImages={activeImage?.list || []}
        onClose={() => setActiveImage(null)}
        onSelectImage={(img) => setActiveImage((prev) => (prev ? { ...prev, item: img } : null))}
      />
    </>
  );
}

export default App;
