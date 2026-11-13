import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SearchResultItem, GeoCoordinates } from '../types';
import { MapPin, Navigation, ExternalLink, ShieldCheck, Star } from 'lucide-react';

interface GlobalMapViewProps {
  results: SearchResultItem[];
  centerCoords?: GeoCoordinates;
  radiusKm?: number;
  locationName?: string;
  selectedResultId?: number | null;
  onSelectResult?: (id: number) => void;
  className?: string;
}

export const GlobalMapView: React.FC<GlobalMapViewProps> = ({
  results,
  centerCoords,
  radiusKm = 25,
  locationName,
  selectedResultId,
  onSelectResult,
  className = 'h-[500px] w-full rounded-2xl'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const circleRef = useRef<L.Circle | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const initialLat = centerCoords?.lat ?? 12.9229; // Default Chennai/Tambaram fallback
    const initialLon = centerCoords?.lon ?? 80.1275;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 12,
      zoomControl: false,
      attributionControl: true
    });

    // Dark Obsidian CartoDB Tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // Zoom control in top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update center point and radius circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (centerCoords && centerCoords.lat && centerCoords.lon) {
      const latLng: [number, number] = [centerCoords.lat, centerCoords.lon];

      // Remove previous center marker
      if (centerMarkerRef.current) {
        map.removeLayer(centerMarkerRef.current);
      }

      // Custom Center Marker Icon
      const centerHtml = `
        <div class="relative flex items-center justify-center">
          <div class="w-8 h-8 rounded-full bg-gold-400/20 animate-ping absolute"></div>
          <div class="w-5 h-5 rounded-full bg-gold-400 border-2 border-obsidian-950 flex items-center justify-center shadow-gold-glow">
            <div class="w-2 h-2 rounded-full bg-obsidian-950"></div>
          </div>
        </div>
      `;
      const centerIcon = L.divIcon({
        html: centerHtml,
        className: 'custom-center-pin',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      centerMarkerRef.current = L.marker(latLng, { icon: centerIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip(`Center: ${locationName || 'Search Origin'}`, {
          direction: 'top',
          className: 'custom-leaflet-tooltip'
        });

      // Update Radius Circle
      if (circleRef.current) {
        map.removeLayer(circleRef.current);
      }

      if (radiusKm && radiusKm > 0) {
        circleRef.current = L.circle(latLng, {
          radius: radiusKm * 1000,
          color: '#D4AF37',
          weight: 1.5,
          opacity: 0.7,
          dashArray: '4, 6',
          fillColor: '#D4AF37',
          fillOpacity: 0.06
        }).addTo(map);
      }
    }
  }, [centerCoords, radiusKm, locationName]);

  // Update Result Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing result markers
    markersRef.current.forEach((marker) => map.removeLayer(marker));
    markersRef.current.clear();

    const bounds: L.LatLngTuple[] = [];

    if (centerCoords && centerCoords.lat && centerCoords.lon) {
      bounds.push([centerCoords.lat, centerCoords.lon]);
    }

    results.forEach((item, index) => {
      const loc = item.location;
      if (!loc) return;

      const lat = loc.lat ?? loc.coordinates?.lat;
      const lon = loc.lon ?? loc.coordinates?.lon;
      if (typeof lat !== 'number' || typeof lon !== 'number') return;

      bounds.push([lat, lon]);

      const isSelected = selectedResultId === item.id;
      const markerNumber = index + 1;

      // Custom Marker Pin
      const pinHtml = `
        <div class="group relative cursor-pointer transform transition-transform hover:scale-110 ${isSelected ? 'scale-125 z-50' : ''}">
          <div class="w-7 h-7 rounded-full ${isSelected ? 'bg-amber-300 text-obsidian-950 ring-2 ring-white shadow-gold-glow-lg' : 'bg-obsidian-900 text-gold-400 border border-gold-400/80 shadow-gold-glow'} flex items-center justify-center font-mono text-[10px] font-bold">
            ${markerNumber}
          </div>
          <div class="w-1.5 h-1.5 bg-gold-400 mx-auto rotate-45 -mt-1 ${isSelected ? 'bg-amber-300' : ''}"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: pinHtml,
        className: 'custom-geo-marker',
        iconSize: [28, 36],
        iconAnchor: [14, 34],
        popupAnchor: [0, -32]
      });

      const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);

      // Popup Content (Obsidian & Gold Styled)
      const popupHtml = `
        <div class="p-3 bg-obsidian-950 text-neutral-200 rounded-xl border border-gold-400/30 max-w-[260px] font-sans">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-gold-400/15 text-gold-300 border border-gold-400/30">
              #${markerNumber} ${item.category || 'Place'}
            </span>
            ${item.distance_str ? `<span class="text-[10px] font-mono text-neutral-400">📍 ${item.distance_str}</span>` : ''}
          </div>
          <h4 class="font-serif font-bold text-white text-sm leading-snug mb-1 hover:text-gold-300">
            <a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
          </h4>
          <p class="text-xs text-neutral-400 line-clamp-2 mb-2 leading-relaxed">
            ${item.snippet}
          </p>
          ${loc.address || loc.city ? `
            <div class="text-[10px] text-neutral-400 font-mono mb-2 flex items-center gap-1">
              <span>📍</span>
              <span class="truncate">${loc.address || `${loc.locality || ''}, ${loc.city || ''}`}</span>
            </div>
          ` : ''}
          ${loc.verified_status ? `
            <div class="text-[10px] text-emerald-400 font-mono mb-2 flex items-center gap-1">
              <span>✓ Verified ${loc.verified_status}</span>
            </div>
          ` : ''}
          <div class="pt-2 border-t border-obsidian-800 flex items-center justify-between text-[11px]">
            <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="text-gold-400 hover:underline flex items-center gap-1 font-mono">
              View Website ↗
            </a>
            ${loc.operating_hours ? `<span class="text-[10px] text-neutral-500">${loc.operating_hours}</span>` : ''}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: 'custom-dark-popup',
        maxWidth: 280
      });

      marker.on('click', () => {
        if (onSelectResult) {
          onSelectResult(item.id);
        }
      });

      markersRef.current.set(item.id, marker);
    });

    // Fit bounds if markers exist
    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 13);
      } else {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    }
  }, [results, selectedResultId]);

  // Handle selected result zoom/popup
  useEffect(() => {
    if (!selectedResultId || !mapRef.current) return;
    const marker = markersRef.current.get(selectedResultId);
    if (marker) {
      const latLng = marker.getLatLng();
      mapRef.current.flyTo(latLng, 15, { duration: 1.0 });
      marker.openPopup();
    }
  }, [selectedResultId]);

  const handleRecenter = () => {
    if (!mapRef.current || !centerCoords) return;
    mapRef.current.flyTo([centerCoords.lat, centerCoords.lon], 13);
  };

  return (
    <div className={`relative overflow-hidden border border-obsidian-800 bg-obsidian-950 ${className}`}>
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Map Overlay Controls Header */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center space-x-2">
        <div className="px-3 py-1.5 rounded-xl bg-obsidian-950/90 backdrop-blur-md border border-gold-400/30 text-xs font-mono text-neutral-200 flex items-center space-x-2 shadow-gold-glow">
          <MapPin className="w-3.5 h-3.5 text-gold-400" />
          <span className="font-semibold text-gold-300">
            {locationName || (centerCoords ? `${centerCoords.lat.toFixed(3)}, ${centerCoords.lon.toFixed(3)}` : 'Global Map')}
          </span>
          {radiusKm ? (
            <span className="text-[10px] text-neutral-400 border-l border-obsidian-750 pl-2">
              Radius: {radiusKm} km
            </span>
          ) : null}
        </div>

        {centerCoords && (
          <button
            onClick={handleRecenter}
            className="p-1.5 rounded-xl bg-obsidian-950/90 backdrop-blur-md border border-obsidian-750 text-neutral-300 hover:text-gold-300 hover:border-gold-400/40 transition-all text-xs"
            title="Recenter Map"
          >
            <Navigation className="w-4 h-4 text-gold-400" />
          </button>
        )}
      </div>

      {/* Legend Footer */}
      <div className="absolute bottom-3 left-3 z-[1000] hidden sm:flex items-center space-x-3 px-3 py-1.5 rounded-xl bg-obsidian-950/90 backdrop-blur-md border border-obsidian-800 text-[10px] font-mono text-neutral-400">
        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-gold-400 inline-block"></span>
          <span>Center</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-obsidian-850 border border-gold-400/80 inline-block"></span>
          <span>Result ({markersRef.current.size})</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-3 h-0.5 border-t border-dashed border-gold-400 inline-block"></span>
          <span>Radius Boundary</span>
        </div>
      </div>
    </div>
  );
};
