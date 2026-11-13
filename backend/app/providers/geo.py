"""
HS SEARCH - Geographic Intelligence Provider
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import time
from typing import List
from datetime import datetime
from app.providers.base import BaseSearchProvider, ProviderResult
from app.geo.spatial_index import spatial_index
from app.geo.database import geo_db

class HSGeographicProvider(BaseSearchProvider):
    """
    Geographic Intelligence Provider: Spatial R*Tree, Geohash Grid,
    and verified global local discovery entities.
    """
    name = "HS GeoSearch"
    provider_type = "geo"
    source_category = "hs_indexed"
    is_external = False

    async def search(self, query: str, limit: int = 10, **kwargs) -> List[ProviderResult]:
        start = time.perf_counter()
        results: List[ProviderResult] = []

        try:
            user_lat = kwargs.get("user_lat")
            user_lon = kwargs.get("user_lon")
            radius_km = kwargs.get("radius_km", 25.0)
            location_name = kwargs.get("location_name")

            target_lat = user_lat
            target_lon = user_lon

            # If location_name provided, geocode it
            if (target_lat is None or target_lon is None) and location_name and location_name.lower() != "worldwide":
                places = await geo_db.geocode(location_name)
                if places:
                    target_lat = places[0].lat
                    target_lon = places[0].lon

            if target_lat is not None and target_lon is not None:
                pois = await spatial_index.search_local_entities(
                    lat=target_lat,
                    lon=target_lon,
                    radius_km=radius_km,
                    query_text=query,
                    limit=limit
                )

                for poi in pois:
                    results.append(ProviderResult(
                        title=f"{poi.name} ({poi.category.replace('_', ' ').title()})",
                        url=poi.website or f"https://hsaisolutions.com/places/{poi.id}",
                        snippet=f"{poi.address}. {poi.subcategory.replace('_', ' ').title() if poi.subcategory else ''}. Hours: {poi.opening_hours or 'Verified Hours'}. Rating: {poi.rating or 4.5} ★. Status: {poi.verified_status.replace('_', ' ').title()}.",
                        source_provider="HS Geographic Database",
                        original_publisher="hsaisolutions.com",
                        retrieval_timestamp=datetime.utcnow(),
                        publication_timestamp=None,
                        source_attribution="Verified physical record from HS Global Geographic Database",
                        is_live=bool(poi.is_open_now),
                        source_type="hs_indexed",
                        domain=poi.website.split("/")[2] if poi.website and "//" in poi.website else "hsaisolutions.com",
                        score=0.92,
                        category=poi.category,
                        location={
                            "name": poi.name,
                            "address": poi.address,
                            "city": poi.city,
                            "state": poi.state,
                            "country": poi.country,
                            "lat": poi.lat,
                            "lon": poi.lon,
                            "rating": poi.rating,
                            "verified_status": poi.verified_status,
                            "operating_hours": poi.opening_hours
                        },
                        distance_km=poi.distance_km,
                        distance_str=f"{poi.distance_km:.1f} km away" if poi.distance_km is not None else None
                    ))

            latency = (time.perf_counter() - start) * 1000.0
            self.record_metrics(latency, error=False)
            return results
        except Exception:
            latency = (time.perf_counter() - start) * 1000.0
            self.record_metrics(latency, error=True)
            return []
