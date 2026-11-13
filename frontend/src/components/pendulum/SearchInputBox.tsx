import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Mic, MicOff, ArrowRight, Clock, Sparkles, Image as ImageIcon } from 'lucide-react';
import { fetchSuggestionsAPI } from '../../services/api';

interface SearchInputBoxProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (query: string) => void;
  variant?: 'hero' | 'compact';
  placeholder?: string;
  autoFocus?: boolean;
  recentQueries?: string[];
  enableImageHelper?: boolean;
}

export const SearchInputBox: React.FC<SearchInputBoxProps> = ({
  value,
  onChange,
  onSubmit,
  variant = 'hero',
  placeholder = 'Search the web, ask July AI, or explore places...',
  autoFocus = false,
  recentQueries = [],
  enableImageHelper = false
}) => {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(Boolean(SpeechRec));
  }, []);

  // Keyboard "/" focus shortcut
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // Outside click closes dropdown
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Debounced autocomplete suggestions
  useEffect(() => {
    const trimmed = value.trim();
    if (!focused) return;
    if (!trimmed) {
      setSuggestions(recentQueries.slice(0, 6));
      setActiveIndex(-1);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const remote = await fetchSuggestionsAPI(trimmed);
        if (cancelled) return;
        const matchingRecent = recentQueries.filter(
          (r) => r.toLowerCase().includes(trimmed.toLowerCase()) && !remote.includes(r)
        );
        setSuggestions([...matchingRecent.slice(0, 2), ...remote].slice(0, 8));
        setActiveIndex(-1);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, focused, recentQueries]);

  const triggerSubmit = (targetQuery: string) => {
    const q = targetQuery.trim();
    if (!q) return;
    setFocused(false);
    inputRef.current?.blur();
    onSubmit(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Escape') {
      setFocused(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        const chosen = suggestions[activeIndex];
        onChange(chosen);
        triggerSubmit(chosen);
      } else {
        triggerSubmit(value);
      }
    }
  };

  const handleVoiceToggle = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;
      setVoiceNotice(null);
      setIsListening(true);

      rec.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        setIsListening(false);
        if (transcript.trim()) {
          onChange(transcript.trim());
          triggerSubmit(transcript.trim());
        }
      };
      rec.onerror = () => {
        setIsListening(false);
        setVoiceNotice('Voice capture unavailable in this browser context.');
        setTimeout(() => setVoiceNotice(null), 2600);
      };
      rec.onend = () => {
        setIsListening(false);
      };
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cleaned = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if (cleaned) {
      onChange(cleaned);
      triggerSubmit(cleaned);
    }
    e.target.value = '';
  };

  const showDropdown = focused && suggestions.length > 0;
  const isHero = variant === 'hero';

  return (
    <div ref={wrapperRef} className={`relative w-full ${isHero ? 'max-w-[700px]' : 'max-w-[740px]'}`}>
      <div
        className={`flex items-center w-full transition-all border ${
          isHero
            ? 'h-[54px] sm:h-[58px] rounded-[20px] px-4 bg-[#111316]/95 shadow-obsidian-elevated'
            : 'h-[44px] sm:h-[46px] rounded-[14px] px-3.5 bg-[#111316]/95'
        } ${
          focused
            ? 'border-gold-400/75 ring-2 ring-gold-400/15'
            : 'border-white/15 hover:border-gold-400/45'
        }`}
      >
        <Search className={`${isHero ? 'w-5 h-5 mr-3' : 'w-4 h-4 mr-2.5'} text-gold-400/85 shrink-0`} />

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="Search query"
          autoComplete="off"
          className={`flex-1 min-w-0 bg-transparent text-[#f3f0e9] placeholder-[#7d828b] focus:outline-none ${
            isHero ? 'text-[15px] sm:text-base' : 'text-sm'
          }`}
        />

        <div className="flex items-center gap-1 ml-2 shrink-0">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
              title="Clear query"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9da3] hover:text-[#f3f0e9] hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {voiceSupported && (
            <button
              type="button"
              onClick={handleVoiceToggle}
              aria-label={isListening ? 'Stop voice search' : 'Voice search'}
              title={isListening ? 'Listening... Click to stop' : 'Voice search'}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                isListening
                  ? 'text-gold-200 bg-gold-400/20 animate-pulse'
                  : 'text-[#9a9da3] hover:text-gold-300 hover:bg-white/5'
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          {enableImageHelper && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImagePick}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Search by image filename"
                title="Search by image filename"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9da3] hover:text-gold-300 hover:bg-white/5 transition-colors"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => triggerSubmit(value)}
            aria-label="Search"
            title="Search"
            className={`ml-1 rounded-xl flex items-center justify-center font-semibold transition-all shrink-0 ${
              isHero
                ? 'h-9 px-4 bg-gradient-to-b from-gold-200 to-gold-400 text-[#090a0c] hover:brightness-105 text-xs sm:text-sm'
                : 'h-8 px-3 bg-gradient-to-b from-gold-200 to-gold-400 text-[#090a0c] hover:brightness-105 text-xs'
            }`}
          >
            <span className="hidden sm:inline">Search</span>
            <ArrowRight className="w-4 h-4 sm:hidden" />
          </button>
        </div>
      </div>

      {voiceNotice && (
        <div className="mt-1.5 text-[11px] text-gold-300 font-mono px-2">
          {voiceNotice}
        </div>
      )}

      {/* Autocomplete Suggestions Dropdown */}
      {showDropdown && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-2xl bg-[#111316]/98 backdrop-blur-xl border border-gold-400/25 shadow-obsidian-elevated py-2 overflow-hidden"
        >
          {!value.trim() && recentQueries.length > 0 && (
            <div className="px-4 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-[#8d9198]">
              Recent Searches
            </div>
          )}
          {suggestions.map((item, idx) => {
            const isRecent = recentQueries.includes(item) && !value.trim();
            const isActive = idx === activeIndex;
            return (
              <button
                key={`${item}-${idx}`}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(item);
                  triggerSubmit(item);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  isActive ? 'bg-gold-400/15 text-gold-200' : 'text-[#e8e5de] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isRecent ? (
                    <Clock className="w-3.5 h-3.5 text-[#8d9198] shrink-0" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-gold-400/75 shrink-0" />
                  )}
                  <span className="truncate">{item}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[#6f747d] shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
