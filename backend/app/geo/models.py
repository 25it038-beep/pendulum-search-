"""
HS SEARCH - Global Geolocation Intelligence Models
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

class GeoCoordinates(BaseModel):
    lat: float
    lon: float

class BoundingBox(BaseModel):
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float

class GeoPlace(BaseModel):
    id: Optional[int] = None
    name: str
    ascii_name: str = ""
    alternate_names: List[str] = Field(default_factory=list)
    feature_type: str = "city" # continent, country, state, district, city, town, village, locality, airport, station, landmark, poi
    admin_level: int = 5 # 0:world, 1:continent, 2:country, 3:state, 4:district, 5:city, 6:locality
    continent: str = ""
    country_code: str = "" # ISO 2-letter
    country_name: str = ""
    state_province: str = ""
    district: str = ""
    city: str = ""
    locality: str = ""
    postal_code: Optional[str] = None
    lat: float
    lon: float
    min_lat: Optional[float] = None
    max_lat: Optional[float] = None
    min_lon: Optional[float] = None
    max_lon: Optional[float] = None
    population: int = 0
    timezone: str = "UTC"

class DocumentLocationRecord(BaseModel):
    id: Optional[int] = None
    document_id: int
    lat: float
    lon: float
    country_code: str = ""
    country_name: str = ""
    state_province: str = ""
    district: str = ""
    city: str = ""
    locality: str = ""
    postal_code: Optional[str] = None
    street_address: Optional[str] = None
    location_type: str = "content_coverage" # business_physical, website_operating, content_coverage, event_location, mentioned
    confidence: float = 0.8
    source: str = "schema_org" # schema_org, meta_geo, address_text, ner_location, manual
    evidence_text: Optional[str] = None
    geohash: str = ""
    last_verified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GeoQueryIntent(BaseModel):
    is_geo_query: bool = False
    clean_query: str = ""
    geo_entity: Optional[str] = None
    resolved_place: Optional[GeoPlace] = None
    intent_type: str = "worldwide" # near_me, within_radius, locality, city, region, country, worldwide
    radius_km: float = 25.0
    user_location: Optional[GeoCoordinates] = None
    category: Optional[str] = None
    freshness_needed: bool = False
    ambiguous_matches: List[GeoPlace] = Field(default_factory=list)

class LocalDiscoveryItem(BaseModel):
    id: Optional[int] = None
    name: str
    category: str # hospital, university, college, school, restaurant, hotel, shop, shopping_centre, government, tourist_destination, transit, sports, library, museum, industrial, service
    subcategory: str = ""
    address: str
    city: str
    state: str = ""
    country: str
    country_code: str = ""
    postal_code: Optional[str] = None
    lat: float
    lon: float
    phone: Optional[str] = None
    website: Optional[str] = None
    opening_hours: Optional[str] = None
    is_open_now: Optional[bool] = None
    verified_status: str = "verified_physical" # verified_physical, online_listed, community_verified
    rating: Optional[float] = None
    review_count: Optional[int] = None
    distance_km: Optional[float] = None
    last_verified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_attribution: str = "HS Search Global Registry"
    details: Dict[str, Any] = Field(default_factory=dict)
