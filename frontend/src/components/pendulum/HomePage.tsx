import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, SlidersHorizontal, BarChart3, Grid, User, Globe, Image as ImageIcon,
  Play, Newspaper, Compass, BookOpen, Sparkles, Gauge
} from 'lucide-react';
import type {
  AiModelSelection,
  PendulumCategory,
  PendulumUserSettings
} from '../../types';
import { PendulumLogo } from './PendulumLogo';
import { SearchInputBox } from './SearchInputBox';
import { useAuth } from '../../context/AuthContext';

interface HomePageProps {
  settings: PendulumUserSettings;
  recentQueries: string[];
  onSearch: (query: string, category?: PendulumCategory) => void;
  onUpdateSettings: (next: PendulumUserSettings) => void;
  onOpenSettings: () => void;
  onOpenEval: () => void;
  onOpenProfile: () => void;
  onNavigateRoute: (path: string) => void;
}

const CURIOUS_QUERIES = [
  'How does quantum entanglement work?',
  'History of the James Webb Space Telescope',
  'Renewable energy breakthroughs in India',
  'Architecture of modern distributed databases',
  'Tamil Nadu cultural heritage landmarks',
  'CRISPR gene editing clinical milestones'
];

const SHORTCUTS: Array<{ label: string; category: PendulumCategory; icon: React.ReactNode }> = [
  { label: 'All Web', category: 'All', icon: <Globe className="w-3.5 h-3.5 text-gold-400" /> },
  { label: 'Images', category: 'Images', icon: <ImageIcon className="w-3.5 h-3.5 text-gold-400" /> },
  { label: 'Videos', category: 'Videos', icon: <Play className="w-3.5 h-3.5 text-gold-400" /> },
  { label: 'News', category: 'News', icon: <Newspaper className="w-3.5 h-3.5 text-gold-400" /> },
  { label: 'Maps', category: 'Maps', icon: <Compass className="w-3.5 h-3.5 text-gold-400" /> },
  { label: 'Research', category: 'Research', icon: <BookOpen className="w-3.5 h-3.5 text-gold-400" /> }
];

export const HomePage: React.FC<HomePageProps> = ({
  settings,
  recentQueries,
  onSearch,
  onUpdateSettings,
  onOpenSettings,
  onOpenEval,
  onOpenProfile,
  onNavigateRoute
}) => {
  const { user } = useAuth();
  const [draftQuery, setDraftQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PendulumCategory>('All');
  const [appsOpen, setAppsOpen] = useState(false);
  const appsMenuRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    onSearch(trimmed, selectedCategory);
  };

  const handleCurious = () => {
    const pick = CURIOUS_QUERIES[Math.floor(Math.random() * CURIOUS_QUERIES.length)];
    onSearch(pick, 'All');
  };

  return (
    <div className="min-h-screen flex flex-col justify-between text-[#f3f0e9]">
      {/* Top Bar */}
      <header className="h-[72px] px-4 sm:px-8 lg:px-12 flex items-center justify-between border-b border-white/[0.055] bg-[#090a0c]/75 backdrop-blur-md relative z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-200/20 via-obsidian-900 to-obsidian-950 border border-gold-400/40 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gold-400" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <line x1="12" y1="3" x2="12" y2="14" />
              <circle cx="12" cy="17.5" r="3" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <span className="font-display font-bold text-sm tracking-tight text-[#f3f0e9]">Pendulum Search</span>
          <a
            href="https://hs-ai-studio-4i7i.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline text-xs text-[#9a9da3] hover:text-gold-200 transition-colors"
            title="Open HS AI Solutions"
          >
            · HS AI Solutions
          </a>
        </div>

        <nav className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onOpenEval}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#c5c7ca] hover:text-gold-200 hover:bg-white/[0.05] transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5 text-gold-400" />
            <span>Quality Suite</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Search settings"
            title="Search Settings"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#c5c7ca] hover:text-gold-200 hover:bg-white/[0.05] transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Applications Menu */}
          <div ref={appsMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setAppsOpen((v) => !v)}
              aria-label="Pendulum Applications"
              title="Applications"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[#c5c7ca] hover:text-gold-200 hover:bg-white/[0.05] transition-colors"
            >
              <Grid className="w-4 h-4" />
            </button>
            {appsOpen && (
              <div
                onMouseLeave={() => setAppsOpen(false)}
                className="absolute right-0 top-[calc(100%+8px)] w-60 rounded-2xl bg-[#111316]/98 backdrop-blur-xl border border-gold-400/25 shadow-obsidian-elevated p-2 z-50 space-y-1"
              >
                <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-[#8d9198]">
                  Pendulum Suite
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAppsOpen(false);
                    onNavigateRoute('/dashboard');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.05] text-xs text-[#f3f0e9] text-left"
                >
                  <Gauge className="w-4 h-4 text-gold-400" />
                  <div>
                    <div className="font-semibold">Control Center</div>
                    <div className="text-[11px] text-[#9a9da3]">Index health & crawlers</div>
                  </div>
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
                  <div>
                    <div className="font-semibold">HS MegaCrawler</div>
                    <div className="text-[11px] text-[#9a9da3]">Distributed acquisition</div>
                  </div>
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
                  <div>
                    <div className="font-semibold">Acceptance Suite</div>
                    <div className="text-[11px] text-[#9a9da3]">Live ranking checks</div>
                  </div>
                </button>
                <a
                  href="https://hs-ai-studio-4i7i.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setAppsOpen(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.05] text-xs text-[#f3f0e9] text-left"
                >
                  <Sparkles className="w-4 h-4 text-gold-400" />
                  <div>
                    <div className="font-semibold">HS AI Solutions</div>
                    <div className="text-[11px] text-[#9a9da3]">Studio &amp; product suite</div>
                  </div>
                </a>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Search history and workspace"
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
        </nav>
      </header>

      {/* Center Stage */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-[740px] flex flex-col items-center"
        >
          <PendulumLogo variant="hero" />

          <div className="w-full mt-8">
            <SearchInputBox
              value={draftQuery}
              onChange={setDraftQuery}
              onSubmit={(q) => handleSubmit(q)}
              variant="hero"
              autoFocus
              recentQueries={recentQueries}
              enableImageHelper
            />
          </div>

          {/* Primary Search Actions */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleSubmit(draftQuery)}
              className="h-10 px-5 rounded-xl bg-gradient-to-b from-gold-200 to-gold-400 text-[#090a0c] font-semibold text-xs sm:text-sm hover:brightness-105 transition-all"
            >
              Pendulum Search
            </button>
            <button
              type="button"
              onClick={handleCurious}
              className="h-10 px-5 rounded-xl bg-[#111316] hover:bg-[#171a1e] border border-white/10 hover:border-gold-400/45 text-xs sm:text-sm font-medium text-[#e8e5de] flex items-center gap-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-gold-400" />
              <span>I&apos;m Feeling Curious</span>
            </button>
          </div>

          {/* AI Engine Switch & Location Indicator */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs">
            <div className="inline-flex items-center p-1 rounded-xl bg-[#111316] border border-white/10">
              {(['auto', 'july', 'gravity'] as AiModelSelection[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, aiModel: m })}
                  className={`px-3 py-1 rounded-lg font-medium capitalize transition-colors ${
                    settings.aiModel === m
                      ? 'bg-gold-400/15 text-gold-200'
                      : 'text-[#9a9da3] hover:text-[#f3f0e9]'
                  }`}
                >
                  {m === 'auto' ? 'Auto AI' : m === 'july' ? 'July AI' : 'Gravity AI'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenSettings}
              className="h-8 px-3 rounded-xl bg-[#111316] hover:bg-[#171a1e] border border-white/10 text-[#c5c7ca] hover:text-gold-200 flex items-center gap-1.5 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-gold-400" />
              <span>
                {settings.locationEnabled
                  ? `${settings.city || 'Chennai'}, ${settings.country || 'India'}`
                  : 'Global Search'}
              </span>
            </button>
          </div>

          {/* 6 Category Shortcuts */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {SHORTCUTS.map((sc) => {
              const active = selectedCategory === sc.category;
              return (
                <button
                  key={sc.category}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(sc.category);
                    if (draftQuery.trim()) {
                      onSearch(draftQuery.trim(), sc.category);
                    }
                  }}
                  className={`h-9 px-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-gold-400/15 border-gold-400/60 text-gold-200'
                      : 'bg-[#111316]/85 border-white/10 text-[#c5c7ca] hover:border-gold-400/35 hover:text-[#f3f0e9]'
                  }`}
                >
                  {sc.icon}
                  <span>{sc.label}</span>
                </button>
              );
            })}
          </div>

          {/* Enhancement Attribution */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-[#9a9da3]">
            <span className="text-gold-300 font-medium">Enhanced by Pendulum Search</span>
            <span>·</span>
            <a
              href="https://hs-ai-studio-4i7i.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gold-200 transition-colors"
            >
              HS AI Solutions
            </a>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
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
