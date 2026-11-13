import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Play, Clock, ExternalLink, MapPin, Navigation, Compass, Globe,
  Layers, Route, AlertCircle, CheckCircle2
} from 'lucide-react';
import type {
  PendulumDirections,
  PendulumImageItem,
  PendulumMapPlace,
  PendulumVideoItem
} from '../../types';
import {
  getDirectionsAPI,
  getMapConfigAPI,
  searchImagesAPI,
  searchMapsAPI,
  searchNearbyMapsAPI,
  searchVideosAPI
} from '../../services/api';

// =============================================================================
// Images Tab Workspace
// =============================================================================
interface ImagesWorkspaceProps {
  query: string;
  onOpenImage: (img: PendulumImageItem, all: PendulumImageItem[]) => void;
}

export const ImagesWorkspace: React.FC<ImagesWorkspaceProps> = ({ query, onOpenImage }) => {
  const [images, setImages] = useState<PendulumImageItem[]>([]);
  const [primaryProvider, setPrimaryProvider] = useState<string>('DuckDuckGo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [license, setLicense] = useState('all');
  const [orientation, setOrientation] = useState('all');
  const [source, setSource] = useState('all');

  useEffect(() => {
    if (!query.trim()) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    searchImagesAPI(query, { limit: 30, license, orientation, source }, ctrl.signal)
      .then((res) => {
        setImages(res.results || []);
        setPrimaryProvider(res.attribution?.primaryProvider || (source === 'wikimedia' ? 'Wikimedia Commons' : source === 'openverse' ? 'Openverse' : 'DuckDuckGo'));
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Unable to fetch images.');
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [query, license, orientation, source]);

  return (
    <div className="space-y-4">
      {/* Filter Bar & Attribution */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            aria-label="Image license filter"
            className="h-9 px-3 rounded-xl bg-[#111316] border border-white/10 text-xs text-[#e8e5de] focus:outline-none focus:border-gold-400"
          >
            <option value="all">Any License</option>
            <option value="cc">Creative Commons</option>
            <option value="public_domain">Public Domain / CC0</option>
            <option value="commercial">Commercial Use</option>
          </select>

          <select
            value={orientation}
            onChange={(e) => setOrientation(e.target.value)}
            aria-label="Image orientation filter"
            className="h-9 px-3 rounded-xl bg-[#111316] border border-white/10 text-xs text-[#e8e5de] focus:outline-none focus:border-gold-400"
          >
            <option value="all">Any Orientation</option>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
            <option value="square">Square</option>
          </select>

          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Image catalog filter"
            className="h-9 px-3 rounded-xl bg-[#111316] border border-white/10 text-xs text-[#e8e5de] focus:outline-none focus:border-gold-400"
          >
            <option value="all">All Sources (Web Primary)</option>
            <option value="duckduckgo">Web Index Images</option>
            <option value="wikimedia">Wikimedia Commons</option>
            <option value="openverse">Openverse</option>
          </select>
        </div>

        <div className="inline-flex items-center gap-1.5 text-[12px] text-[#c5c7ca]">
          {primaryProvider && primaryProvider !== 'DuckDuckGo' && (
            <>
              <span>
                Image results from{' '}
                <span className="text-[#f3f0e9] font-medium">{primaryProvider}</span>
              </span>
              <span className="text-[#8d9198]">·</span>
            </>
          )}
          <span className="text-gold-300 font-medium">Enhanced by Pendulum</span>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] rounded-xl bg-white/[0.06] animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-400/25 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && images.length === 0 && (
        <div className="py-12 text-center text-sm text-[#9a9da3]">
          No images matched "{query}" with the selected filters.
        </div>
      )}

      {!loading && images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {images.map((img) => {
            const rawProvider = img.sourceProvider || img.provider || 'Web Index';
            const providerName = rawProvider === 'DuckDuckGo' ? 'Web Index' : rawProvider;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => onOpenImage(img, images)}
                className="group text-left rounded-xl bg-[#111316] border border-white/10 hover:border-gold-400/50 overflow-hidden transition-colors"
              >
                <div className="relative aspect-[4/3] bg-[#07080a] overflow-hidden">
                  <img
                    src={img.thumbnailUrl || img.originalUrl}
                    alt={img.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (img.originalUrl && el.src !== img.originalUrl && !el.dataset.triedFallback) {
                        el.dataset.triedFallback = '1';
                        el.src = img.originalUrl;
                      } else {
                        el.style.opacity = '0.2';
                      }
                    }}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                  {img.width && img.height ? (
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-[#d4d6da] tabular-nums">
                      {img.width}×{img.height}
                    </span>
                  ) : null}
                </div>
                <div className="p-2.5">
                  <div className="text-xs font-medium text-[#f3f0e9] truncate">{img.title}</div>
                  <div className="mt-0.5 text-[11px] font-mono text-[#9a9da3] truncate">
                    {img.domain || providerName}
                    {' · '}
                    <span className={providerName === 'Web Index' ? 'text-gold-300/90' : ''}>{providerName}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Videos Tab Workspace
// =============================================================================
interface VideosWorkspaceProps {
  query: string;
  onPlayVideo: (video: PendulumVideoItem, all: PendulumVideoItem[]) => void;
}

export const VideosWorkspace: React.FC<VideosWorkspaceProps> = ({ query, onPlayVideo }) => {
  const [videos, setVideos] = useState<PendulumVideoItem[]>([]);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'youtube' | 'open'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setSourceFilter('all');
    searchVideosAPI(query, 18, ctrl.signal)
      .then((res) => {
        setVideos(res.results || []);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Unable to load videos.');
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [query]);

  const ytCount = videos.filter((v) => v.playerType === 'youtube').length;
  const openCount = videos.filter((v) => v.playerType !== 'youtube').length;
  const filteredVideos =
    sourceFilter === 'youtube'
      ? videos.filter((v) => v.playerType === 'youtube')
      : sourceFilter === 'open'
      ? videos.filter((v) => v.playerType !== 'youtube')
      : videos;

  return (
    <div className="space-y-4">
      {!loading && videos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/[0.06] text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All Videos (${videos.length})` },
                { id: 'youtube', label: `YouTube (${ytCount})` },
                ...(openCount > 0 ? [{ id: 'open' as const, label: `Open Media (${openCount})` }] : [])
              ] as Array<{ id: 'all' | 'youtube' | 'open'; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                  sourceFilter === tab.id
                    ? 'bg-gold-400/15 border-gold-400/50 text-gold-200'
                    : 'bg-[#111316] border-white/10 text-[#c5c7ca] hover:border-white/25'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[#8d9198] tabular-nums">
            Relevance &amp; quality matched · Official embeds
          </span>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-[#111316] border border-white/10 p-3 space-y-2.5 animate-pulse">
              <div className="aspect-video rounded-lg bg-white/[0.06]" />
              <div className="h-4 w-3/4 rounded bg-white/[0.07]" />
              <div className="h-3 w-1/2 rounded bg-white/[0.05]" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-400/25 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && filteredVideos.length === 0 && (
        <div className="py-12 text-center text-sm text-[#9a9da3]">
          No playable videos found for "{query}". Try a broader descriptive term.
        </div>
      )}

      {!loading && filteredVideos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((v) => (
            <div
              key={v.id}
              onClick={() => onPlayVideo(v, filteredVideos)}
              className="group cursor-pointer rounded-xl bg-[#111316] border border-white/10 hover:border-gold-400/50 overflow-hidden transition-colors flex flex-col"
            >
              <div className="relative aspect-video bg-[#07080a] overflow-hidden">
                {v.thumbnailUrl ? (
                  <img
                    src={v.thumbnailUrl}
                    alt={v.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#9a9da3] text-xs font-mono">
                    Media Stream
                  </div>
                )}
                <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="w-11 h-11 rounded-full bg-obsidian-950/85 border border-gold-400/60 flex items-center justify-center text-gold-300 group-hover:scale-105 transition-transform">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                </div>
                {v.duration && (
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-mono text-white tabular-nums flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gold-400" />
                    <span>{v.duration}</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#f3f0e9] group-hover:text-gold-200 line-clamp-2">
                    {v.title}
                  </h3>
                  {v.description && (
                    <p className="mt-1 text-xs text-[#9a9da3] line-clamp-2">{v.description}</p>
                  )}
                </div>
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#c5c7ca]">
                    <span className="inline-flex items-center gap-1 truncate">
                      <span className="truncate">{v.publisher || v.sourceDomain || 'Verified Video'}</span>
                      {v.verifiedChannel && <CheckCircle2 className="w-3 h-3 text-gold-400 shrink-0" />}
                    </span>
                    <a
                      href={v.watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-gold-300 hover:underline flex items-center gap-1 shrink-0"
                    >
                      <span>Source</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#8d9198] tabular-nums truncate">
                    <span className={v.playerType === 'youtube' ? 'text-gold-300 font-medium' : ''}>
                      {v.sourceProvider || (v.playerType === 'youtube' ? 'YouTube' : 'Open Media')}
                    </span>
                    {v.views && (
                      <>
                        <span>·</span>
                        <span>{v.views}</span>
                      </>
                    )}
                    {v.publishedTime && (
                      <>
                        <span>·</span>
                        <span>{v.publishedTime}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Interactive Maps Workspace (Leaflet + OpenStreetMap + OSRM, No API Key Required)
// =============================================================================
interface MapsWorkspaceProps {
  query: string;
  initialLat?: number;
  initialLon?: number;
  locationLabel?: string;
}

export const MapsWorkspace: React.FC<MapsWorkspaceProps> = ({
  query,
  initialLat = 13.0827,
  initialLon = 80.2707,
  locationLabel
}) => {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const originMarkerRef = useRef<L.CircleMarker | null>(null);

  const [places, setPlaces] = useState<PendulumMapPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PendulumMapPlace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tileMode, setTileMode] = useState<'dark' | 'osm' | 'satellite' | 'terrain'>('dark');
  const [tileConfig, setTileConfig] = useState<any>(null);
  const [travelMode, setTravelMode] = useState<'driving' | 'foot' | 'bike'>('driving');
  const [route, setRoute] = useState<PendulumDirections | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);

  const originLat = userCoords?.lat ?? initialLat;
  const originLon = userCoords?.lon ?? initialLon;

  const resolveCurrentLocation = (options?: { flyTo?: boolean }): Promise<{ lat: number; lon: number } | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoNotice('Browser geolocation unavailable — using approximate location.');
      return Promise.resolve(null);
    }
    setLocating(true);
    setGeoNotice(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setUserCoords(next);
          setLocating(false);
          setGeoNotice(null);
          if (options?.flyTo) {
            mapRef.current?.flyTo([next.lat, next.lon], 13, { duration: 0.7 });
          }
          resolve(next);
        },
        (err) => {
          setLocating(false);
          if (err?.code === 1) {
            setGeoNotice('Location permission denied — routing from approximate city center.');
          } else {
            setGeoNotice('Current GPS unavailable — routing from approximate city center.');
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  };

  // Initialize Leaflet Map once (no API key required)
  useEffect(() => {
    const container = mapElRef.current;
    if (!container || mapRef.current) return;
    const map = L.map(container, {
      center: [initialLat, initialLon],
      zoom: 12,
      zoomControl: false
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    const layerGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    markersLayerRef.current = layerGroup;

    // Ensure Leaflet recalculates dimensions once mounted/resized
    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(container);

    getMapConfigAPI()
      .then((cfg) => setTileConfig(cfg))
      .catch(() => {});

    // Automatically grab current GPS location if permission is already granted
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (status.state === 'granted') {
            resolveCurrentLocation();
          }
        })
        .catch(() => {});
    }

    return () => {
      window.clearTimeout(timer);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      tileLayerRef.current = null;
      routeLayerRef.current = null;
      originMarkerRef.current = null;
    };
  }, []);

  // Update Tile Layer cleanly (verified keyless tile servers — zero API keys)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    let url = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    let overlayUrl: string | undefined =
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
    let attribution = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';
    let maxNativeZoom = 16;
    const maxZoom = 19;

    if (tileMode === 'osm') {
      url = tileConfig?.defaultTile?.url || 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
      overlayUrl = undefined;
      attribution = tileConfig?.defaultTile?.attribution || '&copy; OpenStreetMap contributors';
      maxNativeZoom = tileConfig?.defaultTile?.maxNativeZoom || 18;
    } else if (tileMode === 'satellite') {
      url =
        tileConfig?.satelliteTile?.url ||
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      overlayUrl = undefined;
      attribution =
        tileConfig?.satelliteTile?.attribution ||
        'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics';
      maxNativeZoom = tileConfig?.satelliteTile?.maxNativeZoom || 18;
    } else if (tileMode === 'terrain') {
      url = tileConfig?.terrainTile?.url || 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      overlayUrl = undefined;
      attribution =
        tileConfig?.terrainTile?.attribution ||
        'Map data: &copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap';
      maxNativeZoom = tileConfig?.terrainTile?.maxNativeZoom || 17;
    } else if (tileConfig?.darkTile?.url) {
      url = tileConfig.darkTile.url;
      overlayUrl = tileConfig.darkTile.overlayUrl;
      attribution = tileConfig.darkTile.attribution || attribution;
      maxNativeZoom = tileConfig.darkTile.maxNativeZoom || 16;
    }

    const group = L.layerGroup();
    const baseLayer = L.tileLayer(url, { maxNativeZoom, maxZoom, attribution });
    let fallbackApplied = false;
    baseLayer.on('tileerror', () => {
      if (fallbackApplied || tileMode === 'osm') return;
      fallbackApplied = true;
      if (tileLayerRef.current === group) {
        group.clearLayers();
        L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
          maxNativeZoom: 18,
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(group);
      }
    });
    baseLayer.addTo(group);
    if (overlayUrl) {
      L.tileLayer(overlayUrl, { maxNativeZoom, maxZoom, pane: 'overlayPane' }).addTo(group);
    }
    tileLayerRef.current = group.addTo(map);
  }, [tileMode, tileConfig]);

  // Fetch Places for Query
  useEffect(() => {
    if (!query.trim()) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setRoute(null);
    searchMapsAPI(query, 12, ctrl.signal)
      .then((res) => {
        const list = res.results || [];
        setPlaces(list);
        setSelectedPlace(list[0] || null);
        if (res.error && list.length === 0) setError(res.error);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Unable to load map places.');
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [query]);

  // Render Place Markers
  useEffect(() => {
    const map = mapRef.current;
    const group = markersLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    if (places.length === 0) return;

    const bounds: L.LatLngTuple[] = [];
    places.forEach((p, idx) => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
      bounds.push([p.lat, p.lon]);
      const isActive = selectedPlace?.id === p.id;
      const icon = L.divIcon({
        className: 'pendulum-map-pin',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-family:JetBrains Mono,monospace;font-size:11px;font-weight:700;border:1.5px solid ${
          isActive ? '#fffaf0' : '#d2b477'
        };background:${isActive ? '#d2b477' : '#111316'};color:${
          isActive ? '#090a0c' : '#f0dcae'
        };box-shadow:0 4px 12px rgba(0,0,0,0.45);">${idx + 1}</div>`
      });

      const marker = L.marker([p.lat, p.lon], { icon }).addTo(group);
      const popupAddress = p.address || p.displayName || '';
      marker.bindPopup(
        `<div style="padding:10px 12px;max-width:240px;font-family:DM Sans,sans-serif;">
          <div style="font-weight:700;font-size:13px;color:#f3f0e9;">${p.name}</div>
          <div style="font-size:11px;color:#9a9da3;margin-top:3px;">${popupAddress}</div>
        </div>`
      );
      marker.on('click', () => setSelectedPlace(p));
      if (isActive) marker.openPopup();
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
  }, [places, selectedPlace]);

  // Draw Current Location Marker & Route Polyline (backend already returns [lat, lon] pairs)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (originMarkerRef.current) {
      map.removeLayer(originMarkerRef.current);
      originMarkerRef.current = null;
    }

    if (route?.coordinates && route.coordinates.length > 1) {
      const latLngs = route.coordinates
        .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
        .map(([lat, lon]) => [lat, lon] as L.LatLngTuple);
      if (latLngs.length > 1) {
        originMarkerRef.current = L.circleMarker(latLngs[0], {
          radius: 7,
          color: '#fffaf0',
          weight: 2,
          fillColor: '#5fa8d3',
          fillOpacity: 0.95
        })
          .bindTooltip(userCoords ? 'Your Current Location' : locationLabel || 'Origin')
          .addTo(map);
        routeLayerRef.current = L.polyline(latLngs, { color: '#d2b477', weight: 4, opacity: 0.9 }).addTo(map);
        map.fitBounds(routeLayerRef.current.getBounds(), { padding: [36, 36] });
      }
    } else if (userCoords) {
      originMarkerRef.current = L.circleMarker([userCoords.lat, userCoords.lon], {
        radius: 7,
        color: '#fffaf0',
        weight: 2,
        fillColor: '#5fa8d3',
        fillOpacity: 0.95
      })
        .bindTooltip('Your Current Location')
        .addTo(map);
    }
  }, [route, userCoords, locationLabel]);

  const handleUseMyLocation = async () => {
    const coords = await resolveCurrentLocation({ flyTo: true });
    if (coords && route && selectedPlace) {
      await fetchRouteFromOrigin(coords.lat, coords.lon, selectedPlace, travelMode);
    }
  };

  const handleNearby = async (poiType: string) => {
    const centerLat = selectedPlace?.lat ?? originLat;
    const centerLon = selectedPlace?.lon ?? originLon;
    setLoading(true);
    setRoute(null);
    try {
      const res = await searchNearbyMapsAPI(centerLat, centerLon, poiType, 4500);
      setPlaces(res.results || []);
      setSelectedPlace(res.results?.[0] || null);
    } catch {}
    setLoading(false);
  };

  const fetchRouteFromOrigin = async (
    fromLat: number,
    fromLon: number,
    destination: PendulumMapPlace,
    mode: 'driving' | 'foot' | 'bike'
  ) => {
    setRouteLoading(true);
    try {
      const d = await getDirectionsAPI({
        fromLat,
        fromLon,
        toLat: destination.lat,
        toLon: destination.lon,
        mode
      });
      setRoute(d);
    } catch {}
    setRouteLoading(false);
  };

  const handleDirections = async (modeOverride?: 'driving' | 'foot' | 'bike') => {
    if (!selectedPlace) return;
    const activeMode = modeOverride ?? travelMode;
    let fromLat = userCoords?.lat;
    let fromLon = userCoords?.lon;

    // Automatically resolve current device location first if not yet captured
    if (fromLat === undefined || fromLon === undefined) {
      const liveCoords = await resolveCurrentLocation();
      fromLat = liveCoords?.lat ?? initialLat;
      fromLon = liveCoords?.lon ?? initialLon;
    }

    await fetchRouteFromOrigin(fromLat, fromLon, selectedPlace, activeMode);
  };

  return (
    <div className="space-y-4">
      {/* Map Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="px-2.5 py-1.5 rounded-lg bg-[#171a1e] hover:bg-[#20242a] border border-gold-400/35 text-xs text-gold-200 flex items-center gap-1.5 transition-colors"
            title="Use current device GPS for nearby search and directions"
          >
            <Navigation className="w-3 h-3" />
            <span>{locating ? 'Locating...' : userCoords ? 'Current Location Active' : 'Use Current Location'}</span>
          </button>
          {['restaurant', 'hospital', 'hotel', 'cafe', 'transit'].map((poi) => (
            <button
              key={poi}
              type="button"
              onClick={() => handleNearby(poi)}
              className="px-2.5 py-1.5 rounded-lg bg-[#111316] hover:bg-[#171a1e] border border-white/10 text-xs text-[#e8e5de] hover:text-gold-200 capitalize transition-colors"
            >
              Nearby {poi}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-gold-400" />
          {(
            [
              { id: 'dark', label: 'Obsidian' },
              { id: 'osm', label: 'Street' },
              { id: 'satellite', label: 'Satellite' },
              { id: 'terrain', label: 'Terrain' }
            ] as const
          ).map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => setTileMode(layer.id)}
              className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                tileMode === layer.id
                  ? 'border-gold-400 text-gold-200 bg-gold-400/10'
                  : 'border-white/10 text-[#9a9da3] hover:text-[#f3f0e9]'
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Map + Places List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Interactive Map Canvas */}
        <div className="lg:col-span-2 relative h-[420px] sm:h-[500px] rounded-2xl overflow-hidden border border-white/15 bg-[#0d0f13]">
          <div ref={mapElRef} className="w-full h-full" />
          <div className="absolute top-3 left-3 z-[400] px-3 py-1.5 rounded-xl bg-[#111316]/90 backdrop-blur-md border border-white/15 text-xs text-[#f3f0e9] flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-gold-400" />
            <span>{locationLabel || 'OpenStreetMap Explorer'}</span>
          </div>
        </div>

        {/* Places & Directions Sidebar */}
        <div className="rounded-2xl bg-[#111316] border border-white/10 p-3.5 flex flex-col max-h-[500px]">
          <div className="text-xs font-mono uppercase tracking-[0.12em] text-[#9a9da3] pb-2 border-b border-white/[0.06] flex items-center justify-between">
            <span>Places ({places.length})</span>
            {loading && <span className="text-gold-300">Loading...</span>}
          </div>

          {error && <div className="mt-3 text-xs text-rose-300">{error}</div>}

          <div className="mt-2.5 flex-1 overflow-y-auto space-y-2 pr-1">
            {places.map((p, idx) => {
              const active = selectedPlace?.id === p.id;
              const hours = p.openingHours || p.details?.opening_hours || p.details?.hours;
              const placeLink = p.website || p.sourceUrl;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPlace(p);
                    setRoute(null);
                    mapRef.current?.flyTo([p.lat, p.lon], 15, { duration: 0.7 });
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPlace(p);
                      setRoute(null);
                      mapRef.current?.flyTo([p.lat, p.lon], 15, { duration: 0.7 });
                    }
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-gold-400/10 border-gold-400/50 text-[#fffaf0]'
                      : 'bg-[#171a1e] border-white/5 text-[#e8e5de] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] font-mono font-bold text-gold-300 shrink-0 mt-0.5">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold truncate">{p.name}</div>
                        {typeof p.distanceKm === 'number' && (
                          <span className="text-[10px] font-mono text-gold-300/90 shrink-0 tabular-nums">
                            {p.distanceKm.toFixed(1)} km
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#9a9da3] line-clamp-2 mt-0.5">
                        {p.address || p.displayName}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-mono">
                        {hours && <span className="text-[#a9c6a5]">{hours}</span>}
                        {placeLink && (
                          <a
                            href={placeLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-gold-300 hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>Open Map</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && places.length === 0 && !error && (
              <div className="py-8 text-center text-xs text-[#9a9da3]">
                No geographic places matched "{query}". Try a city or landmark name.
              </div>
            )}
          </div>

          {/* Selected Place Directions Box */}
          {selectedPlace && (
            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px] text-[#9a9da3]">
                <span className="truncate">
                  From:{' '}
                  <span className={userCoords ? 'text-[#5fa8d3] font-medium' : 'text-[#c5c7ca]'}>
                    {userCoords
                      ? `Your Current Location (${userCoords.lat.toFixed(3)}, ${userCoords.lon.toFixed(3)})`
                      : `${locationLabel || 'Current Region'} (uses GPS on route)`}
                  </span>
                </span>
              </div>
              {geoNotice && (
                <div className="text-[10px] text-amber-300/90 leading-snug">{geoNotice}</div>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-[11px]">
                  {(['driving', 'foot', 'bike'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setTravelMode(m);
                        if (route) {
                          handleDirections(m);
                        }
                      }}
                      className={`px-2 py-1 rounded-lg capitalize ${
                        travelMode === m ? 'bg-gold-400/20 text-gold-200' : 'text-[#9a9da3] hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleDirections()}
                  disabled={routeLoading || locating}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-b from-gold-200 to-gold-400 text-[#090a0c] text-xs font-semibold flex items-center gap-1"
                >
                  <Route className="w-3.5 h-3.5" />
                  <span>{locating ? 'Locating...' : routeLoading ? 'Routing...' : 'Directions'}</span>
                </button>
              </div>

              {route && (
                <div className="p-2.5 rounded-xl bg-[#171a1e] border border-gold-400/25 text-xs space-y-1.5 max-h-36 overflow-y-auto">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-gold-200 font-semibold tabular-nums">
                      {route.distanceKm} km
                      {route.durationMin !== null ? ` · ~${route.durationMin} min` : ' · Direct path'} ({route.mode})
                    </div>
                    {route.externalDirectionsUrl && (
                      <a
                        href={route.externalDirectionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-gold-300 hover:underline inline-flex items-center gap-0.5 shrink-0"
                      >
                        <span>OSM Route</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  {route.steps?.slice(0, 6).map((s, si) => (
                    <div key={si} className="text-[11px] text-[#c5c7ca]">
                      {si + 1}. {s.instruction} ({s.distanceM} m)
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Compact Inline Map Preview (Leaflet + OpenStreetMap, No API Key Required)
// =============================================================================
interface InlineGeoMapPreviewProps {
  lat: number;
  lon: number;
  label?: string;
}

export const InlineGeoMapPreview: React.FC<InlineGeoMapPreviewProps> = ({ lat, lon, label }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const map = L.map(el, {
      center: [lat, lon],
      zoom: 11,
      zoomControl: false,
      attributionControl: true,
      dragging: true,
      scrollWheelZoom: false
    });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 16,
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; &copy; OpenStreetMap contributors'
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 16,
      maxZoom: 19
    }).addTo(map);

    const pin = L.divIcon({
      className: 'pendulum-mini-pin',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      html: '<div style="width:20px;height:20px;border-radius:999px;background:#d2b477;border:2px solid #fffaf0;box-shadow:0 3px 10px rgba(0,0,0,0.5);"></div>'
    });

    const marker = L.marker([lat, lon], { icon: pin }).addTo(map);
    if (label) marker.bindTooltip(label);

    const timer = window.setTimeout(() => map.invalidateSize(), 100);
    return () => {
      window.clearTimeout(timer);
      map.remove();
    };
  }, [lat, lon, label]);

  return (
    <div className="h-[168px] w-full rounded-xl overflow-hidden border border-white/10 bg-[#0d0f13]">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
