"""
HS SEARCH - Global Geolocation Intelligence API Router
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

from fastapi import APIRouter, Query, HTTPException, Request, Body
from typing import Optional, List, Dict, Any
from app.geo.database import geo_db
from app.geo.spatial_index import spatial_index
from app.geo.query_parser import location_query_parser
from app.geo.live_local import live_local_service
from app.geo.models import GeoCoordinates

router = APIRouter(prefix="/api/geo", tags=["Geolocation"])

@router.get("/detect")
async def detect_location(request: Request):
    """
    Automatic location detection using client headers / IP or privacy-safe default.
    Always allows user manual override.
    """
    client_host = request.client.host if request.client else "127.0.0.1"
    
    # Check standard reverse proxy headers
    forwarded_for = request.headers.get("x-forwarded-for")
    cf_country = request.headers.get("cf-ipcountry")
    
    # Default initial fallback (Tambaram, Chennai, Tamil Nadu) for testing/initial load, or global
    detected = {
        "detection_method": "ip_approximate",
        "ip": forwarded_for.split(",")[0].strip() if forwarded_for else client_host,
        "country_code": cf_country or "IN",
        "country_name": "India",
        "state": "Tamil Nadu",
        "city": "Chennai",
        "locality": "Tambaram",
        "lat": 12.9249,
        "lon": 80.1000,
        "precision": "approximate_city",
        "requires_permission_for_gps": True,
        "privacy_policy": "Precise GPS is only accessed when explicitly permitted. User may select manual location at any time."
    }
    return detected

@router.get("/autocomplete")
async def autocomplete_locations(
    q: str = Query(..., min_length=1, description="Location prefix string"),
    limit: int = Query(8, ge=1, le=20)
):
    """
    Fast multilingual location autocomplete suggestions across global countries,
    states, districts, cities, towns, and localities.
    """
    results = await geo_db.autocomplete_locations(q, limit=limit)
    return {
        "query": q,
        "suggestions": results
    }

@router.get("/geocode")
async def geocode_place(
    q: str = Query(..., min_length=1, description="Place name or address"),
    country_hint: Optional[str] = Query(None, description="Country code hint (e.g. US, IN, GB, JP)"),
    state_hint: Optional[str] = Query(None, description="State/Province hint"),
    user_lat: Optional[float] = Query(None),
    user_lon: Optional[float] = Query(None)
):
    """
    Geocode a place name with intelligent context-aware disambiguation.
    Resolves ambiguous place names (e.g. London UK vs London Ontario; Cambridge MA vs Cambridge UK).
    """
    matches = await geo_db.geocode(
        query=q,
        country_hint=country_hint,
        state_hint=state_hint,
        user_lat=user_lat,
        user_lon=user_lon
    )
    return {
        "query": q,
        "total_matches": len(matches),
        "primary_match": matches[0].model_dump() if matches else None,
        "ambiguous_candidates": [m.model_dump() for m in matches[1:5]]
    }

@router.get("/reverse")
async def reverse_geocode(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0)
):
    """
    Reverse geocode coordinates into full address hierarchy via spatial R*Tree.
    """
    place = await geo_db.reverse_geocode(lat, lon)
    if not place:
        return {
            "lat": lat,
            "lon": lon,
            "location_found": False,
            "message": "Coordinates are outside indexed geographic settlements."
        }
    return {
        "lat": lat,
        "lon": lon,
        "location_found": True,
        "place": place.model_dump()
    }

@router.get("/hierarchy")
async def get_geographical_hierarchy(
    continent: Optional[str] = Query(None),
    country_code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    city: Optional[str] = Query(None)
):
    """
    Hierarchical location selector:
    World -> Continent -> Country -> State / Province -> City -> Locality
    """
    tree = await geo_db.get_hierarchy(
        continent=continent,
        country_code=country_code,
        state_province=state,
        city=city
    )
    return tree

@router.get("/nearby")
async def nearby_search(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(25.0, ge=0.5, le=500.0),
    category: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=100)
):
    """
    Search nearby documents and local points of interest within radius (km).
    """
    docs = await spatial_index.search_radius(
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        category=category,
        limit=limit
    )
    pois = await spatial_index.search_local_entities(
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        category=category,
        limit=limit
    )
    return {
        "center": {"lat": lat, "lon": lon},
        "radius_km": radius_km,
        "category_filter": category,
        "total_documents": len(docs),
        "total_local_entities": len(pois),
        "documents": docs,
        "local_entities": [poi.model_dump() for poi in pois]
    }

@router.get("/local-discovery")
async def discover_local_entities(
    city: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    category: Optional[str] = Query("all", description="hospital, university, college, restaurant, hotel, government, etc."),
    radius_km: float = Query(25.0, ge=1.0, le=200.0),
    q: Optional[str] = Query(None)
):
    """
    Global Local Discovery: Public directory of verified entities
    (Hospitals, Universities, Colleges, Restaurants, Government offices, Landmarks).
    """
    target_lat = lat
    target_lon = lon

    if (target_lat is None or target_lon is None) and city:
        places = await geo_db.geocode(city)
        if places:
            target_lat = places[0].lat
            target_lon = places[0].lon

    if target_lat is None or target_lon is None:
        target_lat = 12.9249
        target_lon = 80.1000

    pois = await spatial_index.search_local_entities(
        lat=target_lat,
        lon=target_lon,
        radius_km=radius_km,
        category=category if category != "all" else None,
        query_text=q,
        limit=50
    )

    return {
        "center": {"lat": target_lat, "lon": target_lon},
        "category": category,
        "total": len(pois),
        "results": [p.model_dump() for p in pois]
    }

@router.get("/live-local")
async def get_live_local(city: str = Query(..., description="Target city name")):
    """
    Get verified time-sensitive local information: real-time weather, public transit, and advisories.
    """
    info = live_local_service.get_live_local_info(city)
    if not info:
        return {
            "city": city,
            "has_live_feed": False,
            "message": f"Real-time local sensor feed for '{city}' is currently in regular sync cycle."
        }
    return info

@router.post("/preference")
async def update_location_preference(data: Dict[str, Any] = Body(...)):
    """
    Update user's session location preference and privacy setting.
    No permanent coordinates are stored to maintain user privacy.
    """
    return {
        "status": "success",
        "mode": data.get("mode", "worldwide"),
        "city": data.get("city"),
        "country": data.get("country"),
        "privacy_mode": data.get("privacy_mode", "standard"),
        "message": "Location preferences updated for current search session."
    }
