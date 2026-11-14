import { fetchWithTimeout, isBlockedHost, stripHtml } from './duckduckgoProvider';
import { TtlCache } from '../metrics';
import { GLOBAL_PLACES, LOCAL_ENTITIES, haversineKm } from '../geoData';

const videoCache = new TtlCache<any[]>(90_000, 120);
const imageCache = new TtlCache<any[]>(90_000, 120);
const geocodeCache = new TtlCache<any[]>(120_000, 150);
const nearbyCache = new TtlCache<any[]>(120_000, 150);
const metadataCache = new TtlCache<any>(180_000, 150);

export interface VideoSearchItem {
  id: string;
  title: string;
  description: string;
  url: string;
  watchUrl: string;
  sourceUrl: string;
  domain: string;
  sourceDomain: string;
  publisher: string;
  playerType: 'youtube' | 'html5' | 'iframe';
  embedType: 'html5' | 'youtube' | 'iframe';
  mediaUrl?: string;
  videoUrl?: string;
  embedUrl?: string;
  qualities?: Array<{ label: string; url: string; mimeType?: string }>;
  thumbnailUrl?: string;
  mimeType?: string;
  duration?: string;
  durationSec?: number;
  durationStr?: string;
  width?: number;
  height?: number;
  publishedAt?: string | null;
  publishedTime?: string;
  views?: string;
  viewCount?: number;
  verifiedChannel?: boolean;
  embedAllowed?: boolean;
  license?: string;
  sourceProvider: string;
  relevanceScore?: number;
  _origRank?: number;
}

export interface ImageSearchItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  originalUrl: string;
  sourceUrl: string;
  domain: string;
  creator: string;
  license: string;
  licenseUrl?: string;
  downloadPermitted: boolean;
  width?: number;
  height?: number;
  mimeType?: string;
  sourceProvider: 'DuckDuckGo' | 'Bing Web Index' | 'Wikimedia Commons' | 'Openverse';
  provider?: string;
  relevanceScore?: number;
}

export interface MapPlaceItem {
  id: string;
  name: string;
  displayName?: string;
  category: string;
  address: string;
  lat: number;
  lon: number;
  domain: string;
  sourceUrl: string;
  sourceProvider: string;
  distanceKm?: number;
  openingHours?: string;
  website?: string;
  phone?: string;
  details?: Record<string, any>;
}

function formatDuration(seconds?: number): string | undefined {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function extractYouTubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v');
        return v && /^[a-zA-Z0-9_-]{11}$/.test(v) ? v : null;
      }
      const embedMatch = u.pathname.match(/^\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[2];
    }
  } catch {}
  return null;
}

function isPermissiveLicense(licenseName = ''): boolean {
  const l = licenseName.toLowerCase();
  return (
    l.includes('cc') ||
    l.includes('public domain') ||
    l.includes('pd') ||
    l.includes('mit') ||
    l.includes('gpl') ||
    l.includes('free') ||
    l.includes('open') ||
    l.includes('by')
  );
}

const VIDEO_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is', 'are',
  'was', 'were', 'be', 'by', 'with', 'from', 'as', 'about', 'what', 'how', 'why',
  'video', 'videos', 'youtube', 'watch', 'clip', 'clips', 'hd', '4k', 'full', 'movie'
]);

function tokenizeVideoText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !VIDEO_STOPWORDS.has(t));
}

function parseDurationToSeconds(dur?: string): number | undefined {
  if (!dur) return undefined;
  const parts = dur.trim().split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return undefined;
}

function parseViewCountText(viewText?: string): number {
  if (!viewText) return 0;
  const clean = viewText.toLowerCase().replace(/,/g, '').replace(/views?/g, '').trim();
  const compact = clean.match(/^([0-9.]+)\s*([kmb])?$/i);
  if (compact) {
    const n = parseFloat(compact[1]);
    const unit = (compact[2] || '').toLowerCase();
    if (!Number.isFinite(n)) return 0;
    if (unit === 'b') return Math.round(n * 1_000_000_000);
    if (unit === 'm') return Math.round(n * 1_000_000);
    if (unit === 'k') return Math.round(n * 1_000);
    return Math.round(n);
  }
  const digits = clean.replace(/[^0-9]/g, '');
  const n = digits ? parseInt(digits, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function collectYouTubeVideoRenderers(node: any, out: any[], visited = new Set<any>()): void {
  if (!node || typeof node !== 'object' || visited.has(node)) return;
  visited.add(node);

  if (Array.isArray(node)) {
    for (const el of node) {
      collectYouTubeVideoRenderers(el, out, visited);
    }
    return;
  }

  if (node.videoRenderer && typeof node.videoRenderer === 'object' && node.videoRenderer.videoId) {
    out.push(node.videoRenderer);
    return;
  }

  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') {
      collectYouTubeVideoRenderers(val, out, visited);
    }
  }
}

export function parseYouTubeSearchHtml(html: string): Array<{
  videoId: string;
  title: string;
  channel: string;
  verifiedChannel: boolean;
  duration?: string;
  durationSec?: number;
  views?: string;
  viewCount: number;
  publishedTime?: string;
  snippet: string;
  thumbnailUrl: string;
  isShorts: boolean;
  isLive: boolean;
}> {
  const results: Array<{
    videoId: string;
    title: string;
    channel: string;
    verifiedChannel: boolean;
    duration?: string;
    durationSec?: number;
    views?: string;
    viewCount: number;
    publishedTime?: string;
    snippet: string;
    thumbnailUrl: string;
    isShorts: boolean;
    isLive: boolean;
  }> = [];

  const markers = ['var ytInitialData = ', 'window["ytInitialData"] = ', 'ytInitialData = '];
  let data: any = null;
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const start = idx + marker.length;
    const endCandidates = [
      html.indexOf(';</script>', start),
      html.indexOf(';\n</script>', start),
      html.indexOf(';</', start)
    ].filter((n) => n > start);
    if (endCandidates.length === 0) continue;
    const end = Math.min(...endCandidates);
    try {
      data = JSON.parse(html.slice(start, end));
      if (data) break;
    } catch {}
  }

  if (!data) return results;

  const renderers: any[] = [];
  collectYouTubeVideoRenderers(
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents || data?.contents || data,
    renderers
  );

  const seenIds = new Set<string>();
  for (const v of renderers) {
    const videoId = String(v?.videoId || '').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId) || seenIds.has(videoId)) continue;
    seenIds.add(videoId);

    const title = (v.title?.runs?.map((r: any) => r.text).join('') || v.title?.simpleText || '').trim();
    if (!title) continue;

    const channel = (
      v.ownerText?.runs?.[0]?.text ||
      v.longBylineText?.runs?.[0]?.text ||
      v.shortBylineText?.runs?.[0]?.text ||
      'YouTube Creator'
    ).trim();

    const verifiedChannel = Boolean(
      Array.isArray(v.ownerBadges) &&
        v.ownerBadges.some((b: any) =>
          /VERIFIED|OFFICIAL/i.test(String(b?.metadataBadgeRenderer?.style || b?.metadataBadgeRenderer?.tooltip || ''))
        )
    );

    const isLive = Boolean(
      Array.isArray(v.badges) &&
        v.badges.some((b: any) => /LIVE/i.test(String(b?.metadataBadgeRenderer?.label || '')))
    );

    const duration = (v.lengthText?.simpleText || (isLive ? 'LIVE' : undefined))?.trim();
    const durationSec = duration && duration !== 'LIVE' ? parseDurationToSeconds(duration) : undefined;
    const viewsRaw = (v.shortViewCountText?.simpleText || v.viewCountText?.simpleText || '').trim();
    const viewsExact = (v.viewCountText?.simpleText || viewsRaw).trim();
    const viewCount = parseViewCountText(viewsExact || viewsRaw);
    const publishedTime = (v.publishedTimeText?.simpleText || '').trim() || undefined;

    const snippet = (
      v.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join('') ||
      v.descriptionSnippet?.runs?.map((r: any) => r.text).join('') ||
      ''
    ).trim();

    const navUrl = String(v.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '');
    const isShorts = navUrl.includes('/shorts/') || /#shorts\b/i.test(title) || (typeof durationSec === 'number' && durationSec <= 58);

    const thumbs = Array.isArray(v.thumbnail?.thumbnails) ? v.thumbnail.thumbnails : [];
    const bestThumb = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    results.push({
      videoId,
      title,
      channel,
      verifiedChannel,
      duration,
      durationSec,
      views: viewsRaw || undefined,
      viewCount,
      publishedTime,
      snippet,
      thumbnailUrl: bestThumb,
      isShorts,
      isLive
    });
  }

  return results;
}

export function scoreAndRankVideos(items: VideoSearchItem[], query: string, limit: number): VideoSearchItem[] {
  const qLower = query.toLowerCase().replace(/\b(videos?|youtube|watch|clips?)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const qTokens = tokenizeVideoText(query);
  const wantsShorts = /\b(shorts?|reel|reels|clip)\b/i.test(query);

  const scored = items
    .map((item, idx) => {
      const titleLower = item.title.toLowerCase();
      const descLower = (item.description || '').toLowerCase();
      const pubLower = (item.publisher || '').toLowerCase();
      const titleTokens = new Set(tokenizeVideoText(item.title));
      const allTokens = new Set(tokenizeVideoText(`${item.title} ${item.publisher} ${item.description}`));

      let titleHits = 0;
      let anyHits = 0;
      for (const qt of qTokens) {
        if (titleTokens.has(qt) || titleLower.includes(qt)) titleHits++;
        if (allTokens.has(qt) || `${titleLower} ${pubLower} ${descLower}`.includes(qt)) anyHits++;
      }

      const titleCoverage = qTokens.length > 0 ? titleHits / qTokens.length : 1;
      const overallCoverage = qTokens.length > 0 ? anyHits / qTokens.length : 1;
      const exactTitlePhrase = Boolean(qLower.length >= 3 && titleLower.includes(qLower));
      const exactAllPhrase = Boolean(qLower.length >= 3 && `${titleLower} ${pubLower} ${descLower}`.includes(qLower));

      // Strict off-topic rejection for supplemental non-YouTube sources
      if (item.playerType !== 'youtube' && qTokens.length >= 2 && overallCoverage < 0.55 && !exactAllPhrase) {
        return null;
      }
      if (item.playerType !== 'youtube' && qTokens.length === 1 && overallCoverage === 0) {
        return null;
      }
      // Also drop clearly unrelated YouTube hits on multi-term queries if zero terms match
      if (item.playerType === 'youtube' && qTokens.length >= 2 && overallCoverage < 0.25 && !exactAllPhrase) {
        return null;
      }

      let score = 0;
      score += titleCoverage * 0.42;
      score += overallCoverage * 0.20;
      if (exactTitlePhrase) score += 0.22;
      else if (exactAllPhrase) score += 0.10;

      // Primary YouTube quality & authority signals
      if (item.playerType === 'youtube') {
        score += 0.28;
        const rankIdx = typeof item._origRank === 'number' ? item._origRank : idx;
        score += 0.18 * (1 / (1 + 0.12 * rankIdx));
        if (item.verifiedChannel) score += 0.08;
        if (item.viewCount && item.viewCount > 0) {
          score += Math.min(0.14, Math.log10(item.viewCount + 1) * 0.018);
        }
        if (typeof item.durationSec === 'number') {
          if (!wantsShorts && item.durationSec < 55) score -= 0.14;
          else if (item.durationSec >= 120 && item.durationSec <= 7200) score += 0.06;
        }
      } else if (item.playerType === 'html5') {
        score += 0.08;
        if (item.height && item.height >= 720) score += 0.05;
      } else {
        score += 0.02;
      }

      if (item.embedAllowed === false) score -= 0.50;

      const copy: VideoSearchItem = {
        ...item,
        relevanceScore: Math.round(score * 1000) / 1000
      };
      delete copy._origRank;
      return copy;
    })
    .filter((v): v is VideoSearchItem => v !== null);

  scored.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  const seen = new Set<string>();
  const finalList: VideoSearchItem[] = [];
  for (const v of scored) {
    if (seen.has(v.watchUrl)) continue;
    seen.add(v.watchUrl);
    finalList.push(v);
    if (finalList.length >= limit) break;
  }
  return finalList;
}

// ---------------------------------------------------------------------------
// 1. VideoSearchProvider (YouTube Primary + Wikimedia Commons + Internet Archive)
// ---------------------------------------------------------------------------
export class VideoSearchProvider {
  async search(query: string, limit = 16): Promise<{ items: VideoSearchItem[]; errors: string[]; partial: boolean }> {
    const clean = query.trim();
    if (!clean) return { items: [], errors: [], partial: false };

    const cacheKey = `${clean.toLowerCase()}:${limit}`;
    const cached = videoCache.get(cacheKey);
    if (cached) return { items: cached, errors: [], partial: false };

    const items: VideoSearchItem[] = [];
    const errors: string[] = [];
    const tasks: Array<Promise<void>> = [];

    // Direct YouTube URL query support via official YouTube oEmbed
    const directYt = extractYouTubeId(clean);
    if (directYt) {
      tasks.push(
        (async () => {
          try {
            const watchUrl = `https://www.youtube.com/watch?v=${directYt}`;
            const oe = await fetchWithTimeout(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {}, 3000);
            if (oe.ok) {
              const info: any = await oe.json();
              items.push({
                id: `yt-${directYt}`,
                title: info.title || 'YouTube Video',
                description: `Official embedded YouTube video by ${info.author_name || 'Creator'}.`,
                url: watchUrl,
                watchUrl,
                sourceUrl: watchUrl,
                domain: 'youtube.com',
                sourceDomain: 'youtube.com',
                publisher: info.author_name || 'YouTube',
                playerType: 'youtube',
                embedType: 'youtube',
                embedUrl: `https://www.youtube-nocookie.com/embed/${directYt}?autoplay=1&rel=0&enablejsapi=1`,
                thumbnailUrl: info.thumbnail_url || `https://i.ytimg.com/vi/${directYt}/hqdefault.jpg`,
                embedAllowed: true,
                sourceProvider: 'YouTube',
                _origRank: 0
              });
            }
          } catch (e: any) {
            errors.push(`YouTube oEmbed: ${e?.message || 'failed'}`);
          }
        })()
      );
    } else {
      // Primary YouTube Search (direct ytInitialData JSON + embeddability verification)
      tasks.push(
        (async () => {
          try {
            const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(clean)}`;
            const res = await fetchWithTimeout(
              ytSearchUrl,
              {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                  'Accept-Language': 'en-US,en;q=0.9'
                }
              },
              4200
            );
            if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`);
            const html = await res.text();
            const parsedYt = parseYouTubeSearchHtml(html).slice(0, Math.max(limit + 4, 16));

            // Fast parallel oEmbed embeddability check for top 10 candidates
            const topForVerify = parsedYt.slice(0, 10);
            const verifyChecks = await Promise.allSettled(
              topForVerify.map(async (v) => {
                const watchUrl = `https://www.youtube.com/watch?v=${v.videoId}`;
                const oe = await fetchWithTimeout(
                  `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
                  {},
                  1600
                );
                if (oe.status === 401 || oe.status === 403 || oe.status === 404) {
                  return { id: v.videoId, allowed: false };
                }
                return { id: v.videoId, allowed: true };
              })
            );

            const disallowedIds = new Set<string>();
            for (const chk of verifyChecks) {
              if (chk.status === 'fulfilled' && chk.value.allowed === false) {
                disallowedIds.add(chk.value.id);
              }
            }

            parsedYt.forEach((v, idx) => {
              if (disallowedIds.has(v.videoId)) return;
              const watchUrl = `https://www.youtube.com/watch?v=${v.videoId}`;
              const descParts = [
                v.snippet,
                [v.views, v.publishedTime].filter(Boolean).join(' · ')
              ].filter(Boolean);

              items.push({
                id: `yt-${v.videoId}`,
                title: v.title,
                description: descParts.join(' — ').slice(0, 280) || `Watch ${v.title} by ${v.channel} on YouTube.`,
                url: watchUrl,
                watchUrl,
                sourceUrl: watchUrl,
                domain: 'youtube.com',
                sourceDomain: 'youtube.com',
                publisher: v.channel,
                playerType: 'youtube',
                embedType: 'youtube',
                embedUrl: `https://www.youtube-nocookie.com/embed/${v.videoId}?autoplay=1&rel=0&enablejsapi=1`,
                thumbnailUrl: v.thumbnailUrl,
                duration: v.duration,
                durationSec: v.durationSec,
                durationStr: v.duration,
                views: v.views,
                viewCount: v.viewCount,
                publishedTime: v.publishedTime,
                verifiedChannel: v.verifiedChannel,
                embedAllowed: true,
                sourceProvider: 'YouTube',
                _origRank: idx
              });
            });
          } catch (e: any) {
            errors.push(`YouTube Search: ${e?.message || 'failed'}`);
          }
        })()
      );
    }

    // Wikimedia Commons Video Search (open HTML5 WebM / OGV / MP4, relevance filtered)
    tasks.push(
      (async () => {
        try {
          const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(`${clean} filetype:video`)}&gsrlimit=8&prop=imageinfo&iiprop=url|size|mime|extmetadata|mediatype&iiurlwidth=640&format=json`;
          const res = await fetchWithTimeout(url, {}, 3400);
          if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
          const data: any = await res.json();
          const pages = Object.values(data?.query?.pages || {}) as any[];
          for (const p of pages) {
            const info = p?.imageinfo?.[0];
            if (!info?.url) continue;
            const mime = String(info.mime || '');
            const isVideo = mime.startsWith('video/') || /\.(webm|ogv|mp4)$/i.test(info.url);
            if (!isVideo) continue;
            const title = String(p.title || 'Wikimedia Video').replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
            const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}`;
            const meta = info.extmetadata || {};
            const artist = stripHtml(meta.Artist?.value || 'Wikimedia Commons Contributor');
            const desc = stripHtml(meta.ImageDescription?.value || `Openly licensed video on Wikimedia Commons (${mime}).`);
            const license = stripHtml(meta.LicenseShortName?.value || 'Creative Commons / Public Domain');
            const durationSec = typeof info.duration === 'number' ? info.duration : undefined;
            const durationFmt = formatDuration(durationSec);

            items.push({
              id: `wm-vid-${p.pageid || title.slice(0, 12)}`,
              title,
              description: desc.slice(0, 260),
              url: pageUrl,
              watchUrl: pageUrl,
              sourceUrl: pageUrl,
              domain: 'commons.wikimedia.org',
              sourceDomain: 'commons.wikimedia.org',
              publisher: artist.slice(0, 80) || 'Wikimedia Commons',
              playerType: 'html5',
              embedType: 'html5',
              mediaUrl: info.url,
              videoUrl: info.url,
              qualities: [{ label: `${info.height ? `${info.height}p` : 'Original'} (${mime.split('/')[1] || 'video'})`, url: info.url, mimeType: mime }],
              thumbnailUrl: info.thumburl || undefined,
              mimeType: mime,
              duration: durationFmt,
              durationSec,
              durationStr: durationFmt,
              width: info.width,
              height: info.height,
              publishedAt: info.timestamp || null,
              license,
              embedAllowed: true,
              sourceProvider: 'Wikimedia Commons'
            });
          }
        } catch (e: any) {
          errors.push(`Wikimedia Videos: ${e?.message || 'failed'}`);
        }
      })()
    );

    // Optional SearXNG video engine supplement (if SEARXNG_URL configured)
    const searxUrl = process.env.SEARXNG_URL?.trim();
    if (searxUrl && !isBlockedHost(searxUrl)) {
      tasks.push(
        (async () => {
          try {
            const endpoint = `${searxUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(clean)}&categories=videos&format=json`;
            const res = await fetchWithTimeout(endpoint, {}, 3000);
            if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
            const data: any = await res.json();
            for (const r of (data?.results || []).slice(0, 8)) {
              if (!r?.url || isBlockedHost(r.url)) continue;
              const ytId = extractYouTubeId(r.url);
              if (ytId) {
                items.push({
                  id: `yt-${ytId}`,
                  title: String(r.title || 'YouTube Video'),
                  description: stripHtml(String(r.content || '')).slice(0, 240),
                  url: r.url,
                  watchUrl: r.url,
                  sourceUrl: r.url,
                  domain: 'youtube.com',
                  sourceDomain: 'youtube.com',
                  publisher: String(r.author || 'YouTube'),
                  playerType: 'youtube',
                  embedType: 'youtube',
                  embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&enablejsapi=1`,
                  thumbnailUrl: r.thumbnail || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
                  duration: r.length || undefined,
                  durationStr: r.length || undefined,
                  publishedAt: r.publishedDate || null,
                  embedAllowed: true,
                  sourceProvider: 'YouTube'
                });
              }
            }
          } catch (e: any) {
            errors.push(`SearXNG Video: ${e?.message || 'failed'}`);
          }
        })()
      );
    }

    await Promise.allSettled(tasks);

    const ranked = scoreAndRankVideos(items, clean, limit);

    if (ranked.length > 0) {
      videoCache.set(cacheKey, ranked);
    }
    return { items: ranked, errors, partial: errors.length > 0 && ranked.length > 0 };
  }
}

// ---------------------------------------------------------------------------
// 2. ImageSearchProvider (DuckDuckGo Primary + Wikimedia Commons & Openverse)
// ---------------------------------------------------------------------------
const DDG_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ddgVqdCache = new TtlCache<string>(240_000, 120);

const IMAGE_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'and', 'or', 'is', 'are',
  'images', 'image', 'photos', 'photo', 'pictures', 'picture', 'pics', 'hd', 'wallpaper', 'wallpapers'
]);

function extractImageQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !IMAGE_STOPWORDS.has(t));
}

function stableImageHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function fetchDuckDuckGoImageVqd(query: string, forceRefresh = false): Promise<string> {
  const key = query.toLowerCase();
  if (!forceRefresh) {
    const cached = ddgVqdCache.get(key);
    if (cached) return cached;
  }

  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        'User-Agent': DDG_BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    },
    4500
  );

  if (!res.ok) {
    throw new Error(`DuckDuckGo VQD HTTP ${res.status}`);
  }

  const html = await res.text();
  const match =
    html.match(/vqd=["']?([0-9-]+)["']?/) ||
    html.match(/vqd=([^"&'\s]+)/);
  if (!match?.[1]) {
    throw new Error('DuckDuckGo VQD token not found');
  }

  ddgVqdCache.set(key, match[1]);
  return match[1];
}

export function normalizeAndRankDuckDuckGoImages(
  rawResults: any[],
  query: string
): ImageSearchItem[] {
  const tokens = extractImageQueryTokens(query);
  const queryLower = query.toLowerCase().trim();
  const seenUrls = new Set<string>();
  const scored: Array<{ item: ImageSearchItem; score: number }> = [];

  for (let idx = 0; idx < rawResults.length; idx++) {
    const raw = rawResults[idx];
    const originalUrl = String(raw?.image || '').trim();
    if (!originalUrl || isBlockedHost(originalUrl)) continue;

    const canonical = originalUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
    if (seenUrls.has(canonical)) continue;
    seenUrls.add(canonical);

    const thumbnailRaw = String(raw?.thumbnail || '').trim();
    const thumbnailUrl =
      thumbnailRaw && !isBlockedHost(thumbnailRaw) && /^https?:\/\//i.test(thumbnailRaw)
        ? thumbnailRaw
        : originalUrl;

    const sourceUrlRaw = String(raw?.url || '').trim();
    const sourceUrl =
      sourceUrlRaw && !isBlockedHost(sourceUrlRaw) && /^https?:\/\//i.test(sourceUrlRaw)
        ? sourceUrlRaw
        : originalUrl;

    let domain = 'duckduckgo.com';
    try {
      domain = new URL(sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      try {
        domain = new URL(originalUrl).hostname.replace(/^www\./, '');
      } catch {}
    }

    const title = stripHtml(String(raw?.title || query)).slice(0, 180) || query;
    const width = typeof raw?.width === 'number' && raw.width > 0 ? raw.width : undefined;
    const height = typeof raw?.height === 'number' && raw.height > 0 ? raw.height : undefined;
    const encoding = String(raw?.encoding_format || '').trim().toLowerCase();
    const mimeType = encoding ? `image/${encoding === 'jpg' ? 'jpeg' : encoding}` : 'image/jpeg';

    // Pendulum relevance & quality scoring on top of DuckDuckGo native order
    let score = Math.max(0, 100 - idx) * 0.45;
    const titleLower = title.toLowerCase();
    const domainLower = domain.toLowerCase();

    if (queryLower && titleLower.includes(queryLower)) {
      score += 24;
    }
    let matchedTokens = 0;
    for (const tok of tokens) {
      if (titleLower.includes(tok)) {
        matchedTokens += 1;
        score += 14;
      } else if (domainLower.includes(tok)) {
        matchedTokens += 1;
        score += 10;
      }
    }
    if (tokens.length > 0 && matchedTokens === 0) {
      score -= 12;
    }
    if (width && height) {
      if (width >= 600 && height >= 400) score += 10;
      else if (width < 150 || height < 150) score -= 24;
    }
    if (originalUrl.startsWith('https://')) {
      score += 4;
    }

    const item: ImageSearchItem = {
      id: `ddg-img-${idx}-${stableImageHash(originalUrl)}`,
      title,
      description: `Image via DuckDuckGo from ${domain}${width && height ? ` (${width}×${height})` : ''}.`,
      thumbnailUrl,
      originalUrl,
      sourceUrl,
      domain,
      creator: domain,
      license: 'Web Image (See Source)',
      downloadPermitted: false,
      width,
      height,
      mimeType,
      sourceProvider: 'DuckDuckGo',
      provider: 'DuckDuckGo',
      relevanceScore: Math.round(score * 100) / 100
    };

    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
}

async function fetchDuckDuckGoImages(query: string): Promise<ImageSearchItem[]> {
  let vqd = await fetchDuckDuckGoImageVqd(query, false);
  const requestImages = async (token: string) => {
    const endpoint = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(token)}&f=,,,,,&p=1`;
    return fetchWithTimeout(
      endpoint,
      {
        headers: {
          'User-Agent': DDG_BROWSER_UA,
          'Referer': 'https://duckduckgo.com/',
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
      },
      5000
    );
  };

  let res = await requestImages(vqd);
  if (res.status === 403 || res.status === 418) {
    vqd = await fetchDuckDuckGoImageVqd(query, true);
    res = await requestImages(vqd);
  }
  if (res.status !== 200) {
    throw new Error(`DuckDuckGo Images HTTP ${res.status}`);
  }

  const data: any = await res.json();
  if (data?.challenge || !Array.isArray(data?.results)) {
    throw new Error('DuckDuckGo Images bot-challenge (202)');
  }
  return normalizeAndRankDuckDuckGoImages(data.results, query);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

export function parseBingImagesAsyncHtml(html: string, query: string): ImageSearchItem[] {
  const rawItems: any[] = [];
  const cardRegex = /<a\b[^>]*class="[^"]*\biusc\b[^"]*"[^>]*m="([^"]+)"([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const rawM = decodeHtmlEntities(match[1]);
    const tailAttrs = match[2] || '';
    try {
      const obj = JSON.parse(rawM);
      const murl = String(obj?.murl || '').trim();
      if (!murl) continue;
      const wMatch = tailAttrs.match(/expw=(\d+)/i);
      const hMatch = tailAttrs.match(/exph=(\d+)/i);
      rawItems.push({
        title: obj?.t || obj?.desc || query,
        image: murl,
        thumbnail: obj?.turl || murl,
        url: obj?.purl || murl,
        width: wMatch ? Number(wMatch[1]) : undefined,
        height: hMatch ? Number(hMatch[1]) : undefined,
        encoding_format: murl.match(/\.(png|webp|gif|svg|jpe?g)(\?|$)/i)?.[1]?.toLowerCase() || 'jpeg'
      });
    } catch {
      // Skip malformed card JSON
    }
  }

  return normalizeAndRankDuckDuckGoImages(rawItems, query).map((item) => ({
    ...item,
    id: item.id.replace(/^ddg-img-/, 'bing-img-'),
    description: item.description.replace('Image via DuckDuckGo', 'Web image index'),
    sourceProvider: 'Bing Web Index',
    provider: 'Bing Web Index'
  }));
}

async function fetchBingWebImages(query: string, orientation = 'all'): Promise<ImageSearchItem[]> {
  let qft = '';
  if (orientation === 'landscape') qft = '&qft=+filterui:aspect-wide';
  else if (orientation === 'portrait') qft = '&qft=+filterui:aspect-tall';
  else if (orientation === 'square') qft = '&qft=+filterui:aspect-square';

  const endpoint = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=1&count=35&adlt=moderate${qft}`;
  const res = await fetchWithTimeout(
    endpoint,
    {
      headers: {
        'User-Agent': DDG_BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    },
    5000
  );
  if (!res.ok) {
    throw new Error(`Web Image Index HTTP ${res.status}`);
  }
  const html = await res.text();
  return parseBingImagesAsyncHtml(html, query);
}

export class ImageSearchProvider {
  async search(
    query: string,
    options: { limit?: number; license?: string; orientation?: string; source?: string } = {}
  ): Promise<{ items: ImageSearchItem[]; errors: string[]; partial: boolean }> {
    const clean = query.trim();
    if (!clean) return { items: [], errors: [], partial: false };

    const limit = Math.min(options.limit || 24, 40);
    const licenseFilter = (options.license || 'all').toLowerCase();
    const orientFilter = (options.orientation || 'all').toLowerCase();
    const sourceFilter = (options.source || 'all').toLowerCase();

    const cacheKey = `${clean.toLowerCase()}:${limit}:${licenseFilter}:${orientFilter}:${sourceFilter}`;
    const cached = imageCache.get(cacheKey);
    if (cached) return { items: cached, errors: [], partial: false };

    const isUnrestrictedLicense = licenseFilter === 'all' || licenseFilter === 'any';
    const wantDuckDuckGo =
      sourceFilter === 'duckduckgo' || (sourceFilter === 'all' && isUnrestrictedLicense);
    const wantOpenCatalogs =
      sourceFilter === 'wikimedia' ||
      sourceFilter === 'openverse' ||
      !isUnrestrictedLicense;

    const ddgItems: ImageSearchItem[] = [];
    const fallbackItems: ImageSearchItem[] = [];
    const errors: string[] = [];

    const matchesOrientation = (img: ImageSearchItem): boolean => {
      if (orientFilter === 'all') return true;
      if (!img.width || !img.height) return false;
      const ratio = img.width / img.height;
      if (orientFilter === 'landscape') return ratio > 1.1;
      if (orientFilter === 'portrait') return ratio < 0.9;
      if (orientFilter === 'square') return ratio >= 0.85 && ratio <= 1.15;
      return true;
    };

    const matchesLicense = (img: ImageSearchItem): boolean => {
      if (isUnrestrictedLicense) return true;
      if (licenseFilter === 'cc0' || licenseFilter === 'public_domain' || licenseFilter === 'pd') {
        return /(cc0|public domain|\bpd\b|pdm)/i.test(img.license);
      }
      if (licenseFilter === 'commercial') {
        return !/\bnc\b/i.test(img.license) && img.sourceProvider !== 'DuckDuckGo' && img.sourceProvider !== 'Bing Web Index';
      }
      if (licenseFilter === 'cc' || licenseFilter === 'modification') {
        return img.sourceProvider !== 'DuckDuckGo' && img.sourceProvider !== 'Bing Web Index';
      }
      return true;
    };

    if (wantDuckDuckGo) {
      try {
        const fetched = await fetchDuckDuckGoImages(clean);
        ddgItems.push(...fetched);
      } catch (e: any) {
        errors.push(`DuckDuckGo Images: ${e?.message || 'failed'}`);
      }
    }

    // If DuckDuckGo i.js was rate-limited / challenged (e.g. HTTP 202), transparently fall back
    // to Bing's web image index (DuckDuckGo Images' upstream web image index) for unfiltered searches.
    if (sourceFilter === 'all' && isUnrestrictedLicense && ddgItems.filter((img) => matchesOrientation(img)).length < Math.min(limit, 6)) {
      try {
        const bingItems = await fetchBingWebImages(clean, orientFilter);
        ddgItems.push(...bingItems);
      } catch (e: any) {
        errors.push(`Web Image Index: ${e?.message || 'failed'}`);
      }
    }

    const filteredDdg = ddgItems.filter((img) => matchesOrientation(img) && matchesLicense(img));

    const shouldRunOpenCatalogs =
      wantOpenCatalogs ||
      (sourceFilter === 'all' && filteredDdg.length < Math.min(limit, 6));

    if (shouldRunOpenCatalogs) {
      const openTasks: Array<Promise<void>> = [];

      if (sourceFilter !== 'openverse') {
        openTasks.push(
          (async () => {
            try {
              const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(clean)}&gsrlimit=${Math.min(limit, 20)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=640&format=json`;
              const res = await fetchWithTimeout(url, {}, 3800);
              if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
              const data: any = await res.json();
              const pages = Object.values(data?.query?.pages || {}) as any[];
              for (const p of pages) {
                const info = p?.imageinfo?.[0];
                if (!info?.url) continue;
                const mime = String(info.mime || '');
                if (!mime.startsWith('image/')) continue;
                const meta = info.extmetadata || {};
                const title = String(p.title || 'Image').replace(/^File:/, '').replace(/\.[^.]+$/, '');
                const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}`;
                const creator = stripHtml(meta.Artist?.value || 'Wikimedia Contributor').slice(0, 90) || 'Wikimedia Contributor';
                const license = stripHtml(meta.LicenseShortName?.value || 'See Wikimedia Source');
                const licenseUrl = meta.LicenseUrl?.value ? String(meta.LicenseUrl.value) : undefined;
                const desc = stripHtml(meta.ImageDescription?.value || `${title} on Wikimedia Commons.`).slice(0, 240);

                fallbackItems.push({
                  id: `wm-img-${p.pageid || title.slice(0, 10)}`,
                  title,
                  description: desc,
                  thumbnailUrl: info.thumburl || info.url,
                  originalUrl: info.url,
                  sourceUrl: pageUrl,
                  domain: 'commons.wikimedia.org',
                  creator,
                  license,
                  licenseUrl,
                  downloadPermitted: isPermissiveLicense(license),
                  width: info.width,
                  height: info.height,
                  mimeType: mime,
                  sourceProvider: 'Wikimedia Commons',
                  provider: 'Wikimedia Commons'
                });
              }
            } catch (e: any) {
              errors.push(`Wikimedia Commons: ${e?.message || 'failed'}`);
            }
          })()
        );
      }

      if (sourceFilter !== 'wikimedia') {
        openTasks.push(
          (async () => {
            try {
              const params = new URLSearchParams({ q: clean, page_size: String(Math.min(limit, 18)) });
              if (licenseFilter === 'cc0' || licenseFilter === 'public_domain' || licenseFilter === 'pd') {
                params.set('license', 'cc0,pdm');
              } else if (licenseFilter === 'commercial') {
                params.set('license_type', 'commercial');
              } else if (licenseFilter === 'modification') {
                params.set('license_type', 'modification');
              }

              if (orientFilter === 'landscape') params.set('aspect_ratio', 'wide');
              else if (orientFilter === 'portrait') params.set('aspect_ratio', 'tall');
              else if (orientFilter === 'square') params.set('aspect_ratio', 'square');

              const res = await fetchWithTimeout(`https://api.openverse.org/v1/images/?${params.toString()}`, {}, 3500);
              if (!res.ok) throw new Error(`Openverse HTTP ${res.status}`);
              const data: any = await res.json();
              for (const img of data?.results || []) {
                if (!img?.url || !img?.foreign_landing_url) continue;
                let dom = 'openverse.org';
                try { dom = new URL(img.foreign_landing_url).hostname.replace(/^www\./, ''); } catch {}
                const lic = `${String(img.license || 'CC').toUpperCase()}${img.license_version ? ` ${img.license_version}` : ''}`;
                fallbackItems.push({
                  id: `ov-img-${img.id || Math.random().toString(36).slice(2, 9)}`,
                  title: String(img.title || 'Openverse Image'),
                  description: `Open-licensed image by ${img.creator || 'Creator'} (${lic}).`,
                  thumbnailUrl: img.thumbnail || img.url,
                  originalUrl: img.url,
                  sourceUrl: img.foreign_landing_url,
                  domain: dom,
                  creator: String(img.creator || 'Unknown Creator'),
                  license: lic,
                  licenseUrl: img.license_url || undefined,
                  downloadPermitted: isPermissiveLicense(lic),
                  width: img.width,
                  height: img.height,
                  mimeType: img.filetype || 'image/jpeg',
                  sourceProvider: 'Openverse',
                  provider: 'Openverse'
                });
              }
            } catch (e: any) {
              errors.push(`Openverse: ${e?.message || 'failed'}`);
            }
          })()
        );
      }

      await Promise.allSettled(openTasks);
    }

    const filteredFallback = fallbackItems.filter((img) => matchesOrientation(img) && matchesLicense(img));

    const combined: ImageSearchItem[] = [];
    const seenFinal = new Set<string>();
    for (const item of [...filteredDdg, ...filteredFallback]) {
      const canonical = item.originalUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
      if (seenFinal.has(canonical)) continue;
      seenFinal.add(canonical);
      combined.push(item);
      if (combined.length >= limit) break;
    }

    if (combined.length > 0) {
      imageCache.set(cacheKey, combined);
    }
    return { items: combined, errors, partial: errors.length > 0 && combined.length > 0 };
  }
}

// ---------------------------------------------------------------------------
// 3. GeoCodingProvider & MapSearchProvider (Nominatim + Overpass + OSRM + Pendulum GeoIndex)
// ---------------------------------------------------------------------------
export class GeoCodingProvider {
  async geocode(query: string, limit = 10): Promise<{ items: MapPlaceItem[]; error?: string }> {
    const clean = query.trim();
    if (!clean) return { items: [] };
    const cacheKey = `geo:${clean.toLowerCase()}:${limit}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached) return { items: cached };

    const items: MapPlaceItem[] = [];
    // Include Pendulum GeoIndex exact/partial matches
    const lower = clean.toLowerCase();
    for (const e of LOCAL_ENTITIES) {
      if (
        e.name.toLowerCase().includes(lower) ||
        e.city.toLowerCase().includes(lower) ||
        e.category.toLowerCase().includes(lower)
      ) {
        items.push({
          id: `hs-poi-${e.id}`,
          name: e.name,
          displayName: e.address,
          category: e.category,
          address: e.address,
          lat: e.lat,
          lon: e.lon,
          domain: (() => { try { return new URL(e.website).hostname.replace(/^www\./, ''); } catch { return 'pendulum.geo'; } })(),
          sourceUrl: e.website,
          sourceProvider: 'Pendulum GeoIndex',
          openingHours: e.opening_hours,
          website: e.website,
          phone: e.phone,
          details: { rating: e.rating, reviews: e.review_count, hours: e.opening_hours, phone: e.phone }
        });
      }
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(clean)}&format=jsonv2&addressdetails=1&extratags=1&limit=${Math.min(limit, 12)}`;
      const res = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'PendulumSearch/2.0 (https://hsaisolutions.com)',
          'Accept-Language': 'en'
        }
      }, 4200);
      if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
      const data: any[] = await res.json();
      for (const p of data) {
        const lat = parseFloat(p.lat);
        const lon = parseFloat(p.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const extratags = p.extratags || {};
        items.push({
          id: `osm-${p.place_id}`,
          name: p.name || String(p.display_name || 'Location').split(',')[0],
          displayName: String(p.display_name || ''),
          category: String(p.type || p.category || 'place').replace(/_/g, ' '),
          address: String(p.display_name || ''),
          lat,
          lon,
          domain: 'openstreetmap.org',
          sourceUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`,
          sourceProvider: 'OpenStreetMap Nominatim',
          openingHours: extratags.opening_hours,
          website: extratags.website || extratags['contact:website'],
          phone: extratags.phone || extratags['contact:phone'],
          details: p.address || {}
        });
      }
    } catch (e: any) {
      // Fallback to Pendulum global places gazetteer if Nominatim is temporarily unreachable
      for (const g of GLOBAL_PLACES) {
        if (g.name.toLowerCase().includes(lower) || g.alternate_names.some((a) => a.toLowerCase().includes(lower))) {
          items.push({
            id: `hs-global-${g.id}`,
            name: g.name,
            category: g.feature_type,
            address: [g.locality, g.city, g.state_province, g.country_name].filter(Boolean).join(', '),
            lat: g.lat,
            lon: g.lon,
            domain: 'openstreetmap.org',
            sourceUrl: `https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lon}#map=12/${g.lat}/${g.lon}`,
            sourceProvider: 'Pendulum Gazetteer',
            details: { population: g.population, timezone: g.timezone }
          });
        }
      }
      if (items.length === 0) return { items: [], error: e?.message || 'Geocoding failed' };
    }

    const sliced = items.slice(0, limit);
    if (sliced.length > 0) geocodeCache.set(cacheKey, sliced);
    return { items: sliced };
  }
}

export class MapSearchProvider {
  private geocoder = new GeoCodingProvider();

  async search(query: string, limit = 12) {
    return this.geocoder.geocode(query, limit);
  }

  async searchNearbyOverpass(lat: number, lon: number, poiType = 'restaurant', radiusMeters = 3500): Promise<{ items: MapPlaceItem[]; error?: string }> {
    const cleanType = poiType.toLowerCase().trim();
    const cacheKey = `nearby:${lat.toFixed(3)},${lon.toFixed(3)}:${cleanType}`;
    const cached = nearbyCache.get(cacheKey);
    if (cached) return { items: cached };

    // Always include verified Pendulum LOCAL_ENTITIES within radius
    const localMatches: MapPlaceItem[] = LOCAL_ENTITIES
      .filter((e) => {
        const dist = haversineKm(lat, lon, e.lat, e.lon);
        if (dist > radiusMeters / 1000 + 8) return false;
        if (cleanType === 'all') return true;
        return e.category.toLowerCase().includes(cleanType) || cleanType.includes(e.category.toLowerCase());
      })
      .map((e) => ({
        id: `hs-local-${e.id}`,
        name: e.name,
        displayName: e.address,
        category: e.category,
        address: e.address,
        lat: e.lat,
        lon: e.lon,
        distanceKm: haversineKm(lat, lon, e.lat, e.lon),
        domain: (() => { try { return new URL(e.website).hostname.replace(/^www\./, ''); } catch { return 'pendulum.geo'; } })(),
        sourceUrl: e.website,
        sourceProvider: 'Pendulum GeoIndex',
        openingHours: e.opening_hours,
        website: e.website,
        phone: e.phone,
        details: { rating: e.rating, hours: e.opening_hours, phone: e.phone }
      }));

    // Map user POI category to OpenStreetMap Overpass tag filter (no API key required)
    const tagMap: Record<string, string> = {
      restaurant: '["amenity"~"restaurant|fast_food|food_court"]',
      restaurants: '["amenity"~"restaurant|fast_food|food_court"]',
      cafe: '["amenity"~"cafe|bakery|coffee_shop"]',
      cafes: '["amenity"~"cafe|bakery|coffee_shop"]',
      hotel: '["tourism"~"hotel|guest_house|hostel|motel|resort"]',
      hotels: '["tourism"~"hotel|guest_house|hostel|motel|resort"]',
      hospital: '["amenity"~"hospital|clinic|doctors"]',
      hospitals: '["amenity"~"hospital|clinic|doctors"]',
      pharmacy: '["amenity"="pharmacy"]',
      transit: '["public_transport"~"station|stop_position|platform"]',
      station: '["railway"~"station|halt|subway_entrance"]',
      park: '["leisure"~"park|garden|nature_reserve"]',
      parks: '["leisure"~"park|garden|nature_reserve"]',
      atm: '["amenity"~"atm|bank"]',
      school: '["amenity"="school"]',
      schools: '["amenity"="school"]',
      university: '["amenity"~"university|college"]',
      universities: '["amenity"~"university|college"]',
      landmark: '["tourism"~"attraction|museum|monument|viewpoint"]',
      landmarks: '["tourism"~"attraction|museum|monument|viewpoint"]'
    };
    const tagExpr = tagMap[cleanType] || '["amenity"~"restaurant|cafe|hospital|university|school"]';

    const overpassQuery = `[out:json][timeout:6];(node${tagExpr}(around:${radiusMeters},${lat},${lon});way${tagExpr}(around:${radiusMeters},${lat},${lon}););out center 18;`;

    try {
      const res = await fetchWithTimeout(
        'https://overpass-api.de/api/interpreter',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'PendulumSearch/2.0 (+https://hsaisolutions.com)'
          },
          body: `data=${encodeURIComponent(overpassQuery)}`
        },
        5500
      );
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const data: any = await res.json();
      const osmPois: MapPlaceItem[] = [];

      for (const el of data?.elements || []) {
        const pLat = el.lat ?? el.center?.lat;
        const pLon = el.lon ?? el.center?.lon;
        const name = el.tags?.name;
        if (!name || !Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;
        const addrParts = [el.tags['addr:housenumber'], el.tags['addr:street'], el.tags['addr:city'], el.tags['addr:postcode']].filter(Boolean);
        const openingHours = el.tags?.opening_hours;
        const website = el.tags?.website || el.tags?.['contact:website'];
        const phone = el.tags?.phone || el.tags?.['contact:phone'];
        osmPois.push({
          id: `overpass-${el.type}-${el.id}`,
          name: String(name),
          displayName: addrParts.length ? addrParts.join(', ') : `${pLat.toFixed(4)}, ${pLon.toFixed(4)}`,
          category: String(el.tags?.amenity || el.tags?.tourism || el.tags?.public_transport || el.tags?.leisure || cleanType),
          address: addrParts.length ? addrParts.join(', ') : `${pLat.toFixed(4)}, ${pLon.toFixed(4)}`,
          lat: pLat,
          lon: pLon,
          distanceKm: haversineKm(lat, lon, pLat, pLon),
          domain: 'openstreetmap.org',
          sourceUrl: `https://www.openstreetmap.org/?mlat=${pLat}&mlon=${pLon}#map=16/${pLat}/${pLon}`,
          sourceProvider: 'OpenStreetMap Overpass API',
          openingHours,
          website,
          phone,
          details: {
            cuisine: el.tags?.cuisine,
            opening_hours: openingHours,
            website,
            phone
          }
        });
      }

      const combined = [...localMatches, ...osmPois].sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)).slice(0, 24);
      if (combined.length > 0) {
        nearbyCache.set(cacheKey, combined);
        return { items: combined };
      }
    } catch {
      // Fall through to Nominatim viewbox fallback (still 100% API-key-free)
    }

    try {
      const delta = Math.max(0.03, Math.min(0.2, radiusMeters / 111000));
      const viewbox = `${(lon - delta).toFixed(4)},${(lat + delta).toFixed(4)},${(lon + delta).toFixed(4)},${(lat - delta).toFixed(4)}`;
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanType)}&format=jsonv2&bounded=1&viewbox=${viewbox}&addressdetails=1&extratags=1&limit=15`;
      const nomRes = await fetchWithTimeout(nomUrl, {
        headers: {
          'User-Agent': 'PendulumSearch/2.0 (https://hsaisolutions.com)',
          'Accept-Language': 'en'
        }
      }, 4000);
      if (nomRes.ok) {
        const nomData: any[] = await nomRes.json();
        const nomPois: MapPlaceItem[] = nomData
          .map((p) => {
            const pLat = parseFloat(p.lat);
            const pLon = parseFloat(p.lon);
            if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) return null;
            const extratags = p.extratags || {};
            return {
              id: `osm-nearby-${p.place_id}`,
              name: p.name || String(p.display_name || cleanType).split(',')[0],
              displayName: String(p.display_name || ''),
              category: String(p.type || cleanType).replace(/_/g, ' '),
              address: String(p.display_name || ''),
              lat: pLat,
              lon: pLon,
              distanceKm: haversineKm(lat, lon, pLat, pLon),
              domain: 'openstreetmap.org',
              sourceUrl: `https://www.openstreetmap.org/?mlat=${pLat}&mlon=${pLon}#map=16/${pLat}/${pLon}`,
              sourceProvider: 'OpenStreetMap Nominatim',
              openingHours: extratags.opening_hours,
              website: extratags.website || extratags['contact:website'],
              phone: extratags.phone || extratags['contact:phone']
            } as MapPlaceItem;
          })
          .filter((x): x is MapPlaceItem => x !== null);
        const combined = [...localMatches, ...nomPois].sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)).slice(0, 24);
        if (combined.length > 0) nearbyCache.set(cacheKey, combined);
        return { items: combined };
      }
    } catch {}

    return { items: localMatches };
  }

  async getDirections(fromLat: number, fromLon: number, toLat: number, toLon: number, profile: 'driving' | 'foot' | 'bike' = 'driving') {
    const fallbackUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_${profile === 'foot' ? 'foot' : profile === 'bike' ? 'bike' : 'car'}&route=${fromLat}%2C${fromLon}%3B${toLat}%2C${toLon}`;
    try {
      const osrmProfile = profile === 'foot' ? 'foot' : profile === 'bike' ? 'bike' : 'driving';
      const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=true`;
      const res = await fetchWithTimeout(url, {}, 4000);
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      const data: any = await res.json();
      const route = data?.routes?.[0];
      if (!route) throw new Error('No route returned');
      const coords = (route.geometry?.coordinates || []).map(([lon, lat]: [number, number]) => [lat, lon]);
      const steps = (route.legs?.[0]?.steps || []).slice(0, 20).map((s: any) => ({
        instruction: `${s.maneuver?.type || 'Proceed'} ${s.maneuver?.modifier || ''} ${s.name ? `onto ${s.name}` : ''}`.replace(/\s+/g, ' ').trim(),
        distanceM: Math.round(s.distance || 0),
        durationSec: Math.round(s.duration || 0)
      }));
      return {
        available: true,
        mode: profile,
        distanceKm: Math.round((route.distance / 1000) * 100) / 100,
        durationMin: Math.round((route.duration / 60) * 10) / 10,
        coordinates: coords,
        steps,
        externalDirectionsUrl: fallbackUrl,
        provider: 'OSRM Open Routing'
      };
    } catch {
      return {
        available: false,
        mode: profile,
        distanceKm: haversineKm(fromLat, fromLon, toLat, toLon),
        durationMin: null,
        coordinates: [
          [fromLat, fromLon],
          [toLat, toLon]
        ],
        steps: [],
        externalDirectionsUrl: fallbackUrl,
        provider: 'OpenStreetMap Directions Link'
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 4. MediaMetadataProvider (SSRF-safe HTML OG / YouTube oEmbed / MIME inspection)
// ---------------------------------------------------------------------------
export class MediaMetadataProvider {
  async inspect(targetUrl: string) {
    if (!targetUrl || isBlockedHost(targetUrl)) {
      throw new Error('Blocked or invalid URL (SSRF protection).');
    }
    const cached = metadataCache.get(targetUrl);
    if (cached) return cached;

    const ytId = extractYouTubeId(targetUrl);
    if (ytId) {
      const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
      const res = await fetchWithTimeout(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {}, 3500);
      if (res.ok) {
        const data: any = await res.json();
        const result = {
          url: watchUrl,
          domain: 'youtube.com',
          title: data.title,
          publisher: data.author_name,
          thumbnailUrl: data.thumbnail_url,
          embedType: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0`,
          sourceProvider: 'YouTube oEmbed'
        };
        metadataCache.set(targetUrl, result);
        return result;
      }
    }

    const res = await fetchWithTimeout(targetUrl, { headers: { Accept: 'text/html,application/xhtml+xml,*/*' } }, 4500);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      const directMeta = {
        url: targetUrl,
        domain: new URL(targetUrl).hostname.replace(/^www\./, ''),
        title: targetUrl.split('/').pop() || targetUrl,
        mimeType: contentType,
        embedType: contentType.startsWith('video/') ? 'html5' : 'none'
      };
      metadataCache.set(targetUrl, directMeta);
      return directMeta;
    }

    const html = (await res.text()).slice(0, 60_000);
    const getMeta = (attr: string) => {
      const m =
        html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${attr}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${attr}["']`, 'i'));
      return m ? stripHtml(m[1]) : undefined;
    };
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const meta = {
      url: targetUrl,
      domain: new URL(targetUrl).hostname.replace(/^www\./, ''),
      title: getMeta('og:title') || (titleMatch ? stripHtml(titleMatch[1]) : targetUrl),
      description: getMeta('og:description') || getMeta('description'),
      thumbnailUrl: getMeta('og:image'),
      videoUrl: getMeta('og:video:url') || getMeta('og:video'),
      mimeType: contentType
    };
    metadataCache.set(targetUrl, meta);
    return meta;
  }
}

export const videoSearchProvider = new VideoSearchProvider();
export const imageSearchProvider = new ImageSearchProvider();
export const geoCodingProvider = new GeoCodingProvider();
export const mapSearchProvider = new MapSearchProvider();
export const mediaMetadataProvider = new MediaMetadataProvider();
