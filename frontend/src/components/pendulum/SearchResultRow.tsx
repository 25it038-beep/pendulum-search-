import React, { useState } from 'react';
import { ExternalLink, Copy, Check, MapPin, Globe, ShieldCheck, Bookmark } from 'lucide-react';
import type { PendulumResultItem } from '../../types';
import { trackClickAPI } from '../../services/api';

interface SearchResultRowProps {
  item: PendulumResultItem;
  index: number;
  isSaved?: boolean;
  onToggleSave?: (item: PendulumResultItem) => void;
  onOpenMapItem?: (item: PendulumResultItem) => void;
}

function formatDisplayPath(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split('/').filter(Boolean).slice(0, 3);
    const host = parsed.hostname.replace(/^www\./, '');
    return segments.length > 0 ? `${host} › ${segments.join(' › ')}` : host;
  } catch {
    return rawUrl;
  }
}

function formatPubDate(rawDate?: string | null): string | null {
  if (!rawDate) return null;
  const ms = Date.parse(rawDate);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export const SearchResultRow: React.FC<SearchResultRowProps> = ({ item, isSaved, onToggleSave, onOpenMapItem }) => {
  const [copied, setCopied] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  const pubDate = formatPubDate(item.publishedAt || item.published_str);
  const publisherName = item.officialOrganizationName || item.original_publisher || item.domain || 'Web Source';
  const displayUrl = formatDisplayPath(item.url);
  const isOfficialRoot = Boolean(item.isOfficialWebsite && (item.officialConfidence || 0) >= 0.62);
  const isOfficialSub = Boolean(!isOfficialRoot && item.isOfficialSubpage && (item.officialConfidence || 0) >= 0.62);
  const hasGeoCoords =
    item.location &&
    Number.isFinite(Number(item.location.lat ?? item.location.coordinates?.lat)) &&
    Number.isFinite(Number(item.location.lon ?? item.location.coordinates?.lon));

  const faviconUrl =
    item.favicon ||
    (item.domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.domain)}&sz=32` : '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <article
      className={`group py-4 border-b border-white/[0.06] last:border-b-0 ${
        isOfficialRoot ? 'pl-3 border-l-2 border-l-gold-400/70' : ''
      }`}
    >
      {/* Publisher Identity + Official Verification + Clean Display URL */}
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-full bg-[#171a1e] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
            {faviconUrl && !faviconError ? (
              <img
                src={faviconUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setFaviconError(true)}
                className="w-4 h-4 object-contain"
              />
            ) : (
              <Globe className="w-3.5 h-3.5 text-gold-400/80" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-medium text-[#e8e5de] truncate">
                {publisherName}
              </span>
              {isOfficialRoot && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.09em] text-gold-300 whitespace-nowrap shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-gold-400" />
                  Official Website
                </span>
              )}
              {isOfficialSub && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.09em] text-gold-200/80 whitespace-nowrap shrink-0">
                  <ShieldCheck className="w-3 h-3 text-gold-400/80" />
                  {item.discoveredSubpageType ? `Official · ${item.discoveredSubpageType}` : 'Official Page'}
                </span>
              )}
            </div>
            <div className="text-[11px] font-mono text-[#8b9098] truncate">
              {displayUrl}
            </div>
          </div>
        </div>

        {/* Utility Actions */}
        <div className="flex items-center gap-1 opacity-75 group-hover:opacity-100 transition-opacity shrink-0">
          {hasGeoCoords && onOpenMapItem && (
            <button
              type="button"
              onClick={() => onOpenMapItem(item)}
              title="View on Maps"
              className="px-2 py-1 rounded-lg text-[11px] text-gold-300 hover:bg-gold-400/10 flex items-center gap-1 transition-colors"
            >
              <MapPin className="w-3 h-3" />
              <span className="hidden sm:inline">Map</span>
            </button>
          )}
          {onToggleSave && (
            <button
              type="button"
              onClick={() => onToggleSave(item)}
              title={isSaved ? 'Remove bookmark' : 'Save bookmark'}
              className={`p-1.5 rounded-lg transition-colors ${
                isSaved
                  ? 'text-gold-300 bg-gold-400/10 hover:bg-gold-400/20'
                  : 'text-[#9a9da3] hover:text-gold-200 hover:bg-white/[0.05]'
              }`}
              aria-label={isSaved ? 'Remove saved result' : 'Save result'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy link"
            className="p-1.5 rounded-lg text-[#9a9da3] hover:text-gold-200 hover:bg-white/[0.05] transition-colors"
            aria-label="Copy result link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#a9c6a5]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClickAPI(item.category || 'general')}
            title="Open in new tab"
            className="p-1.5 rounded-lg text-[#9a9da3] hover:text-gold-200 hover:bg-white/[0.05] transition-colors"
            aria-label="Open link in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Primary Clickable Result Title */}
      <h3 className="text-[17px] sm:text-[18px] font-semibold leading-snug">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackClickAPI(item.category || 'general')}
          className="text-gold-200 hover:text-gold-300 hover:underline decoration-gold-400/60 underline-offset-4 transition-colors"
        >
          {item.title}
        </a>
      </h3>

      {/* Snippet */}
      <p className="mt-1.5 text-[14px] leading-[1.6] text-[#c5c7ca]">
        {item.snippet}
      </p>

      {/* Unboxed Clean Metadata Row (Zero-Pill) */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#8d9198] tabular-nums">
        {pubDate && <span>{pubDate}</span>}
        {pubDate && item.sourceLabel && <span>·</span>}
        {item.sourceLabel === 'DuckDuckGo · Pendulum Enhanced' ? (
          <span className="text-gold-300 font-medium">Pendulum Enhanced</span>
        ) : item.sourceLabel === 'DuckDuckGo' ? (
          <span className="text-[#c5c7ca]">Pendulum Web</span>
        ) : (
          item.sourceLabel && <span>{item.sourceLabel}</span>
        )}
        {item.distance_str && (
          <>
            <span>·</span>
            <span className="text-gold-300">{item.distance_str}</span>
          </>
        )}
        {item.location?.address && (
          <>
            <span>·</span>
            <span className="truncate max-w-xs">{item.location.address}</span>
          </>
        )}
      </div>
    </article>
  );
};

export const SearchResultSkeleton: React.FC = () => (
  <div className="py-4 border-b border-white/[0.06] space-y-2.5 animate-pulse">
    <div className="flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-full bg-white/[0.08]" />
      <div className="space-y-1">
        <div className="h-3 w-28 rounded bg-white/[0.08]" />
        <div className="h-2.5 w-44 rounded bg-white/[0.05]" />
      </div>
    </div>
    <div className="h-5 w-3/4 rounded bg-white/[0.09]" />
    <div className="h-3.5 w-full rounded bg-white/[0.06]" />
    <div className="h-3.5 w-5/6 rounded bg-white/[0.05]" />
  </div>
);
