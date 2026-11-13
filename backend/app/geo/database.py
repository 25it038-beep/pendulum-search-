"""
HS SEARCH - Global Geographical Database & Multilingual Spatial Registry
Company: HS AI Solutions
Founder: Harshan Seliyan

Contains global administrative hierarchy:
World -> Continent -> Country -> State/Province -> District -> City -> Locality
Supports multilingual scripts, alternate spellings, landmarks, airports, and postal codes.
"""

import aiosqlite
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime, timezone
from app.config import settings
from app.geo.models import GeoPlace, BoundingBox, GeoCoordinates
from app.geo.geohash import encode_geohash, haversine_distance_km, bounding_box_for_radius

logger = logging.getLogger(__name__)

GEO_SCHEMA_SQL = """
-- Global Places Table
CREATE TABLE IF NOT EXISTS geo_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    ascii_name TEXT NOT NULL,
    alternate_names_json TEXT DEFAULT '[]',
    feature_type TEXT NOT NULL, -- continent, country, state, district, city, town, village, locality, airport, station, landmark
    admin_level INTEGER DEFAULT 5, -- 0:world, 1:continent, 2:country, 3:state, 4:district, 5:city, 6:locality
    continent TEXT NOT NULL,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    state_province TEXT DEFAULT '',
    district TEXT DEFAULT '',
    city TEXT DEFAULT '',
    locality TEXT DEFAULT '',
    postal_code TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    min_lat REAL,
    max_lat REAL,
    min_lon REAL,
    max_lon REAL,
    population INTEGER DEFAULT 0,
    timezone TEXT DEFAULT 'UTC'
);

CREATE INDEX IF NOT EXISTS idx_geo_norm_name ON geo_places(normalized_name);
CREATE INDEX IF NOT EXISTS idx_geo_country ON geo_places(country_code);
CREATE INDEX IF NOT EXISTS idx_geo_state ON geo_places(state_province);
CREATE INDEX IF NOT EXISTS idx_geo_city ON geo_places(city);
CREATE INDEX IF NOT EXISTS idx_geo_postal ON geo_places(postal_code);

-- Full-Text Search on Multilingual Names & Aliases
CREATE VIRTUAL TABLE IF NOT EXISTS geo_places_fts USING fts5(
    name,
    ascii_name,
    alternate_names_text,
    country_name,
    state_province,
    city,
    locality,
    content='geo_places',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

-- R*Tree Spatial Virtual Table for Places
CREATE VIRTUAL TABLE IF NOT EXISTS geo_places_rtree USING rtree(
    id,
    min_lat, max_lat,
    min_lon, max_lon
);

-- Document Locations Index Table
CREATE TABLE IF NOT EXISTS document_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    country_code TEXT DEFAULT '',
    country_name TEXT DEFAULT '',
    state_province TEXT DEFAULT '',
    district TEXT DEFAULT '',
    city TEXT DEFAULT '',
    locality TEXT DEFAULT '',
    postal_code TEXT,
    street_address TEXT,
    location_type TEXT DEFAULT 'content_coverage', -- business_physical, website_operating, content_coverage, event_location, mentioned
    confidence REAL DEFAULT 0.8,
    source TEXT DEFAULT 'schema_org',
    evidence_text TEXT,
    geohash TEXT NOT NULL,
    last_verified_at TEXT NOT NULL,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_doc_loc_geohash ON document_locations(geohash);
CREATE INDEX IF NOT EXISTS idx_doc_loc_docid ON document_locations(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_loc_city ON document_locations(city);
CREATE INDEX IF NOT EXISTS idx_doc_loc_country ON document_locations(country_code);

-- Document Spatial R*Tree Virtual Table
CREATE VIRTUAL TABLE IF NOT EXISTS document_geo_rtree USING rtree(
    id,
    min_lat, max_lat,
    min_lon, max_lon
);

-- Local Discovery Entities Table (Businesses, Hospitals, Colleges, etc.)
CREATE TABLE IF NOT EXISTS local_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- hospital, university, college, school, restaurant, hotel, shop, shopping_centre, government, tourist_destination, transit, sports, library, museum, industrial, service
    subcategory TEXT DEFAULT '',
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT DEFAULT '',
    country TEXT NOT NULL,
    country_code TEXT DEFAULT '',
    postal_code TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    phone TEXT,
    website TEXT,
    opening_hours TEXT,
    is_open_now INTEGER DEFAULT 1,
    verified_status TEXT DEFAULT 'verified_physical',
    rating REAL,
    review_count INTEGER DEFAULT 0,
    source_attribution TEXT DEFAULT 'HS Search Global Registry',
    details_json TEXT DEFAULT '{}',
    last_verified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_category ON local_entities(category);
CREATE INDEX IF NOT EXISTS idx_local_city ON local_entities(city);

-- Local Entities Spatial R*Tree
CREATE VIRTUAL TABLE IF NOT EXISTS local_entities_rtree USING rtree(
    id,
    min_lat, max_lat,
    min_lon, max_lon
);

CREATE VIRTUAL TABLE IF NOT EXISTS local_entities_fts USING fts5(
    name,
    category,
    subcategory,
    address,
    city,
    state,
    country,
    content='local_entities',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);
"""

class GeoDatabase:
    """Manages the global geographical intelligence catalog, geocoding & spatial lookups."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or settings.DB_PATH
        self._is_initialized = False

    async def init_schema(self, conn: aiosqlite.Connection):
        """Execute geographic schema initialization."""
        await conn.executescript(GEO_SCHEMA_SQL)
        await conn.commit()
        await self._ensure_seed_data(conn)
        self._is_initialized = True

    async def _ensure_seed_data(self, conn: aiosqlite.Connection):
        """Check if seed data exists; if not, populate comprehensive global dataset."""
        cursor = await conn.execute("SELECT COUNT(*) as count FROM geo_places")
        row = await cursor.fetchone()
        if row and row[0] > 0:
            return

        logger.info("Populating Global Geographical Intelligence Database...")
        from app.geo.seed_data import GLOBAL_PLACES_DATA, GLOBAL_LOCAL_ENTITIES
        
        for p in GLOBAL_PLACES_DATA:
            min_lat = p.get("min_lat", p["lat"] - 0.05)
            max_lat = p.get("max_lat", p["lat"] + 0.05)
            min_lon = p.get("min_lon", p["lon"] - 0.05)
            max_lon = p.get("max_lon", p["lon"] + 0.05)
            alt_names = p.get("alternate_names", [])
            alt_text = " ".join(alt_names)
            norm_name = p["name"].lower().strip()

            cursor = await conn.execute(
                """INSERT INTO geo_places (
                    name, normalized_name, ascii_name, alternate_names_json, feature_type,
                    admin_level, continent, country_code, country_name, state_province,
                    district, city, locality, postal_code, lat, lon, min_lat, max_lat,
                    min_lon, max_lon, population, timezone
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    p["name"], norm_name, p.get("ascii_name", p["name"]),
                    json.dumps(alt_names), p.get("feature_type", "city"),
                    p.get("admin_level", 5), p.get("continent", "Global"),
                    p.get("country_code", ""), p.get("country_name", ""),
                    p.get("state_province", ""), p.get("district", ""),
                    p.get("city", p["name"]), p.get("locality", ""),
                    p.get("postal_code"), p["lat"], p["lon"],
                    min_lat, max_lat, min_lon, max_lon,
                    p.get("population", 0), p.get("timezone", "UTC")
                )
            )
            place_id = cursor.lastrowid

            # Insert into R*Tree
            await conn.execute(
                """INSERT INTO geo_places_rtree (id, min_lat, max_lat, min_lon, max_lon)
                   VALUES (?, ?, ?, ?, ?)""",
                (place_id, min_lat, max_lat, min_lon, max_lon)
            )

            # Insert into FTS
            await conn.execute(
                """INSERT INTO geo_places_fts (rowid, name, ascii_name, alternate_names_text, country_name, state_province, city, locality)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (place_id, p["name"], p.get("ascii_name", p["name"]), alt_text, p.get("country_name", ""), p.get("state_province", ""), p.get("city", p["name"]), p.get("locality", ""))
            )

        # Seed local entities (Hospitals, Colleges, IT companies, Landmarks)
        now_iso = datetime.now(timezone.utc).isoformat()
        for e in GLOBAL_LOCAL_ENTITIES:
            cursor = await conn.execute(
                """INSERT INTO local_entities (
                    name, category, subcategory, address, city, state, country, country_code,
                    postal_code, lat, lon, phone, website, opening_hours, is_open_now,
                    verified_status, rating, review_count, source_attribution, details_json, last_verified_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    e["name"], e["category"], e.get("subcategory", ""), e["address"],
                    e["city"], e.get("state", ""), e["country"], e.get("country_code", ""),
                    e.get("postal_code"), e["lat"], e["lon"], e.get("phone"),
                    e.get("website"), e.get("opening_hours"), e.get("is_open_now", 1),
                    e.get("verified_status", "verified_physical"), e.get("rating", 4.5),
                    e.get("review_count", 100), e.get("source_attribution", "HS Search Global Registry"),
                    json.dumps(e.get("details", {})), now_iso
                )
            )
            entity_id = cursor.lastrowid

            # Insert into local entities R*Tree
            await conn.execute(
                """INSERT INTO local_entities_rtree (id, min_lat, max_lat, min_lon, max_lon)
                   VALUES (?, ?, ?, ?, ?)""",
                (entity_id, e["lat"] - 0.0001, e["lat"] + 0.0001, e["lon"] - 0.0001, e["lon"] + 0.0001)
            )

            # Insert into local entities FTS
            await conn.execute(
                """INSERT INTO local_entities_fts (rowid, name, category, subcategory, address, city, state, country)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (entity_id, e["name"], e["category"], e.get("subcategory", ""), e["address"], e["city"], e.get("state", ""), e["country"])
            )

        await conn.commit()
        logger.info("Global Geographical Intelligence Database initialized with comprehensive world coverage.")

    async def geocode(
        self,
        query: str,
        country_hint: Optional[str] = None,
        state_hint: Optional[str] = None,
        user_lat: Optional[float] = None,
        user_lon: Optional[float] = None
    ) -> List[GeoPlace]:
        """
        Geocode a location query string to matched places with context-aware disambiguation.
        Supports multilingual queries and local scripts.
        """
        clean_q = query.strip()
        if not clean_q:
            return []

        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row

            # 1. Exact match by normalized name or postal code
            cursor = await conn.execute(
                """SELECT * FROM geo_places 
                   WHERE normalized_name = ? OR postal_code = ? 
                   ORDER BY population DESC, admin_level ASC LIMIT 5""",
                (clean_q.lower(), clean_q)
            )
            exact_rows = await cursor.fetchall()
            
            # 2. FTS match (supports prefix & multilingual scripts)
            fts_query = f'"{clean_q}"*'
            cursor = await conn.execute(
                """SELECT g.* FROM geo_places g
                   JOIN geo_places_fts f ON g.id = f.rowid
                   WHERE geo_places_fts MATCH ?
                   ORDER BY g.population DESC, g.admin_level ASC
                   LIMIT 15""",
                (fts_query,)
            )
            fts_rows = await cursor.fetchall()

            # Combine candidates avoiding duplicates
            seen_ids = set()
            candidates = []
            for r in list(exact_rows) + list(fts_rows):
                if r["id"] not in seen_ids:
                    seen_ids.add(r["id"])
                    candidates.append(self._row_to_geoplace(r))

            if not candidates:
                # Fallback: substring match on name
                cursor = await conn.execute(
                    """SELECT * FROM geo_places 
                       WHERE normalized_name LIKE ? 
                       ORDER BY population DESC LIMIT 5""",
                    (f"%{clean_q.lower()}%",)
                )
                for r in await cursor.fetchall():
                    if r["id"] not in seen_ids:
                        seen_ids.add(r["id"])
                        candidates.append(self._row_to_geoplace(r))

            # Disambiguation and Context-Aware Re-ranking
            def score_candidate(p: GeoPlace) -> float:
                score = 1.0
                # Country hint match
                if country_hint:
                    if p.country_code.lower() == country_hint.lower() or country_hint.lower() in p.country_name.lower():
                        score += 5.0
                    else:
                        score -= 2.0
                # State hint match
                if state_hint and p.state_province:
                    if state_hint.lower() in p.state_province.lower():
                        score += 3.0
                # User proximity match if coordinates available
                if user_lat is not None and user_lon is not None:
                    dist = haversine_distance_km(user_lat, user_lon, p.lat, p.lon)
                    score += max(0.0, 5.0 / (1.0 + dist / 20.0)) # Higher score for closer places
                # Population / Significance bonus
                score += (p.population / 1_000_000.0) * 0.5
                # Exact name match bonus
                if p.name.lower() == clean_q.lower() or clean_q.lower() in [a.lower() for a in p.alternate_names]:
                    score += 4.0
                return score

            candidates.sort(key=score_candidate, reverse=True)
            return candidates

    async def reverse_geocode(self, lat: float, lon: float, max_dist_km: float = 50.0) -> Optional[GeoPlace]:
        """
        Find closest geographical location using spatial R*Tree bounding box search.
        """
        min_lat, max_lat, min_lon, max_lon = bounding_box_for_radius(lat, lon, max_dist_km)

        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                """SELECT g.* FROM geo_places g
                   JOIN geo_places_rtree r ON g.id = r.id
                   WHERE r.min_lat <= ? AND r.max_lat >= ?
                     AND r.min_lon <= ? AND r.max_lon >= ?""",
                (max_lat, min_lat, max_lon, min_lon)
            )
            rows = await cursor.fetchall()
            if not rows:
                return None

            best_place = None
            min_dist = float("inf")
            for r in rows:
                p = self._row_to_geoplace(r)
                dist = haversine_distance_km(lat, lon, p.lat, p.lon)
                if dist < min_dist:
                    min_dist = dist
                    best_place = p

            return best_place

    async def get_hierarchy(
        self,
        continent: Optional[str] = None,
        country_code: Optional[str] = None,
        state_province: Optional[str] = None,
        city: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get hierarchical geographical tree for universal location navigation:
        World -> Continent -> Country -> State -> District/City -> Locality
        """
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row

            if not continent and not country_code:
                # Return Continents & Countries
                cursor = await conn.execute(
                    """SELECT DISTINCT continent, country_name, country_code 
                       FROM geo_places 
                       ORDER BY continent, country_name"""
                )
                rows = await cursor.fetchall()
                continents: Dict[str, List[Dict[str, str]]] = {}
                for r in rows:
                    cont = r["continent"] or "Other"
                    if cont not in continents:
                        continents[cont] = []
                    continents[cont].append({
                        "name": r["country_name"],
                        "code": r["country_code"]
                    })
                return {"level": "world", "continents": continents}

            elif country_code and not state_province:
                # Return States/Provinces for country
                cursor = await conn.execute(
                    """SELECT DISTINCT state_province, COUNT(id) as place_count
                       FROM geo_places
                       WHERE country_code = ? AND state_province != ''
                       GROUP BY state_province
                       ORDER BY state_province""",
                    (country_code.upper(),)
                )
                states = [{"name": r["state_province"], "places": r["place_count"]} for r in await cursor.fetchall()]
                return {"level": "country", "country_code": country_code, "states": states}

            elif country_code and state_province and not city:
                # Return Cities in State
                cursor = await conn.execute(
                    """SELECT DISTINCT city, population, lat, lon
                       FROM geo_places
                       WHERE country_code = ? AND state_province = ? AND feature_type IN ('city', 'town')
                       ORDER BY population DESC, city ASC""",
                    (country_code.upper(), state_province)
                )
                cities = [{"name": r["city"], "lat": r["lat"], "lon": r["lon"], "population": r["population"]} for r in await cursor.fetchall()]
                return {"level": "state", "state": state_province, "cities": cities}

            elif city:
                # Return Localities in City
                cursor = await conn.execute(
                    """SELECT name, feature_type, postal_code, lat, lon
                       FROM geo_places
                       WHERE city = ? AND feature_type IN ('locality', 'landmark', 'poi', 'airport', 'station')
                       ORDER BY name ASC""",
                    (city,)
                )
                localities = [{"name": r["name"], "type": r["feature_type"], "postal_code": r["postal_code"], "lat": r["lat"], "lon": r["lon"]} for r in await cursor.fetchall()]
                return {"level": "city", "city": city, "localities": localities}

            return {}

    async def autocomplete_locations(self, prefix: str, limit: int = 8) -> List[Dict[str, Any]]:
        """Fast location suggestions for user input."""
        clean = prefix.strip()
        if not clean:
            return []

        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            fts_query = f'"{clean}"*'
            cursor = await conn.execute(
                """SELECT g.id, g.name, g.feature_type, g.city, g.state_province, g.country_name, g.country_code, g.lat, g.lon, g.population
                   FROM geo_places g
                   JOIN geo_places_fts f ON g.id = f.rowid
                   WHERE geo_places_fts MATCH ?
                   ORDER BY g.population DESC, g.admin_level ASC
                   LIMIT ?""",
                (fts_query, limit)
            )
            rows = await cursor.fetchall()
            results = []
            for r in rows:
                desc = []
                if r["city"] and r["city"] != r["name"]:
                    desc.append(r["city"])
                if r["state_province"]:
                    desc.append(r["state_province"])
                if r["country_name"]:
                    desc.append(r["country_name"])

                results.append({
                    "id": r["id"],
                    "name": r["name"],
                    "type": r["feature_type"],
                    "label": f"{r['name']}, {', '.join(desc)}" if desc else r["name"],
                    "country": r["country_name"],
                    "country_code": r["country_code"],
                    "state": r["state_province"],
                    "city": r["city"],
                    "lat": r["lat"],
                    "lon": r["lon"]
                })
            return results

    def _row_to_geoplace(self, r: Any) -> GeoPlace:
        return GeoPlace(
            id=r["id"],
            name=r["name"],
            ascii_name=r["ascii_name"] or r["name"],
            alternate_names=json.loads(r["alternate_names_json"] or "[]"),
            feature_type=r["feature_type"],
            admin_level=r["admin_level"],
            continent=r["continent"],
            country_code=r["country_code"],
            country_name=r["country_name"],
            state_province=r["state_province"] or "",
            district=r["district"] or "",
            city=r["city"] or "",
            locality=r["locality"] or "",
            postal_code=r["postal_code"],
            lat=r["lat"],
            lon=r["lon"],
            min_lat=r["min_lat"],
            max_lat=r["max_lat"],
            min_lon=r["min_lon"],
            max_lon=r["max_lon"],
            population=r["population"] or 0,
            timezone=r["timezone"] or "UTC"
        )

geo_db = GeoDatabase()
