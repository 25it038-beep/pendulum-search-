import React, { useState, useEffect, useRef } from 'react';
import {
  X, SlidersHorizontal, MapPin, Shield, BarChart3, CheckCircle2,
  XCircle, Play, Pause, Volume2, VolumeX, Maximize, PictureInPicture2,
  ExternalLink, Copy, Check, Clock, Trash2, Sparkles, Gauge, Compass,
  ChevronLeft, ChevronRight, Bookmark, LogIn, LogOut
} from 'lucide-react';
import type {
  AiModelSelection,
  PendulumImageItem,
  PendulumSearchHistoryEntry,
  PendulumUserSettings,
  PendulumVideoItem,
  SavedSearchResultItem
} from '../../types';
import {
  detectGeoAPI,
  fetchEvalMetricsAPI,
  runAcceptanceAPI
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// =============================================================================
// Settings Modal
// =============================================================================
interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: PendulumUserSettings;
  onSave: (next: PendulumUserSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose, settings, onSave }) => {
  const [draft, setDraft] = useState<PendulumUserSettings>(settings);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  if (!open) return null;

  const handleDetectLocation = async () => {
    setDetecting(true);
    try {
      const geo = await detectGeoAPI();
      setDraft((prev) => ({
        ...prev,
        locationEnabled: true,
        city: geo.city || prev.city || 'Chennai',
        country: geo.country_name || prev.country || 'India',
        lat: geo.lat ?? prev.lat,
        lon: geo.lon ?? prev.lon
      }));
    } catch {}
    setDetecting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-[#111316] border border-gold-400/30 shadow-obsidian-elevated p-6 text-[#f3f0e9]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4 h-4 text-gold-400" />
            <h2 className="font-display font-bold text-lg">Search Preferences</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9da3] hover:text-white hover:bg-white/5"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* AI Overview toggle */}
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <div className="text-sm font-semibold text-[#f3f0e9]">July & Gravity AI Overview</div>
              <div className="text-xs text-[#9a9da3]">Display grounded synthesis with inline citations on search results.</div>
            </div>
            <input
              type="checkbox"
              checked={draft.aiOverview}
              onChange={(e) => setDraft({ ...draft, aiOverview: e.target.checked })}
              className="w-4 h-4 accent-[#d2b477]"
            />
          </label>

          {/* AI Engine Mode */}
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.12em] text-[#9a9da3] mb-2">Default AI Engine</div>
            <div className="grid grid-cols-3 gap-2">
              {(['auto', 'july', 'gravity'] as AiModelSelection[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDraft({ ...draft, aiModel: m })}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors capitalize ${
                    draft.aiModel === m
                      ? 'bg-gold-400/15 border-gold-400 text-gold-200'
                      : 'bg-[#171a1e] border-white/10 text-[#c5c7ca] hover:border-white/25'
                  }`}
                >
                  {m === 'auto' ? 'Auto' : m === 'july' ? 'July Fast' : 'Gravity Deep'}
                </button>
              ))}
            </div>
          </div>

          {/* Results per page */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-[0.12em] text-[#9a9da3] mb-1.5">
                Results Per Page
              </label>
              <select
                value={draft.limit}
                onChange={(e) => setDraft({ ...draft, limit: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-[#171a1e] border border-white/10 text-sm text-[#f3f0e9] focus:outline-none focus:border-gold-400"
              >
                <option value={10}>10 results</option>
                <option value={20}>20 results</option>
                <option value={35}>35 results</option>
                <option value={50}>50 results</option>
              </select>
            </div>

            <label className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-[#171a1e] border border-white/10 cursor-pointer self-end h-10">
              <div className="flex items-center gap-2 text-sm text-[#f3f0e9]">
                <Shield className="w-4 h-4 text-gold-400" />
                <span>Safe Search</span>
              </div>
              <input
                type="checkbox"
                checked={draft.safeSearch}
                onChange={(e) => setDraft({ ...draft, safeSearch: e.target.checked })}
                className="w-4 h-4 accent-[#d2b477]"
              />
            </label>
          </div>

          {/* Geographic Context */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <MapPin className="w-4 h-4 text-gold-400" />
                <span>Location Personalization</span>
              </label>
              <input
                type="checkbox"
                checked={draft.locationEnabled}
                onChange={(e) => setDraft({ ...draft, locationEnabled: e.target.checked })}
                className="w-4 h-4 accent-[#d2b477]"
              />
            </div>

            {draft.locationEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  placeholder="City (e.g., Chennai)"
                  className="h-10 px-3 rounded-xl bg-[#171a1e] border border-white/10 text-sm text-[#f3f0e9] focus:outline-none focus:border-gold-400"
                />
                <input
                  type="text"
                  value={draft.country}
                  onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                  placeholder="Country (e.g., India)"
                  className="h-10 px-3 rounded-xl bg-[#171a1e] border border-white/10 text-sm text-[#f3f0e9] focus:outline-none focus:border-gold-400"
                />
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={detecting}
                  className="sm:col-span-2 h-9 rounded-xl bg-[#171a1e] hover:bg-[#20242a] border border-white/10 text-xs text-gold-200 font-medium transition-colors"
                >
                  {detecting ? 'Detecting location...' : 'Auto-detect approximate location'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-[#c5c7ca] hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-b from-gold-200 to-gold-400 text-[#090a0c] hover:brightness-105"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Evaluation & System Suite Modal
// =============================================================================
interface EvaluationModalProps {
  open: boolean;
  onClose: () => void;
  onNavigateRoute: (path: string) => void;
}

export const EvaluationModal: React.FC<EvaluationModalProps> = ({ open, onClose, onNavigateRoute }) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [acceptance, setAcceptance] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    Promise.all([fetchEvalMetricsAPI().catch(() => null), runAcceptanceAPI().catch(() => null)])
      .then(([m, a]) => {
        if (!active) return;
        setMetrics(m);
        setAcceptance(a);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#111316] border border-gold-400/30 shadow-obsidian-elevated p-6 text-[#f3f0e9]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-4 h-4 text-gold-400" />
            <h2 className="font-display font-bold text-lg">Search Quality & Acceptance Suite</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9da3] hover:text-white hover:bg-white/5"
            aria-label="Close evaluation modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {loading ? (
            <div className="py-10 text-center text-sm text-[#9a9da3]">Running live search quality verification...</div>
          ) : (
            <>
              {metrics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#171a1e] border border-white/10">
                    <div className="text-[11px] font-mono text-[#9a9da3]">Avg Response</div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-gold-200">
                      {metrics.avgLatencyMs ?? 0} ms
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#171a1e] border border-white/10">
                    <div className="text-[11px] font-mono text-[#9a9da3]">Indexed Docs</div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-[#f3f0e9]">
                      {metrics.indexedDocuments ?? 0}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#171a1e] border border-white/10">
                    <div className="text-[11px] font-mono text-[#9a9da3]">Total Queries</div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-[#f3f0e9]">
                      {metrics.totalSearches ?? 0}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#171a1e] border border-white/10">
                    <div className="text-[11px] font-mono text-[#9a9da3]">Acceptance</div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-[#a9c6a5]">
                      {acceptance ? `${acceptance.passedCount}/${acceptance.totalCount}` : '—'}
                    </div>
                  </div>
                </div>
              )}

              {acceptance?.cases && (
                <div className="space-y-2">
                  <div className="text-xs font-mono uppercase tracking-[0.12em] text-[#9a9da3]">
                    Live Acceptance Checks
                  </div>
                  {acceptance.cases.map((c: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-3 p-3 rounded-xl bg-[#171a1e] border border-white/10"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#f3f0e9]">{c.name}</div>
                        <div className="text-xs text-[#9a9da3] mt-0.5">{c.details}</div>
                      </div>
                      {c.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-[#a9c6a5] shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#9a9da3]">Manage crawler infrastructure & gateway tiers:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateRoute('/dashboard');
                }}
                className="px-3.5 py-2 rounded-xl bg-[#171a1e] hover:bg-[#20242a] border border-white/10 text-xs font-medium text-gold-200 flex items-center gap-1.5"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>Control Center</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateRoute('/megacrawler');
                }}
                className="px-3.5 py-2 rounded-xl bg-[#171a1e] hover:bg-[#20242a] border border-white/10 text-xs font-medium text-gold-200 flex items-center gap-1.5"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>MegaCrawler</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// User Profile & Search History Modal
// =============================================================================
interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  history: PendulumSearchHistoryEntry[];
  savedResults: SavedSearchResultItem[];
  onSelectQuery: (q: string) => void;
  onClearHistory: () => void;
  onRemoveSaved: (url: string) => void;
  settings: PendulumUserSettings;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  open,
  onClose,
  history,
  savedResults,
  onSelectQuery,
  onClearHistory,
  onRemoveSaved,
  settings
}) => {
  const { user, loading: authLoading, authError, signInWithGoogle, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'history' | 'saved'>('history');
  const [signingIn, setSigningIn] = useState(false);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // authError state is handled inside AuthContext
    } finally {
      setSigningIn(false);
    }
  };

  const userInitial = (user?.displayName || user?.email || 'PS').slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-[#111316] border border-gold-400/30 shadow-obsidian-elevated p-6 text-[#f3f0e9]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Account avatar'}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full border border-gold-400/40 object-cover shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gold-400/15 border border-gold-400/40 flex items-center justify-center text-sm font-bold text-gold-200 shrink-0">
                {userInitial}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base truncate">
                {user?.displayName || 'Search Workspace'}
              </h2>
              <p className="text-xs text-[#9a9da3] truncate">
                {user?.email || (settings.locationEnabled ? `${settings.city}, ${settings.country}` : 'Global mode')}{' '}
                · {settings.aiModel.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9da3] hover:text-white hover:bg-white/5 shrink-0"
            aria-label="Close workspace modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Account Sign-In / Sign-Out Bar */}
        <div className="mt-4 p-3 rounded-xl bg-[#171a1e] border border-white/10 flex items-center justify-between gap-3">
          {user ? (
            <>
              <div className="text-xs text-[#c5c7ca] min-w-0">
                <div className="font-medium text-[#f3f0e9] truncate">Signed in as {user.email}</div>
                <div className="text-[11px] text-[#9a9da3]">History, bookmarks &amp; preferences synced</div>
              </div>
              <button
                type="button"
                onClick={() => signOutUser()}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-[#e8e5de] flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <>
              <div className="text-xs text-[#c5c7ca]">
                <div className="font-medium text-[#f3f0e9]">Sync your search workspace</div>
                <div className="text-[11px] text-[#9a9da3]">Sign in to save history, bookmarks &amp; preferences</div>
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading || signingIn}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-b from-gold-200 to-gold-400 text-[#090a0c] text-xs font-semibold flex items-center gap-1.5 shrink-0 hover:brightness-105 disabled:opacity-60 transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{signingIn ? 'Signing in...' : 'Sign in'}</span>
              </button>
            </>
          )}
        </div>

        {authError && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-400/25 text-xs text-rose-200">
            {authError}
          </div>
        )}

        {/* Workspace Tabs: History / Saved */}
        <div className="mt-4 flex items-center gap-2 border-b border-white/10 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-gold-400/15 text-gold-200 border border-gold-400/35'
                : 'text-[#9a9da3] hover:text-[#f3f0e9]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>History ({history.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'saved'
                ? 'bg-gold-400/15 text-gold-200 border border-gold-400/35'
                : 'text-[#9a9da3] hover:text-[#f3f0e9]'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved ({savedResults.length})</span>
          </button>
        </div>

        {activeTab === 'history' ? (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#9a9da3]">
                Recent Search Queries
              </span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#9a9da3]">
                No recent queries yet.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {history.map((entry, idx) => (
                  <button
                    key={`${entry.query}-${idx}`}
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectQuery(entry.query);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#171a1e] hover:bg-[#20242a] border border-white/5 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Clock className="w-3.5 h-3.5 text-gold-400/75 shrink-0" />
                      <span className="text-sm text-[#f3f0e9] truncate">{entry.query}</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#9a9da3] shrink-0">{entry.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#9a9da3] mb-2">
              Bookmarked Results
            </div>

            {savedResults.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#9a9da3]">
                {user
                  ? 'No saved results yet. Click the bookmark icon on any result to save it here.'
                  : 'Sign in above to save and access your bookmarked results across sessions.'}
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {savedResults.map((saved) => (
                  <div
                    key={saved.url}
                    className="flex items-start justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#171a1e] border border-white/5"
                  >
                    <a
                      href={saved.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 group"
                    >
                      <div className="text-sm font-medium text-gold-200 group-hover:underline truncate">
                        {saved.title}
                      </div>
                      <div className="text-[11px] font-mono text-[#9a9da3] truncate">
                        {saved.domain || saved.url}
                      </div>
                    </a>
                    <button
                      type="button"
                      onClick={() => onRemoveSaved(saved.url)}
                      title="Remove bookmark"
                      className="p-1 rounded-lg text-[#9a9da3] hover:text-rose-300 hover:bg-white/5 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Cinematic Video Player Modal (YouTube Embed + HTML5 Controls)
// =============================================================================
interface VideoPlayerModalProps {
  video: PendulumVideoItem | null;
  relatedVideos: PendulumVideoItem[];
  onClose: () => void;
  onSelectVideo: (v: PendulumVideoItem) => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  video,
  relatedVideos,
  onClose,
  onSelectVideo
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [speed, setSpeed] = useState('1');
  const [selectedQualityUrl, setSelectedQualityUrl] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [timeText, setTimeText] = useState('0:00 / 0:00');

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setTimeText('0:00 / 0:00');
    setSelectedQualityUrl(video?.qualities?.[0]?.url || video?.mediaUrl || '');
  }, [video?.id]);

  if (!video) return null;

  const fmt = (sec: number) => {
    if (!Number.isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const handleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handlePiP = () => {
    const el = videoRef.current as any;
    if (el && document.pictureInPictureEnabled && el.requestPictureInPicture) {
      el.requestPictureInPicture().catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#0e1014] border border-gold-400/30 shadow-obsidian-elevated grid grid-cols-1 lg:grid-cols-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Player Stage */}
        <div className="lg:col-span-2 p-4 sm:p-5 flex flex-col">
          <div ref={stageRef} className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10">
            {(video.playerType === 'youtube' || video.playerType === 'iframe' || (!video.mediaUrl && Boolean(video.embedUrl))) && video.embedUrl ? (
              <iframe
                key={video.id}
                src={video.embedUrl}
                title={video.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={selectedQualityUrl || video.mediaUrl || video.watchUrl}
                  poster={video.thumbnailUrl}
                  className="w-full h-full object-contain"
                  playsInline
                  onClick={togglePlay}
                  onTimeUpdate={() => {
                    const el = videoRef.current;
                    if (!el || !el.duration) return;
                    setProgress((el.currentTime / el.duration) * 100);
                    setTimeText(`${fmt(el.currentTime)} / ${fmt(el.duration)}`);
                  }}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
                {/* Custom HTML5 Controls */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 space-y-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={progress}
                    onChange={(e) => {
                      const el = videoRef.current;
                      if (!el || !el.duration) return;
                      const pct = Number(e.target.value);
                      el.currentTime = (pct / 100) * el.duration;
                      setProgress(pct);
                    }}
                    className="w-full accent-[#d2b477] h-1 cursor-pointer"
                  />
                  <div className="flex items-center justify-between gap-2 text-xs text-white">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={togglePlay} className="p-1.5 rounded-lg hover:bg-white/10">
                        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!videoRef.current) return;
                          const nextMuted = !muted;
                          videoRef.current.muted = nextMuted;
                          setMuted(nextMuted);
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/10"
                      >
                        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setVolume(v);
                          if (videoRef.current) {
                            videoRef.current.volume = v;
                            videoRef.current.muted = v === 0;
                          }
                          setMuted(v === 0);
                        }}
                        className="w-16 accent-[#d2b477] hidden sm:block"
                      />
                      <span className="font-mono text-[11px] tabular-nums text-[#c5c7ca]">{timeText}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {video.qualities && video.qualities.length > 1 && (
                        <select
                          value={selectedQualityUrl}
                          onChange={(e) => setSelectedQualityUrl(e.target.value)}
                          aria-label="Video quality"
                          className="bg-obsidian-900 border border-white/15 rounded-lg px-2 py-1 text-[11px] font-mono text-gold-200"
                        >
                          {video.qualities.map((q) => (
                            <option key={q.url} value={q.url}>
                              {q.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <select
                        value={speed}
                        onChange={(e) => {
                          setSpeed(e.target.value);
                          if (videoRef.current) videoRef.current.playbackRate = Number(e.target.value);
                        }}
                        className="bg-obsidian-900 border border-white/15 rounded-lg px-2 py-1 text-[11px] font-mono text-gold-200"
                      >
                        <option value="0.75">0.75x</option>
                        <option value="1">1x</option>
                        <option value="1.25">1.25x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2">2x</option>
                      </select>
                      <button type="button" onClick={handlePiP} className="p-1.5 rounded-lg hover:bg-white/10" title="Picture-in-Picture">
                        <PictureInPicture2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={handleFullscreen} className="p-1.5 rounded-lg hover:bg-white/10" title="Fullscreen">
                        <Maximize className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="font-display font-bold text-lg text-[#f3f0e9] leading-snug">{video.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#9a9da3] font-mono">
                <span className="text-gold-300 inline-flex items-center gap-1">
                  <span>{video.publisher || video.sourceDomain || 'Verified Publisher'}</span>
                  {video.verifiedChannel && <CheckCircle2 className="w-3.5 h-3.5 text-gold-400" />}
                </span>
                {video.sourceProvider && <span>· {video.sourceProvider}</span>}
                {video.duration && <span>· {video.duration}</span>}
                {video.views && <span>· {video.views}</span>}
                {video.publishedTime && <span>· {video.publishedTime}</span>}
                {!video.publishedTime && video.publishedAt && <span>· {new Date(video.publishedAt).toLocaleDateString()}</span>}
              </div>
              {video.description && (
                <p className="mt-2.5 text-sm text-[#c5c7ca] leading-relaxed line-clamp-3">{video.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={video.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-[#171a1e] hover:bg-[#20242a] border border-white/15 text-xs font-medium text-gold-200 flex items-center gap-1.5"
              >
                <span>Open Source</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9da3] hover:text-white hover:bg-white/5"
                aria-label="Close video player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Related Videos Column */}
        <div className="border-t lg:border-t-0 lg:border-l border-white/10 p-4 space-y-3 bg-[#111316]/60">
          <div className="text-xs font-mono uppercase tracking-[0.12em] text-[#9a9da3]">
            Related Videos
          </div>
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {relatedVideos.filter((rv) => rv.id !== video.id).slice(0, 8).map((rv) => (
              <button
                key={rv.id}
                type="button"
                onClick={() => onSelectVideo(rv)}
                className="w-full flex items-start gap-2.5 p-2 rounded-xl hover:bg-white/[0.04] text-left transition-colors"
              >
                <div className="w-24 aspect-video rounded-lg bg-obsidian-950 border border-white/10 overflow-hidden shrink-0">
                  {rv.thumbnailUrl && (
                    <img src={rv.thumbnailUrl} alt={rv.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[#f3f0e9] line-clamp-2">{rv.title}</div>
                  <div className="mt-1 text-[11px] font-mono text-[#9a9da3] truncate">
                    {rv.publisher || rv.sourceDomain}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Immersive Image Viewer Modal
// =============================================================================
interface ImageViewerModalProps {
  image: PendulumImageItem | null;
  allImages: PendulumImageItem[];
  onClose: () => void;
  onSelectImage: (img: PendulumImageItem) => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  image,
  allImages,
  onClose,
  onSelectImage
}) => {
  const [copied, setCopied] = useState(false);
  const [useThumbnailFallback, setUseThumbnailFallback] = useState(false);

  useEffect(() => {
    setUseThumbnailFallback(false);
  }, [image?.id]);

  if (!image) return null;

  const currentIdx = allImages.findIndex((i) => i.id === image.id);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < allImages.length - 1;
  const rawProvider = image.sourceProvider || image.provider || 'Web Index';
  const providerLabel = rawProvider === 'DuckDuckGo' ? 'Web Index' : rawProvider;
  const activeSrc = useThumbnailFallback
    ? (image.thumbnailUrl || image.originalUrl)
    : (image.originalUrl || image.thumbnailUrl);

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(image.originalUrl || image.sourceUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/88 backdrop-blur-md p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-2xl bg-[#0e1014] border border-gold-400/30 shadow-obsidian-elevated overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="text-sm font-semibold text-[#f3f0e9] truncate pr-4">{image.title}</div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9da3] hover:text-white hover:bg-white/5"
            aria-label="Close image viewer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative bg-[#07080a] flex items-center justify-center min-h-[280px] max-h-[65vh] p-4">
          {hasPrev && (
            <button
              type="button"
              onClick={() => onSelectImage(allImages[currentIdx - 1])}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/70 border border-white/15 flex items-center justify-center text-white hover:border-gold-400"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <img
            src={activeSrc}
            alt={image.title}
            referrerPolicy="no-referrer"
            onError={() => {
              if (!useThumbnailFallback && image.thumbnailUrl && activeSrc !== image.thumbnailUrl) {
                setUseThumbnailFallback(true);
              }
            }}
            className="max-h-[58vh] max-w-full object-contain rounded-lg"
          />
          {hasNext && (
            <button
              type="button"
              onClick={() => onSelectImage(allImages[currentIdx + 1])}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/70 border border-white/15 flex items-center justify-center text-white hover:border-gold-400"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/10 bg-[#111316]">
          <div className="text-xs text-[#9a9da3] space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
              <span className="text-gold-200">{image.domain || providerLabel}</span>
              <span>· Via {providerLabel}</span>
              {image.creator && image.creator !== image.domain && <span>· Creator: {image.creator}</span>}
              {image.license && <span>· {image.license}</span>}
              {image.width && image.height && <span>· {image.width}×{image.height}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={copySource}
              className="px-3 py-1.5 rounded-xl bg-[#171a1e] hover:bg-[#20242a] border border-white/10 text-xs text-[#e8e5de] flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#a9c6a5]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy URL'}</span>
            </button>
            <a
              href={image.sourceUrl || image.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-b from-gold-200 to-gold-400 text-[#090a0c] text-xs font-semibold flex items-center gap-1.5"
            >
              <span>Visit Source</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
