"""
Pendulum Search - Video, Image, Map & Media API Router
Company: HS AI Solutions
Founder: Harshan Seliyan

Implements unified endpoints:
- GET /api/videos/search?q=
- GET /api/images/search?q=
- GET /api/maps/search?q=
- GET /api/maps/geocode?q=
- GET /api/maps/nearby?lat=&lon=&type=&radius=
- GET /api/media/metadata?url=
"""

import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.providers.image import image_search_provider
from app.providers.map import geocoding_provider, map_search_provider
from app.providers.media_metadata import media_metadata_provider
from app.providers.video import video_search_provider

router = APIRouter(prefix="/api", tags=["Media & Geospatial Search"])


@router.get("/videos/search")
async def search_videos(
    q: str = Query(..., min_length=1, description="Video search query"),
    limit: int = Query(16, ge=1, le=50, description="Results limit")
):
    """
    Search videos across YouTube official embeds, Wikimedia Commons video library,
    and open educational media. Returns verified embed URLs for Pendulum Media Player.
    """
    start = time.perf_counter()
    videos = await video_search_provider.search(q, limit=limit)
    execution_time_ms = round((time.perf_counter() - start) * 1000.0, 1)

    return {
        "engine": "Pendulum Video Engine",
        "company": "HS AI Solutions",
        "founder": "Harshan Seliyan",
        "query": q,
        "total": len(videos),
        "execution_time_ms": execution_time_ms,
        "results": videos
    }


@router.get("/images/search")
async def search_images(
    q: str = Query(..., min_length=1, description="Image search query"),
    limit: int = Query(30, ge=1, le=80, description="Results limit"),
    license: Optional[str] = Query(None, description="License filter: cc, public_domain, commercial"),
    aspect: Optional[str] = Query(None, description="Aspect filter: tall, wide, square")
):
    """
    Search high-resolution open images across Wikimedia Commons and Openverse catalogs.
    Returns full licensing attribution, dimensions, thumbnails, and verified source links.
    """
    start = time.perf_counter()
    images = await image_search_provider.search(q, limit=limit, license_filter=license, aspect_ratio=aspect)
    execution_time_ms = round((time.perf_counter() - start) * 1000.0, 1)

    return {
        "engine": "Pendulum Image Discovery",
        "company": "HS AI Solutions",
        "founder": "Harshan Seliyan",
        "query": q,
        "total": len(images),
        "execution_time_ms": execution_time_ms,
        "results": images
    }


@router.get("/maps/search")
async def search_maps(
    q: str = Query(..., min_length=1, description="Location search query"),
    limit: int = Query(10, ge=1, le=25)
):
    """
    Search places and geographic features using OpenStreetMap data.
    Returns primary map focus, boundary boxes, alternative matches, and nearby amenities.
    """
    start = time.perf_counter()
    map_data = await map_search_provider.search(q, limit=limit)
    execution_time_ms = round((time.perf_counter() - start) * 1000.0, 1)
    map_data["execution_time_ms"] = execution_time_ms
    map_data["engine"] = "Pendulum Interactive Maps"
    map_data["company"] = "HS AI Solutions"
    return map_data


@router.get("/maps/geocode")
async def geocode_location(
    q: str = Query(..., min_length=1, description="Address or place query"),
    limit: int = Query(5, ge=1, le=15)
):
    """Geocode place or address into geographic coordinates using OpenStreetMap Nominatim."""
    places = await geocoding_provider.geocode(q, limit=limit)
    return {
        "query": q,
        "total": len(places),
        "results": places
    }


@router.get("/maps/nearby")
async def get_nearby_amenities(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    type: Optional[str] = Query(None, description="Amenity type: restaurant, hospital, school, university, landmark, cafe, bank"),
    radius: float = Query(3.0, ge=0.2, le=50.0, description="Search radius in kilometers"),
    limit: int = Query(20, ge=1, le=50)
):
    """Query nearby real-world points of interest via Overpass API and spatial indexing."""
    start = time.perf_counter()
    amenities = await map_search_provider.nearby(lat, lon, amenity_type=type, radius_km=radius, limit=limit)
    execution_time_ms = round((time.perf_counter() - start) * 1000.0, 1)

    return {
        "lat": lat,
        "lon": lon,
        "amenity_type": type or "all",
        "radius_km": radius,
        "total": len(amenities),
        "execution_time_ms": execution_time_ms,
        "results": amenities
    }


@router.get("/media/metadata")
async def get_media_metadata(
    url: str = Query(..., min_length=1, description="Media or web page URL")
):
    """Extract canonical embed code, dimensions, licensing, and permissions for any media URL."""
    metadata = await media_metadata_provider.get_metadata(url)
    return metadata
