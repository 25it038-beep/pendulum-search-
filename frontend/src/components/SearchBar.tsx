import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Sparkles, ArrowRight, CornerDownLeft } from 'lucide-react';
import { fetchSuggestionsAPI } from '../services/api';

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  compact?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onQueryChange,
  onSearch,
  compact = false
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut '/' to focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch suggestions with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        const list = await fetchSuggestionsAPI(query);
        setSuggestions(list);
      } else {
        setSuggestions([]);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        const selected = suggestions[selectedIndex];
        onQueryChange(selected);
        onSearch(selected);
      } else {
        onSearch(query);
      }
      setShowSuggestions(false);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onQueryChange(suggestion);
    onSearch(suggestion);
    setShowSuggestions(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-3xl mx-auto">
      <div 
        className={`relative flex items-center w-full rounded-2xl bg-obsidian-900 border transition-all duration-300 ${
          showSuggestions && suggestions.length > 0 ? 'rounded-b-none' : ''
        } ${
          compact
            ? 'border-obsidian-750 hover:border-gold-400/40 focus-within:border-gold-400 focus-within:shadow-gold-glow'
            : 'border-obsidian-750 hover:border-gold-400/50 focus-within:border-gold-400 focus-within:shadow-gold-glow-lg p-1'
        }`}
      >
        <div className="pl-4 pr-2 text-gold-400/80">
          <Search className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setShowSuggestions(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder="Explore the web with HS Search... (Press '/' to focus)"
          className={`w-full bg-transparent text-white placeholder-neutral-500 focus:outline-none font-sans ${
            compact ? 'py-2.5 text-sm' : 'py-3.5 text-base'
          }`}
        />

        {query && (
          <button
            onClick={() => {
              onQueryChange('');
              inputRef.current?.focus();
            }}
            className="p-1.5 mr-1 text-neutral-400 hover:text-white rounded-lg hover:bg-obsidian-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => {
            onSearch(query);
            setShowSuggestions(false);
          }}
          className={`flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 text-obsidian-950 font-semibold transition-all hover:brightness-110 active:scale-95 ${
            compact ? 'px-3 py-1.5 text-xs mr-1' : 'px-5 py-2.5 text-sm mr-1.5'
          }`}
        >
          <span>Search</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Autocomplete Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full bg-obsidian-900 border-x border-b border-obsidian-750 rounded-b-2xl shadow-2xl z-50 overflow-hidden divide-y divide-obsidian-850">
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              onClick={() => handleSuggestionClick(item)}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer text-sm transition-colors ${
                idx === selectedIndex
                  ? 'bg-gold-400/10 text-gold-300 font-medium'
                  : 'text-neutral-300 hover:bg-obsidian-850 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Search className="w-3.5 h-3.5 text-neutral-500" />
                <span>{item}</span>
              </div>
              <CornerDownLeft className="w-3 h-3 text-neutral-600 opacity-60" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
