import React from 'react';
import { ExternalLink, Clock, ShieldCheck, Tag, Sparkles, MapPin, CheckCircle2, Star, Navigation } from 'lucide-react';
import { SearchResultItem } from '../types';
import { SourceBadge } from './SourceBadge';

interface ResultCardProps {
  item: SearchResultItem;
  isSelected?: boolean;
  onViewOnMap?: (id: number) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ 
  item, 
  isSelected = false, 
  onViewOnMap 
}) => {
  const loc = item.location;
  const hasCoordinates = loc && ((typeof loc.lat === 'number' && typeof loc.lon === 'number') || 
                                (loc.coordinates && typeof loc.coordinates.lat === 'number'));

  return (
    <article 
      className={`group mb-5 rounded-2xl bg-obsidian-900 border transition-all duration-300 p-5 ${
        isSelected 
          ? 'border-gold-400 bg-obsidian-850 shadow-gold-glow-lg' 
          : 'border-obsidian-800 hover:border-gold-400/40 hover:bg-obsidian-850/80 hover:shadow-gold-glow'
      }`}
    >
      {/* Top Meta Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center space-x-2">
          {/* Favicon */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=32`}
            alt=""
            className="w-4 h-4 rounded-sm bg-obsidian-800"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span className="text-xs font-mono text-neutral-400 font-medium tracking-wide">
            {item.domain}
          </span>
          <span className="text-neutral-600">•</span>
          <span className="text-[11px] font-mono text-neutral-500 truncate max-w-[220px]">
            {item.url}
          </span>
        </div>

        {/* Badges: Source Type + Distance + Live + Timestamps */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          {/* Source Attribution Badge */}
          <SourceBadge 
            sourceType={item.source_category || item.source_type}
            sourceProvider={item.source_provider}
            sourceAttribution={item.source_attribution}
            originalPublisher={item.original_publisher}
          />

          {/* Distance Badge */}
          {item.distance_str && (
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-gold-400/15 text-gold-300 border border-gold-400/30 font-bold">
              <MapPin className="w-3 h-3 text-gold-400" />
              <span>{item.distance_str}</span>
            </span>
          )}

          {/* Published vs Indexed distinction */}
          {item.published_str && (
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
              <Clock className="w-2.5 h-2.5" />
              <span>Pub: {item.published_str}</span>
            </span>
          )}
          <span className="text-neutral-500 px-1.5 py-0.5 rounded bg-obsidian-950 border border-obsidian-800">
            {item.indexed_str}
          </span>
          {item.is_live && (
            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[9px] font-bold animate-pulse">
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h2 className="text-lg font-medium text-neutral-100 group-hover:text-gold-300 transition-colors mb-2 leading-snug">
        <a 
          href={item.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center space-x-1.5 hover:underline decoration-gold-400/50 underline-offset-4"
        >
          <span>{item.title}</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-gold-400 shrink-0" />
        </a>
      </h2>

      {/* Snippet */}
      <p className="text-sm text-neutral-300 leading-relaxed font-sans mb-3 line-clamp-3">
        {item.snippet}
      </p>

      {/* Geolocation Details Row (if available) */}
      {loc && (loc.address || loc.city || loc.verified_status || loc.rating) && (
        <div className="mb-3 p-2.5 rounded-xl bg-obsidian-950/70 border border-obsidian-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Address / Place Name */}
            {(loc.address || loc.locality || loc.city) && (
              <div className="flex items-center space-x-1 text-neutral-300 font-mono text-[11px]">
                <MapPin className="w-3 h-3 text-gold-400 shrink-0" />
                <span className="truncate max-w-[280px]">
                  {loc.address || [loc.locality, loc.city, loc.state].filter(Boolean).join(', ')}
                </span>
              </div>
            )}

            {/* Verified Operational Status */}
            {loc.verified_status && (
              <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>Verified {loc.verified_status}</span>
              </span>
            )}

            {/* Rating */}
            {loc.rating && (
              <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20 text-[10px] font-mono">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{loc.rating}</span>
                {loc.review_count ? <span className="text-neutral-500">({loc.review_count.toLocaleString()})</span> : null}
              </span>
            )}

            {/* Opening Hours */}
            {loc.operating_hours && (
              <span className="text-[10px] font-mono text-neutral-400">
                ⏰ {loc.operating_hours}
              </span>
            )}
          </div>

          {/* View on Map Button */}
          {hasCoordinates && onViewOnMap && (
            <button
              onClick={() => onViewOnMap(item.id)}
              className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-obsidian-850 hover:bg-gold-400/20 text-gold-400 text-[11px] font-mono transition-colors border border-gold-400/30"
              title="Pinpoint on Global Map"
            >
              <Navigation className="w-3 h-3" />
              <span>Map View</span>
            </button>
          )}
        </div>
      )}

      {/* Embedded Images Preview */}
      {item.images && item.images.length > 0 && (
        <div className="flex items-center space-x-2 mb-3 overflow-x-auto scrollbar-none py-1">
          {item.images.slice(0, 4).map((img, idx) => (
            <div 
              key={idx} 
              className="relative w-24 h-16 rounded-lg overflow-hidden bg-obsidian-950 border border-obsidian-800 shrink-0 group/img"
            >
              <img
                src={img.src}
                alt={img.alt || item.title}
                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLElement).parentElement!.style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Bottom Attributes Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-obsidian-800/80 text-[11px] text-neutral-500 font-mono">
        <div className="flex items-center space-x-3">
          <span className="capitalize px-1.5 py-0.5 rounded bg-obsidian-850 text-neutral-400">
            {item.category}
          </span>
          <span>Relevance: {(item.score * 100).toFixed(0)}%</span>
          {item.geo_score !== undefined && (
            <span className="text-gold-400/80">Geo Match: {(item.geo_score * 100).toFixed(0)}%</span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {item.source_attribution && (
            <span className="text-neutral-500 text-[10px] hidden sm:inline max-w-[320px] truncate">
              {item.source_attribution}
            </span>
          )}
          <span className="text-neutral-500">Credibility:</span>
          <span className="text-gold-400/90 font-semibold">{(item.credibility_score * 100).toFixed(0)}%</span>
        </div>
      </div>
    </article>
  );
};
