import React from 'react';
import { Shield, Sparkles, Activity, Layers, Search, Server, MapPin } from 'lucide-react';
import { LocationState } from '../types';

interface HeaderProps {
  currentView: 'search' | 'admin' | 'megacrawler';
  onViewChange: (view: 'search' | 'admin' | 'megacrawler') => void;
  isCrawlerActive?: boolean;
  totalIndexed?: number;
  locationState?: LocationState;
  onOpenLocationModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  isCrawlerActive = true,
  totalIndexed = 0,
  locationState,
  onOpenLocationModal
}) => {
  return (
    <header className="border-b border-obsidian-800 bg-obsidian-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div 
          onClick={() => onViewChange('search')}
          className="flex items-center space-x-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold-400 via-gold-500 to-gold-700 flex items-center justify-center shadow-gold-glow group-hover:scale-105 transition-transform duration-300">
            <span className="font-serif font-black text-obsidian-950 text-xl tracking-tighter">HS</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-serif tracking-widest text-lg font-bold bg-gradient-to-r from-gold-200 via-gold-400 to-gold-300 bg-clip-text text-transparent">
                HS SEARCH
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gold-400/10 text-gold-400 border border-gold-400/20">
                GLOBAL GEOSEARCH
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 tracking-wider">
              HS AI Solutions <span className="text-neutral-600">•</span> Harshan Seliyan
            </p>
          </div>
        </div>

        {/* Center/Right Navigation & Geolocation Pill */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Geolocation Selector Pill */}
          {locationState && onOpenLocationModal && (
            <button
              onClick={onOpenLocationModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-obsidian-900 border border-gold-400/30 hover:border-gold-400 text-xs font-mono text-neutral-200 hover:text-gold-300 transition-all shadow-sm group"
              title="Change Search Location & Spatial Radius"
            >
              <MapPin className={`w-3.5 h-3.5 ${locationState.mode === 'near_me' ? 'text-emerald-400 animate-pulse' : 'text-gold-400 group-hover:scale-110 transition-transform'}`} />
              <span className="font-semibold max-w-[130px] sm:max-w-[180px] truncate">
                {locationState.displayName || 'Worldwide'}
              </span>
              {locationState.mode !== 'worldwide' && locationState.radiusKm && (
                <span className="text-[10px] text-neutral-400 border-l border-obsidian-750 pl-1.5">
                  {locationState.radiusKm} km
                </span>
              )}
            </button>
          )}

          {/* Live Index Counter */}
          <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-obsidian-850 border border-obsidian-750 text-xs text-neutral-300">
            <span className={`w-2 h-2 rounded-full ${isCrawlerActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-neutral-400">Live Index:</span>
            <span className="font-mono text-gold-300 font-semibold">{totalIndexed.toLocaleString()} pages</span>
          </div>

          {/* Navigation Buttons */}
          <button
            onClick={() => onViewChange('search')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentView === 'search'
                ? 'bg-gold-400 text-obsidian-950 font-semibold shadow-gold-glow'
                : 'text-neutral-300 hover:text-white hover:bg-obsidian-850'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search</span>
          </button>

          <button
            onClick={() => onViewChange('megacrawler')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentView === 'megacrawler'
                ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-obsidian-950 font-bold shadow-gold-glow'
                : 'text-gold-300 hover:text-gold-200 hover:bg-gold-500/10 border border-gold-500/20'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-gold-400" />
            <span className="hidden sm:inline">MegaCrawler</span>
          </button>

          <button
            onClick={() => onViewChange('admin')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              currentView === 'admin'
                ? 'bg-gold-400 text-obsidian-950 font-semibold shadow-gold-glow'
                : 'text-neutral-300 hover:text-white hover:bg-obsidian-850'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        </div>
      </div>
    </header>
  );
};
