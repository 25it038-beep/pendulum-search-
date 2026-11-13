import React, { useState, useEffect } from 'react';
import { 
  MapPin, Globe, Compass, Navigation, Search, Check, X, Shield, 
  ChevronRight, Sliders, AlertCircle, Eye, EyeOff 
} from 'lucide-react';
import { 
  fetchLocationAutocompleteAPI, 
  fetchGeoHierarchyAPI, 
  detectLocationAPI, 
  updateLocationPreferenceAPI 
} from '../services/api';
import { GeoPlaceSuggestion, LocationState } from '../types';

interface LocationSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationState: LocationState;
  onLocationChange: (newState: LocationState) => void;
}

export const LocationSelectorModal: React.FC<LocationSelectorModalProps> = ({
  isOpen,
  onClose,
  locationState,
  onLocationChange,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'hierarchy' | 'privacy'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoPlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoPermissionStatus, setGeoPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [radius, setRadius] = useState<number>(locationState.radiusKm || 25);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Hierarchical navigation state
  const [hierarchyLevel, setHierarchyLevel] = useState<'world' | 'continent' | 'country' | 'state' | 'city'>('world');
  const [hierarchyData, setHierarchyData] = useState<any>(null);
  const [selectedContinent, setSelectedContinent] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<{ name: string; code: string } | null>(null);
  const [selectedState, setSelectedState] = useState<string>('');
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);

  // Search autocomplete debounced
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await fetchLocationAutocompleteAPI(searchQuery);
      setSuggestions(res);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load initial hierarchy
  useEffect(() => {
    if (activeTab === 'hierarchy' && !hierarchyData) {
      loadHierarchyWorld();
    }
  }, [activeTab]);

  const loadHierarchyWorld = async () => {
    setLoadingHierarchy(true);
    try {
      const data = await fetchGeoHierarchyAPI();
      setHierarchyData(data);
      setHierarchyLevel('world');
    } catch {
      // Fallback
    } finally {
      setLoadingHierarchy(false);
    }
  };

  const handleSelectCountry = async (country: { name: string; code: string }) => {
    setSelectedCountry(country);
    setLoadingHierarchy(true);
    try {
      const data = await fetchGeoHierarchyAPI({ countryCode: country.code });
      setHierarchyData(data);
      setHierarchyLevel('country');
    } catch {
      //
    } finally {
      setLoadingHierarchy(false);
    }
  };

  const handleSelectState = async (stateName: string) => {
    setSelectedState(stateName);
    if (!selectedCountry) return;
    setLoadingHierarchy(true);
    try {
      const data = await fetchGeoHierarchyAPI({ countryCode: selectedCountry.code, state: stateName });
      setHierarchyData(data);
      setHierarchyLevel('state');
    } catch {
      //
    } finally {
      setLoadingHierarchy(false);
    }
  };

  const handleSelectCity = async (cityName: string, lat: number, lon: number) => {
    onLocationChange({
      mode: 'city',
      displayName: `${cityName}, ${selectedState ? selectedState + ', ' : ''}${selectedCountry?.name || ''}`,
      coords: { lat, lon },
      radiusKm: radius,
      rankingMode: 'city_specific',
      privacyMode: locationState.privacyMode
    });
    onClose();
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Browser geolocation is not supported on this device.');
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        setGeoPermissionStatus('granted');
        onLocationChange({
          mode: 'near_me',
          displayName: 'Current Device Location (GPS)',
          coords: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude
          },
          radiusKm: radius,
          rankingMode: 'near_me',
          privacyMode: locationState.privacyMode
        });
        onClose();
      },
      (err) => {
        setGpsLoading(false);
        setGeoPermissionStatus('denied');
        setGpsError(err.message || 'Location permission was denied. You can manually select your location below.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSelectWorldwide = () => {
    onLocationChange({
      mode: 'worldwide',
      displayName: 'Worldwide',
      radiusKm: 25,
      rankingMode: 'worldwide',
      privacyMode: locationState.privacyMode
    });
    onClose();
  };

  const handleSelectSuggestion = (item: GeoPlaceSuggestion) => {
    onLocationChange({
      mode: item.type === 'country' ? 'country' : item.type === 'state' ? 'region' : 'city',
      displayName: item.label,
      coords: { lat: item.lat, lon: item.lon },
      radiusKm: radius,
      rankingMode: item.type === 'country' ? 'country_specific' : 'city_specific',
      privacyMode: locationState.privacyMode
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-950/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-2xl bg-obsidian-900 border border-obsidian-750 rounded-2xl shadow-gold-glow-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-obsidian-800 flex items-center justify-between bg-obsidian-900/60">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
              <Compass className="w-4 h-4 text-gold-400" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-neutral-100">Global Geolocation Intelligence</h2>
              <p className="text-xs text-neutral-400">Select search scope, region, or explore places worldwide</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-obsidian-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-obsidian-800 px-6 bg-obsidian-950/40">
          <button
            onClick={() => setActiveTab('search')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'search'
                ? 'border-gold-400 text-gold-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search Any Location</span>
          </button>
          <button
            onClick={() => setActiveTab('hierarchy')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'hierarchy'
                ? 'border-gold-400 text-gold-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Browse Hierarchy (World)</span>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'privacy'
                ? 'border-gold-400 text-gold-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Privacy & Radius</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Actions Row */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleUseCurrentLocation}
              disabled={gpsLoading}
              className="flex items-center justify-center space-x-2 p-3 rounded-xl bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-750 hover:border-gold-400/40 text-neutral-200 text-xs font-medium transition-all group"
            >
              <Navigation className={`w-4 h-4 text-gold-400 ${gpsLoading ? 'animate-spin' : 'group-hover:scale-110'} transition-transform`} />
              <span>{gpsLoading ? 'Requesting GPS...' : 'Use My Current Location'}</span>
            </button>

            <button
              onClick={handleSelectWorldwide}
              className={`flex items-center justify-center space-x-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                locationState.mode === 'worldwide'
                  ? 'bg-gold-400/10 border-gold-400/50 text-gold-300'
                  : 'bg-obsidian-850 hover:bg-obsidian-800 border-obsidian-750 text-neutral-300'
              }`}
            >
              <Globe className="w-4 h-4 text-gold-400" />
              <span>Search Worldwide (No Bounds)</span>
            </button>
          </div>

          {gpsError && (
            <div className="flex items-start space-x-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Location Access Note</p>
                <p className="opacity-90">{gpsError}</p>
              </div>
            </div>
          )}

          {/* TAB 1: Search Any Location */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter city, town, village, district, or landmark (e.g. Tambaram, London, Tokyo, Adyar)..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-obsidian-950 border border-obsidian-750 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-gold-400 transition-colors font-sans"
                />
                {searching && (
                  <div className="absolute right-3.5 top-3.5 w-4 h-4 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {/* Suggestions List */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {suggestions.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full text-left p-3 rounded-xl bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 hover:border-gold-400/40 flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 rounded-lg bg-obsidian-900 flex items-center justify-center text-gold-400 group-hover:bg-gold-400/10 transition-colors">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-neutral-200 group-hover:text-gold-300 transition-colors">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {item.label}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-obsidian-900 text-neutral-400 border border-obsidian-800 uppercase">
                      {item.type}
                    </span>
                  </button>
                ))}

                {!searching && searchQuery.length >= 2 && suggestions.length === 0 && (
                  <div className="py-8 text-center text-xs text-neutral-500">
                    No matching global places found for "{searchQuery}". Try a different spelling or local name.
                  </div>
                )}

                {searchQuery.length < 2 && (
                  <div className="py-6 text-center text-xs text-neutral-500">
                    Type any country, state, district, city, town, or locality in any language (English, தமிழ், 日本語, etc.)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Browse Hierarchy */}
          {activeTab === 'hierarchy' && (
            <div className="space-y-4">
              {/* Breadcrumbs */}
              <div className="flex items-center space-x-2 text-xs font-mono text-neutral-400 pb-2 border-b border-obsidian-800">
                <button
                  onClick={loadHierarchyWorld}
                  className="hover:text-gold-400 underline underline-offset-4"
                >
                  World
                </button>
                {selectedCountry && (
                  <>
                    <ChevronRight className="w-3 h-3 text-neutral-600" />
                    <button
                      onClick={() => handleSelectCountry(selectedCountry)}
                      className="hover:text-gold-400 underline underline-offset-4"
                    >
                      {selectedCountry.name}
                    </button>
                  </>
                )}
                {selectedState && (
                  <>
                    <ChevronRight className="w-3 h-3 text-neutral-600" />
                    <span className="text-gold-300 font-semibold">{selectedState}</span>
                  </>
                )}
              </div>

              {loadingHierarchy ? (
                <div className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-neutral-400">Loading administrative regions...</p>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto pr-1">
                  {/* World Level: Continents & Countries */}
                  {hierarchyLevel === 'world' && hierarchyData?.continents && (
                    <div className="space-y-4">
                      {Object.entries(hierarchyData.continents).map(([continent, countries]: [string, any]) => (
                        <div key={continent} className="space-y-2">
                          <h4 className="text-xs font-mono font-bold text-gold-400 uppercase tracking-wider">{continent}</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {countries.map((c: any) => (
                              <button
                                key={c.code}
                                onClick={() => handleSelectCountry(c)}
                                className="p-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-left text-xs text-neutral-300 hover:text-gold-300 border border-obsidian-800 hover:border-gold-400/30 transition-colors"
                              >
                                {c.name} ({c.code})
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Country Level: States/Provinces */}
                  {hierarchyLevel === 'country' && hierarchyData?.states && (
                    <div className="grid grid-cols-2 gap-2">
                      {hierarchyData.states.map((st: any) => (
                        <button
                          key={st.name}
                          onClick={() => handleSelectState(st.name)}
                          className="p-3 rounded-xl bg-obsidian-850 hover:bg-obsidian-800 text-left text-xs text-neutral-200 hover:text-gold-300 border border-obsidian-800 flex justify-between items-center transition-colors"
                        >
                          <span>{st.name}</span>
                          <span className="text-[10px] font-mono text-neutral-500">{st.places} places</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* State Level: Cities */}
                  {hierarchyLevel === 'state' && hierarchyData?.cities && (
                    <div className="grid grid-cols-2 gap-2">
                      {hierarchyData.cities.map((ct: any) => (
                        <button
                          key={ct.name}
                          onClick={() => handleSelectCity(ct.name, ct.lat, ct.lon)}
                          className="p-3 rounded-xl bg-obsidian-850 hover:bg-obsidian-800 text-left text-xs text-neutral-200 hover:text-gold-300 border border-obsidian-800 flex justify-between items-center transition-colors group"
                        >
                          <div>
                            <div className="font-semibold text-neutral-100 group-hover:text-gold-300">{ct.name}</div>
                            <div className="text-[10px] text-neutral-500">{ct.population.toLocaleString()} residents</div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-gold-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Privacy & Search Radius */}
          {activeTab === 'privacy' && (
            <div className="space-y-5 text-xs text-neutral-300">
              {/* Search Radius Slider */}
              <div className="p-4 rounded-xl bg-obsidian-850 border border-obsidian-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-neutral-200 flex items-center space-x-1.5">
                    <Sliders className="w-3.5 h-3.5 text-gold-400" />
                    <span>Search Proximity Radius</span>
                  </span>
                  <span className="font-mono text-gold-300 font-bold">{radius} km</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="150"
                  step="1"
                  value={radius}
                  onChange={(e) => setRadius(parseInt(e.target.value))}
                  className="w-full accent-gold-400 bg-obsidian-950 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                  <span>2 km (Local neighborhood)</span>
                  <span>25 km (Metropolitan)</span>
                  <span>150 km (Regional)</span>
                </div>
              </div>

              {/* Privacy Principles */}
              <div className="p-4 rounded-xl bg-obsidian-850 border border-obsidian-800 space-y-2.5">
                <div className="flex items-center space-x-2 text-gold-400 font-semibold">
                  <Shield className="w-4 h-4" />
                  <span>Privacy-First Geolocation Architecture</span>
                </div>
                <ul className="space-y-1.5 text-neutral-400 text-[11px] leading-relaxed">
                  <li>• HS SEARCH never stores precise GPS coordinates permanently.</li>
                  <li>• User coordinates are never exposed in public search URLs or shared with third parties.</li>
                  <li>• Browser geolocation is strictly opt-in and requires explicit permission.</li>
                  <li>• Approximate city-level resolution is available for users who prefer higher privacy.</li>
                </ul>
              </div>

              {/* Current Active Location Summary */}
              <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800 flex justify-between items-center text-xs">
                <span className="text-neutral-400">Current Scope:</span>
                <span className="font-mono text-gold-300 font-semibold">{locationState.displayName}</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-obsidian-800 bg-obsidian-950/80 flex items-center justify-between text-xs font-mono text-neutral-400">
          <span>Active Scope: <strong className="text-gold-300">{locationState.displayName}</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-gold-400 text-obsidian-950 font-semibold hover:brightness-110 transition-all text-xs"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
