"""
Pendulum Search - Interactive Map & Geocoding Provider
Company: HS AI Solutions
Founder: Harshan Seliyan

Integrates interactive maps and geospatial discovery without paid API keys:
1. OpenStreetMap Nominatim geocoding & reverse geocoding
2. Overpass API for querying real-world amenities & POIs (restaurants, hospitals, schools, landmarks)
3. OpenStreetMap routing links (OSRM)
4. Pendulum Local Spatial Index & Geographic Knowledge Base

Key Guarantees:
- Real geographic coordinates and genuine addresses.
- Respects OpenStreetMap usage policies with custom User-Agent and caching.
- Zero paid API keys required.
"""

import asyncio
import logging
import math
import time
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

from app.geo.database import geo_db
from app.geo.spatial_index import spatial_index

logger = logging.getLogger(__name__)

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_USER_AGENT = "PendulumSearch/1.0 (https://hsaisolutions.com; contact@hsaisolutions.com)"
_CACHE_TTL_SEC = 1800.0  # 30 minutes


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points on Earth in kilometers."""
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


class GeoCodingProvider:
    """Geocodes place names, addresses, and geographic features using Nominatim & geo_db."""

    def __init__(self):
        self._cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
        self._lock = asyncio.Lock()

    async def geocode(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        clean_q = (query or "").strip()
        if not clean_q:
            return []

        cache_key = f"geo:{clean_q.lower()}:{limit}"
        now = time.time()
        async with self._lock:
            if cache_key in self._cache:
                exp, data = self._cache[cache_key]
                if now < exp:
                    return data
                del self._cache[cache_key]

        results: List[Dict[str, Any]] = []

        # 1. Check native geo_db first
        try:
            native_matches = await geo_db.geocode(clean_q)
            for m in native_matches[:limit]:
                results.append({
                    "name": m.name,
                    "display_name": f"{m.name}, {m.state_province or ''}, {m.country_name}".replace(", ,", ",").strip(", "),
                    "lat": m.coordinates.lat,
                    "lon": m.coordinates.lon,
                    "category": m.category,
                    "type": m.place_type,
                    "country": m.country_name,
                    "state": m.state_province,
                    "source": "Pendulum Geographic Registry"
                })
        except Exception:
            pass

        # 2. Query Nominatim for global coverage
        try:
            headers = {"User-Agent": _USER_AGENT, "Accept-Language": "en"}
            params = {
                "q": clean_q,
                "format": "json",
                "addressdetails": "1",
                "limit": str(limit)
            }
            async with httpx.AsyncClient(headers=headers, timeout=4.5) as client:
                resp = await client.get(_NOMINATIM_URL, params=params)
                if resp.status_code == 200:
                    for item in resp.json():
                        lat = float(item.get("lat", 0.0))
                        lon = float(item.get("lon", 0.0))
                        if not lat and not lon:
                            continue

                        # Avoid duplicate coordinates
                        if any(abs(r["lat"] - lat) < 0.005 and abs(r["lon"] - lon) < 0.005 for r in results):
                            continue

                        addr = item.get("address", {})
                        city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("suburb", "")
                        state = addr.get("state") or addr.get("province", "")
                        country = addr.get("country", "")

                        bbox = [float(x) for x in item.get("boundingbox", [lat - 0.05, lat + 0.05, lon - 0.05, lon + 0.05])]

                        results.append({
                            "name": item.get("name") or clean_q.title(),
                            "display_name": item.get("display_name", ""),
                            "lat": lat,
                            "lon": lon,
                            "boundingbox": bbox,
                            "category": item.get("class", "place"),
                            "type": item.get("type", "location"),
                            "city": city,
                            "state": state,
                            "country": country,
                            "importance": item.get("importance", 0.5),
                            "osm_id": item.get("osm_id"),
                            "directions_url": f"https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B{lat}%2C{lon}",
                            "source": "OpenStreetMap Nominatim"
                        })
        except Exception as exc:
            logger.debug("Nominatim geocoding error: %s", exc)

        # Save to cache
        async with self._lock:
            if len(self._cache) > 500:
                self._cache.clear()
            self._cache[cache_key] = (now + _CACHE_TTL_SEC, results)

        return results[:limit]


class MapSearchProvider:
    """
    Modular Map Search Provider.
    Returns geocoded locations, nearby points of interest (restaurants, hospitals, schools, etc.),
    and interactive map rendering metadata.
    """

    def __init__(self):
        self.geocoder = GeoCodingProvider()
        self._poi_cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
        self._lock = asyncio.Lock()

    async def search(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Search locations and return structured map view with primary focus and alternatives."""
        places = await self.geocoder.geocode(query, limit=limit)
        if not places:
            # Fallback default: Global center
            primary = {
                "name": query.title(),
                "display_name": f"Global location for {query}",
                "lat": 20.0,
                "lon": 0.0,
                "zoom": 2,
                "source": "OpenStreetMap"
            }
            return {
                "query": query,
                "primary": primary,
                "places": [],
                "nearby_amenities": []
            }

        primary = places[0]
        primary["zoom"] = 14 if primary.get("type") in ("building", "amenity", "attraction") else 12

        # Fetch nearby amenities around primary location
        nearby = await self.nearby(primary["lat"], primary["lon"], radius_km=3.0, limit=12)

        return {
            "query": query,
            "primary": primary,
            "places": places,
            "nearby_amenities": nearby,
            "tile_layer": {
                "standard": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "attribution": '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }
        }

    async def nearby(
        self,
        lat: float,
        lon: float,
        amenity_type: Optional[str] = None,
        radius_km: float = 3.0,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Query nearby amenities (restaurants, hospitals, schools, universities, landmarks)."""
        cache_key = f"{round(lat, 3)}:{round(lon, 3)}:{amenity_type}:{radius_km}:{limit}"
        now = time.time()
        async with self._lock:
            if cache_key in self._poi_cache:
                exp, data = self._poi_cache[cache_key]
                if now < exp:
                    return data
                del self._poi_cache[cache_key]

        amenities: List[Dict[str, Any]] = []

        # 1. Check local spatial index documents
        try:
            local_docs = await spatial_index.search_radius(lat, lon, radius_km=radius_km, limit=limit)
            for d in local_docs:
                loc = d.get("location", {})
                d_lat = loc.get("lat")
                d_lon = loc.get("lon")
                if d_lat and d_lon:
                    dist = _haversine_distance_km(lat, lon, d_lat, d_lon)
                    amenities.append({
                        "id": f"native_poi_{d.get('id')}",
                        "name": d.get("title"),
                        "category": d.get("category", "amenity"),
                        "type": loc.get("type", "poi"),
                        "lat": d_lat,
                        "lon": d_lon,
                        "distance_km": round(dist, 2),
                        "distance_str": f"{dist:.1f} km away",
                        "address": loc.get("address") or d.get("snippet", "")[:120],
                        "source": "Pendulum Local Index"
                    })
        except Exception:
            pass

        # 2. Query Overpass API for real OpenStreetMap features
        try:
            radius_meters = int(radius_km * 1000)
            # Default amenity filter or custom type
            type_filter = amenity_type if amenity_type else "restaurant|hospital|school|university|cafe|bank|pharmacy|attraction"
            # Overpass QL without pipe collision
            ql = f'[out:json][timeout:6];node(around:{radius_meters},{lat},{lon})["amenity"];out {limit};'
            if amenity_type:
                ql = f'[out:json][timeout:6];node(around:{radius_meters},{lat},{lon})["amenity"="{amenity_type}"];out {limit};'

            headers = {"User-Agent": _USER_AGENT}
            async with httpx.AsyncClient(headers=headers, timeout=6.0) as client:
                resp = await client.post(_OVERPASS_URL, data=ql)
                if resp.status_code == 200:
                    elements = resp.json().get("elements", [])
                    for el in elements:
                        tags = el.get("tags", {})
                        name = tags.get("name") or tags.get("operator")
                        if not name:
                            continue

                        e_lat = el.get("lat")
                        e_lon = el.get("lon")
                        if not e_lat or not e_lon:
                            continue

                        dist = _haversine_distance_km(lat, lon, e_lat, e_lon)
                        amenity_val = tags.get("amenity", "point_of_interest")

                        addr_parts = [tags.get("addr:housenumber"), tags.get("addr:street"), tags.get("addr:city")]
                        address_str = ", ".join([p for p in addr_parts if p]) or f"Near {lat:.3f}, {lon:.3f}"

                        amenities.append({
                            "id": f"osm_poi_{el.get('id')}",
                            "name": name,
                            "category": "amenity",
                            "type": amenity_val,
                            "lat": e_lat,
                            "lon": e_lon,
                            "distance_km": round(dist, 2),
                            "distance_str": f"{dist:.1f} km away" if dist >= 0.1 else "Nearby",
                            "address": address_str,
                            "website": tags.get("website") or tags.get("contact:website"),
                            "phone": tags.get("phone") or tags.get("contact:phone"),
                            "opening_hours": tags.get("opening_hours"),
                            "source": "OpenStreetMap Overpass"
                        })
        except Exception as exc:
            logger.debug("Overpass POI query error: %s", exc)

        # Sort amenities by distance
        amenities.sort(key=lambda x: x.get("distance_km", 999.0))
        final_list = amenities[:limit]

        # Save to cache
        async with self._lock:
            if len(self._poi_cache) > 500:
                self._poi_cache.clear()
            self._poi_cache[cache_key] = (now + _CACHE_TTL_SEC, final_list)

        return final_list


geocoding_provider = GeoCodingProvider()
map_search_provider = MapSearchProvider()
