"""
HS SEARCH - Geo-Aware Web Crawling & Entity Extraction Engine
Company: HS AI Solutions
Founder: Harshan Seliyan

Extracts physical addresses, Schema.org LocalBusiness/Place, GPS coordinates,
and distinguishes business locations, event locations, content coverage, and operating locations.
"""

import re
import json
import logging
from bs4 import BeautifulSoup
from typing import List, Dict, Any, Optional, Tuple
from app.geo.models import DocumentLocationRecord
from app.geo.database import geo_db
from app.geo.geohash import encode_geohash

logger = logging.getLogger(__name__)

# Regular expressions for geographic coordinates, postal codes, and addresses
LAT_LON_REGEX = re.compile(
    r"""(?P<lat>[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?))\s*,\s*(?P<lon>[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?))"""
)
POSTAL_CODE_PATTERNS = [
    re.compile(r"\b(PIN\s*[:\-]?\s*|postal\s*code\s*[:\-]?\s*)?(\d{6})\b", re.IGNORECASE), # India 6-digit PIN
    re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})\b", re.IGNORECASE), # UK Postcode
    re.compile(r"\b(\d{5}(?:-\d{4})?)\b") # US ZIP Code
]

class GeoEntityExtractor:
    """Extracts geographic entities, microdata, coordinates, and addresses from HTML content."""

    def __init__(self):
        self.geo_db = geo_db

    async def extract_locations(
        self,
        html: str,
        url: str,
        title: str,
        body_text: str
    ) -> List[Dict[str, Any]]:
        """
        Extract all geographic locations from a webpage.
        Returns a list of extracted location dictionaries with confidence, source, and role.
        """
        soup = BeautifulSoup(html, "html.parser")
        extracted_locations: List[Dict[str, Any]] = []

        # 1. Schema.org JSON-LD Extraction (Highest Confidence: 0.95)
        schema_locations = self._extract_schema_org_locations(soup)
        for loc in schema_locations:
            extracted_locations.append(loc)

        # 2. HTML Meta Geo Tags (geo.position, ICBM, DC.coverage) (Confidence: 0.90)
        meta_locations = self._extract_meta_geo_tags(soup)
        for loc in meta_locations:
            extracted_locations.append(loc)

        # 3. Microdata / Microformats (itemtype="http://schema.org/Place", etc.)
        microdata_locations = self._extract_microdata_locations(soup)
        for loc in microdata_locations:
            extracted_locations.append(loc)

        # 4. Text-based Physical Address & Known City Mentions
        text_locations = await self._extract_text_locations(soup, body_text, title)
        for loc in text_locations:
            # Check for near-duplicates before adding
            if not any(self._is_same_location(loc, existing) for existing in extracted_locations):
                extracted_locations.append(loc)

        # Ensure all extracted locations have geocoded coordinates
        resolved_locations = []
        for loc in extracted_locations:
            if loc.get("lat") and loc.get("lon"):
                if not loc.get("geohash"):
                    loc["geohash"] = encode_geohash(loc["lat"], loc["lon"])
                resolved_locations.append(loc)
            else:
                # Geocode location text
                place_query = loc.get("city") or loc.get("locality") or loc.get("country_name") or loc.get("street_address")
                if place_query:
                    candidates = await self.geo_db.geocode(
                        place_query,
                        country_hint=loc.get("country_code")
                    )
                    if candidates:
                        best = candidates[0]
                        loc["lat"] = best.lat
                        loc["lon"] = best.lon
                        loc["geohash"] = encode_geohash(best.lat, best.lon)
                        loc["city"] = loc.get("city") or best.city or best.name
                        loc["state_province"] = loc.get("state_province") or best.state_province
                        loc["country_name"] = loc.get("country_name") or best.country_name
                        loc["country_code"] = loc.get("country_code") or best.country_code
                        resolved_locations.append(loc)

        return resolved_locations

    def _extract_schema_org_locations(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract locations from JSON-LD Schema.org scripts."""
        locations = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                items = data if isinstance(data, list) else [data]
                for item in items:
                    self._parse_schema_node(item, locations)
            except Exception:
                pass
        return locations

    def _parse_schema_node(self, node: Any, results: List[Dict[str, Any]]):
        if not isinstance(node, dict):
            return

        node_type = str(node.get("@type", "")).lower()
        
        # Check for LocalBusiness, Place, Restaurant, Hospital, College, etc.
        is_place = any(k in node_type for k in [
            "localbusiness", "place", "restaurant", "hospital", "organization",
            "civicstructure", "store", "educationalorganization", "collegeoruniversity",
            "touristattraction", "event"
        ])

        is_business = any(k in node_type for k in [
            "localbusiness", "store", "restaurant", "hospital", "dentist",
            "clinic", "medical", "doctor", "health", "lodging", "hotel", "service"
        ])
        loc_type = "event_location" if "event" in node_type else (
            "business_physical" if (is_business or (address and node_type != "organization")) else "website_operating"
        )

        geo = node.get("geo")
        address = node.get("address")

        lat = None
        lon = None
        if isinstance(geo, dict):
            try:
                lat = float(geo.get("latitude", 0.0))
                lon = float(geo.get("longitude", 0.0))
            except Exception:
                pass

        street = ""
        city = ""
        state = ""
        country = ""
        postal = ""

        if isinstance(address, dict):
            street = str(address.get("streetAddress", ""))
            city = str(address.get("addressLocality", ""))
            state = str(address.get("addressRegion", ""))
            country = str(address.get("addressCountry", ""))
            postal = str(address.get("postalCode", ""))
        elif isinstance(address, str):
            street = address

        if lat or city or street:
            results.append({
                "lat": lat,
                "lon": lon,
                "street_address": street,
                "city": city,
                "state_province": state,
                "country_name": country,
                "country_code": country[:2].upper() if len(country) == 2 else "",
                "postal_code": postal,
                "location_type": loc_type,
                "confidence": 0.95,
                "source": "schema_org",
                "evidence_text": f"Schema.org @type={node_type}"
            })

    def _extract_meta_geo_tags(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract geo.position, ICBM, and place:location tags."""
        locations = []
        # geo.position: "lat;lon" or "lat, lon"
        pos_tag = soup.find("meta", attrs={"name": "geo.position"}) or soup.find("meta", attrs={"name": "ICBM"})
        if pos_tag and pos_tag.get("content"):
            content = pos_tag["content"].replace(";", ",").strip()
            match = LAT_LON_REGEX.search(content)
            if match:
                lat = float(match.group("lat"))
                lon = float(match.group("lon"))
                
                # Check place name tag
                place_tag = soup.find("meta", attrs={"name": "geo.placename"})
                city = place_tag["content"].strip() if place_tag and place_tag.get("content") else ""

                region_tag = soup.find("meta", attrs={"name": "geo.region"})
                region = region_tag["content"].strip() if region_tag and region_tag.get("content") else ""

                locations.append({
                    "lat": lat,
                    "lon": lon,
                    "city": city,
                    "state_province": region,
                    "country_code": region.split("-")[0].upper() if "-" in region else "",
                    "location_type": "website_operating",
                    "confidence": 0.90,
                    "source": "meta_geo",
                    "evidence_text": f"Meta tag geo.position: {content}"
                })

        return locations

    def _extract_microdata_locations(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract microdata PostalAddress and GeoCoordinates."""
        locations = []
        for elem in soup.find_all(attrs={"itemtype": re.compile(r"schema\.org/(PostalAddress|GeoCoordinates|Place)", re.I)}):
            street = elem.find(attrs={"itemprop": "streetAddress"})
            city = elem.find(attrs={"itemprop": "addressLocality"})
            state = elem.find(attrs={"itemprop": "addressRegion"})
            postal = elem.find(attrs={"itemprop": "postalCode"})
            country = elem.find(attrs={"itemprop": "addressCountry"})
            lat_elem = elem.find(attrs={"itemprop": "latitude"})
            lon_elem = elem.find(attrs={"itemprop": "longitude"})

            lat = float(lat_elem.get("content") or lat_elem.get_text()) if lat_elem else None
            lon = float(lon_elem.get("content") or lon_elem.get_text()) if lon_elem else None

            if lat or city or street:
                locations.append({
                    "lat": lat,
                    "lon": lon,
                    "street_address": street.get_text().strip() if street else "",
                    "city": city.get_text().strip() if city else "",
                    "state_province": state.get_text().strip() if state else "",
                    "postal_code": postal.get_text().strip() if postal else "",
                    "country_name": country.get_text().strip() if country else "",
                    "location_type": "business_physical",
                    "confidence": 0.88,
                    "source": "microdata",
                    "evidence_text": "HTML5 Microdata item"
                })
        return locations

    async def _extract_text_locations(self, soup: BeautifulSoup, text: str, title: str) -> List[Dict[str, Any]]:
        """Identify locations and postal codes mentioned in text."""
        locations = []
        lower_text = text.lower()
        lower_title = title.lower()

        # Check for major landmarks or localities mentioned prominently
        sample_cities = [
            ("tambaram", "Chennai", "Tamil Nadu", "India", "IN", 12.9249, 80.1000, "locality"),
            ("chennai", "Chennai", "Tamil Nadu", "India", "IN", 13.0827, 80.2707, "city"),
            ("coimbatore", "Coimbatore", "Tamil Nadu", "India", "IN", 11.0168, 76.9558, "city"),
            ("bengaluru", "Bengaluru", "Karnataka", "India", "IN", 12.9716, 77.5946, "city"),
            ("bangalore", "Bengaluru", "Karnataka", "India", "IN", 12.9716, 77.5946, "city"),
            ("mumbai", "Mumbai", "Maharashtra", "India", "IN", 19.0760, 72.8777, "city"),
            ("tokyo", "Tokyo", "Tokyo", "Japan", "JP", 35.6762, 139.6503, "city"),
            ("london", "London", "England", "United Kingdom", "GB", 51.5074, -0.1278, "city"),
            ("cambridge", "Cambridge", "Cambridgeshire", "United Kingdom", "GB", 52.2053, 0.1218, "city"),
            ("paris", "Paris", "Île-de-France", "France", "FR", 48.8566, 2.3522, "city"),
            ("berlin", "Berlin", "Berlin", "Germany", "DE", 52.5200, 13.4050, "city"),
            ("new york", "New York", "New York", "United States", "US", 40.7128, -74.0060, "city"),
            ("san francisco", "San Francisco", "California", "United States", "US", 37.7749, -122.4194, "city"),
            ("dubai", "Dubai", "Dubai", "United Arab Emirates", "AE", 25.2048, 55.2708, "city"),
            ("sydney", "Sydney", "New South Wales", "Australia", "AU", -33.8688, 151.2093, "city")
        ]

        for token, city_name, state_name, country_name, code, lat, lon, loc_level in sample_cities:
            # Check presence with word boundaries
            pattern = rf"\b{re.escape(token)}\b"
            in_title = bool(re.search(pattern, lower_title))
            in_text = bool(re.search(pattern, lower_text))

            if in_title or in_text:
                conf = 0.85 if in_title else 0.70
                loc_type = "content_coverage" if in_title else "mentioned"
                locations.append({
                    "lat": lat,
                    "lon": lon,
                    "city": city_name,
                    "locality": token if loc_level == "locality" else "",
                    "state_province": state_name,
                    "country_name": country_name,
                    "country_code": code,
                    "location_type": loc_type,
                    "confidence": conf,
                    "source": "text_ner",
                    "evidence_text": f"Found location '{token}' in {'title' if in_title else 'content'}"
                })

        return locations

    def _is_same_location(self, a: Dict[str, Any], b: Dict[str, Any]) -> bool:
        if a.get("lat") and b.get("lat") and a.get("lon") and b.get("lon"):
            return abs(a["lat"] - b["lat"]) < 0.01 and abs(a["lon"] - b["lon"]) < 0.01
        if a.get("city") and b.get("city"):
            return a["city"].lower() == b["city"].lower()
        return False

geo_extractor = GeoEntityExtractor()
