import React from 'react';
import { 
  Globe, Clock, Newspaper, Code2, GraduationCap, 
  Image as ImageIcon, Video, Compass, Radio, ArrowUpDown, Bot,
  List, Map as MapIcon, Columns
} from 'lucide-react';
import { SearchMode, SortOrder } from '../types';

interface ModeSelectorProps {
  currentMode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  currentSort: SortOrder;
  onSortChange: (sort: SortOrder) => void;
  aiMode: string;
  onAiModeChange: (mode: string) => void;
  viewLayout?: 'list' | 'split' | 'map';
  onViewLayoutChange?: (layout: 'list' | 'split' | 'map') => void;
  hasGeoResults?: boolean;
}

const MODES: { id: SearchMode; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'All', icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'latest', label: 'Latest', icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'news', label: 'News', icon: <Newspaper className="w-3.5 h-3.5" /> },
  { id: 'tech', label: 'Tech & Code', icon: <Code2 className="w-3.5 h-3.5" /> },
  { id: 'academic', label: 'Academic', icon: <GraduationCap className="w-3.5 h-3.5" /> },
  { id: 'image', label: 'Images', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'video', label: 'Videos', icon: <Video className="w-3.5 h-3.5" /> },
  { id: 'research', label: 'Research (Gravity)', icon: <Compass className="w-3.5 h-3.5" /> },
  { id: 'realtime', label: 'Live Stream', icon: <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" /> },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onModeChange,
  currentSort,
  onSortChange,
  aiMode,
  onAiModeChange,
  viewLayout = 'list',
  onViewLayoutChange,
  hasGeoResults = false
}) => {
  return (
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between border-b border-obsidian-800 pb-2 mb-6 gap-3">
      {/* Search Modes Tabs */}
      <div className="flex items-center space-x-1 overflow-x-auto w-full lg:w-auto scrollbar-none py-1">
        {MODES.map((m) => {
          const isActive = currentMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-gold-400/15 text-gold-300 border border-gold-400/40 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-obsidian-850'
              }`}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Controls: Layout Toggles + AI Mode & Sort By */}
      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 text-xs">
        {/* Layout Switcher (List / Split / Map) */}
        {onViewLayoutChange && (
          <div className="flex items-center rounded-lg bg-obsidian-900 border border-obsidian-800 p-0.5">
            <button
              onClick={() => onViewLayoutChange('list')}
              className={`p-1.5 rounded-md flex items-center space-x-1 text-xs transition-colors ${
                viewLayout === 'list' 
                  ? 'bg-gold-400/20 text-gold-300 font-medium' 
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => onViewLayoutChange('split')}
              className={`p-1.5 rounded-md flex items-center space-x-1 text-xs transition-colors ${
                viewLayout === 'split' 
                  ? 'bg-gold-400/20 text-gold-300 font-medium' 
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Split View (Results & Map)"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Split</span>
            </button>
            <button
              onClick={() => onViewLayoutChange('map')}
              className={`p-1.5 rounded-md flex items-center space-x-1 text-xs transition-colors ${
                viewLayout === 'map' 
                  ? 'bg-gold-400/20 text-gold-300 font-medium' 
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Full Map View"
            >
              <MapIcon className={`w-3.5 h-3.5 ${hasGeoResults ? 'text-gold-400' : ''}`} />
              <span className="hidden sm:inline">Map</span>
            </button>
          </div>
        )}

        {/* AI Engine Model Selection */}
        <div className="flex items-center space-x-1.5 bg-obsidian-900 border border-obsidian-800 px-2 py-1 rounded-lg text-xs text-neutral-300">
          <Bot className="w-3.5 h-3.5 text-gold-400" />
          <span className="text-neutral-500">AI:</span>
          <select
            value={aiMode}
            onChange={(e) => onAiModeChange(e.target.value)}
            className="bg-transparent text-neutral-200 focus:outline-none cursor-pointer pr-1"
          >
            <option value="auto" className="bg-obsidian-900 text-neutral-200">Auto Selection</option>
            <option value="july" className="bg-obsidian-900 text-neutral-200">July (Fast)</option>
            <option value="gravity" className="bg-obsidian-900 text-neutral-200">Gravity (Deep Research)</option>
            <option value="none" className="bg-obsidian-900 text-neutral-200">Off</option>
          </select>
        </div>

        {/* Sort selector including Location Sorts */}
        <div className="flex items-center space-x-1.5 bg-obsidian-900 border border-obsidian-800 px-2 py-1 rounded-lg text-xs text-neutral-300">
          <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500" />
          <select
            value={currentSort}
            onChange={(e) => onSortChange(e.target.value as SortOrder)}
            className="bg-transparent text-neutral-200 focus:outline-none cursor-pointer"
          >
            <option value="relevance" className="bg-obsidian-900 text-neutral-200">Most Relevant</option>
            <option value="closest" className="bg-obsidian-900 text-neutral-200">Closest First 📍</option>
            <option value="best_rated" className="bg-obsidian-900 text-neutral-200">Best Rated ⭐</option>
            <option value="newest" className="bg-obsidian-900 text-neutral-200">Newest First</option>
            <option value="oldest" className="bg-obsidian-900 text-neutral-200">Oldest First</option>
          </select>
        </div>
      </div>
    </div>
  );
};
