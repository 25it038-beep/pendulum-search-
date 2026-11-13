"""
HS SEARCH - Spatial Indexing & Geospatial Query Engine
Company: HS AI Solutions
Founder: Harshan Seliyan
Reference: W3C Spatial Data on the Web Best Practices
"""

import aiosqlite
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from shapely.geometry import Point, Polygon
from app.config import settings
from app.geo.models import GeoCoordinates, BoundingBox, DocumentLocationRecord, LocalDiscoveryItem
from app.geo.geohash import encode_geohash, haversine_distance_km, bounding_box_for_radius

logger = logging.getLogger(__name__)

class SpatialIndex:
    """
    Dedicated spatial index combining SQLite R*Tree, Geohash spatial grids,
    and Shapely geometric calculations.
    """

    def __init__(self, db_path=None):
        self.db_path = db_path or settings.DB_PATH

    async def index_document_location(self, loc: DocumentLocationRecord) -> int:
        """Add or update a document location in the spatial index and R*Tree."""
        geohash_str = loc.geohash or encode_geohash(loc.lat, loc.lon, precision=7)
        now_str = loc.last_verified_at.isoformat()

        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.execute(
                """INSERT INTO document_locations (
                    document_id, lat, lon, country_code, country_name,
                    state_province, district, city, locality, postal_code,
                    street_address, location_type, confidence, source,
                    evidence_text, geohash, last_verified_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    loc.document_id, loc.lat, loc.lon, loc.country_code,
                    loc.country_name, loc.state_province, loc.district,
                    loc.city, loc.locality, loc.postal_code, loc.street_address,
                    loc.location_type, loc.confidence, loc.source,
                    loc.evidence_text, geohash_str, now_str
                )
            )
            loc_id = cursor.lastrowid

            # Insert into R*Tree
            delta = 0.0001
            await conn.execute(
                """INSERT INTO document_geo_rtree (id, min_lat, max_lat, min_lon, max_lon)
                   VALUES (?, ?, ?, ?, ?)""",
                (loc_id, loc.lat - delta, loc.lat + delta, loc.lon - delta, loc.lon + delta)
            )
            await conn.commit()
            return loc_id

    async def search_radius(
        self,
        lat: float,
        lon: float,
        radius_km: float = 25.0,
        category: Optional[str] = None,
        location_type: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Search documents or places within a radius (km) using R*Tree bounding box
        followed by Haversine distance verification and sorting.
        """
        min_lat, max_lat, min_lon, max_lon = bounding_box_for_radius(lat, lon, radius_km)

        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row

            # Query candidate document locations via R*Tree
            sql = """
                SELECT dl.*, d.title, d.snippet, d.url, d.domain, d.indexed_at, d.published_at, d.metadata_json, d.images_json, d.quality_score, d.credibility_score
                FROM document_locations dl
                JOIN document_geo_rtree rt ON dl.id = rt.id
                JOIN documents d ON dl.document_id = d.id
                WHERE rt.min_lat <= ? AND rt.max_lat >= ?
                  AND rt.min_lon <= ? AND rt.max_lon >= ?
            """
            params = [max_lat, min_lat, max_lon, min_lon]

            if location_type:
                sql += " AND dl.location_type = ?"
                params.append(location_type)

            cursor = await conn.execute(sql, params)
            rows = await cursor.fetchall()

            matched = []
            for r in rows:
                dist = haversine_distance_km(lat, lon, r["lat"], r["lon"])
                if dist <= radius_km:
                    meta = json.loads(r["metadata_json"] or "{}")
                    doc_cat = meta.get("category", "general")
                    if category and category.lower() not in (doc_cat.lower(), "general", "all"):
                        continue

                    matched.append({
                        "document_id": r["document_id"],
                        "url": r["url"],
                        "domain": r["domain"],
                        "title": r["title"],
                        "snippet": r["snippet"],
                        "lat": r["lat"],
                        "lon": r["lon"],
                        "distance_km": round(dist, 2),
                        "distance_str": f"{dist:.1f} km away" if dist >= 1.0 else f"{int(dist * 1000)} m away",
                        "city": r["city"],
                        "state": r["state_province"],
                        "country": r["country_name"],
                        "country_code": r["country_code"],
                        "locality": r["locality"],
                        "street_address": r["street_address"],
                        "location_type": r["location_type"],
                        "confidence": r["confidence"],
                        "source": r["source"],
                        "evidence_text": r["evidence_text"],
                        "last_verified_at": r["last_verified_at"],
                        "quality_score": r["quality_score"],
                        "credibility_score": r["credibility_score"]
                    })

            # Sort by distance ascending
            matched.sort(key=lambda x: x["distance_km"])
            return matched[:limit]

    async def search_local_entities(
        self,
        lat: float,
        lon: float,
        radius_km: float = 25.0,
        category: Optional[str] = None,
        query_text: Optional[str] = None,
        limit: int = 30
    ) -> List[LocalDiscoveryItem]:
        """
        Search verified local entities (Hospitals, Colleges, Restaurants, etc.) within radius.
        """
        min_lat, max_lat, min_lon, max_lon = bounding_box_for_radius(lat, lon, radius_km)

        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row

            sql = """
                SELECT e.* FROM local_entities e
                JOIN local_entities_rtree rt ON e.id = rt.id
                WHERE rt.min_lat <= ? AND rt.max_lat >= ?
                  AND rt.min_lon <= ? AND rt.max_lon >= ?
            """
            params = [max_lat, min_lat, max_lon, min_lon]

            if category and category != "all":
                if category in ("university", "college"):
                    sql += " AND e.category IN ('university', 'college')"
                else:
                    sql += " AND e.category = ?"
                    params.append(category)

            cursor = await conn.execute(sql, params)
            rows = await cursor.fetchall()

            results = []
            for r in rows:
                dist = haversine_distance_km(lat, lon, r["lat"], r["lon"])
                if dist <= radius_km:
                    # Filter query text if provided and not simply the category name
                    if query_text:
                        clean_words = [w.strip().rstrip("s") for w in query_text.lower().split() if len(w) > 2 and w not in ("the", "best", "top", "find", "near", "in", "for")]
                        if clean_words and not category:
                            target_corpus = f"{r['name']} {r['category']} {r['subcategory'] or ''} {r['address']}".lower()
                            if not any(w in target_corpus for w in clean_words):
                                continue

                    results.append(LocalDiscoveryItem(
                        id=r["id"],
                        name=r["name"],
                        category=r["category"],
                        subcategory=r["subcategory"] or "",
                        address=r["address"],
                        city=r["city"],
                        state=r["state"] or "",
                        country=r["country"],
                        country_code=r["country_code"] or "",
                        postal_code=r["postal_code"],
                        lat=r["lat"],
                        lon=r["lon"],
                        phone=r["phone"],
                        website=r["website"],
                        opening_hours=r["opening_hours"],
                        is_open_now=bool(r["is_open_now"]),
                        verified_status=r["verified_status"],
                        rating=r["rating"],
                        review_count=r["review_count"],
                        distance_km=round(dist, 2),
                        source_attribution=r["source_attribution"],
                        details=json.loads(r["details_json"] or "{}")
                    ))

            results.sort(key=lambda x: x.distance_km or 0.0)
            return results[:limit]

    async def search_polygon(
        self,
        polygon_points: List[Tuple[float, float]], # List of (lat, lon)
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Polygon-based boundary search with Shapely point-in-polygon verification.
        """
        if len(polygon_points) < 3:
            return []

        poly = Polygon([(lon, lat) for lat, lon in polygon_points])
        min_lon, min_lat, max_lon, max_lat = poly.bounds

        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                """SELECT dl.*, d.title, d.snippet, d.url, d.domain
                   FROM document_locations dl
                   JOIN document_geo_rtree rt ON dl.id = rt.id
                   JOIN documents d ON dl.document_id = d.id
                   WHERE rt.min_lat <= ? AND rt.max_lat >= ?
                     AND rt.min_lon <= ? AND rt.max_lon >= ?""",
                (max_lat, min_lat, max_lon, min_lon)
            )
            rows = await cursor.fetchall()
            matched = []
            for r in rows:
                pt = Point(r["lon"], r["lat"])
                if poly.contains(pt):
                    matched.append({
                        "document_id": r["document_id"],
                        "url": r["url"],
                        "domain": r["domain"],
                        "title": r["title"],
                        "snippet": r["snippet"],
                        "lat": r["lat"],
                        "lon": r["lon"],
                        "city": r["city"],
                        "country": r["country_name"]
                    })
            return matched[:limit]

spatial_index = SpatialIndex()
