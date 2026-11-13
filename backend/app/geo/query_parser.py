"""
HS SEARCH - Intelligent Location Query Understanding & Intent Parser
Company: HS AI Solutions
Founder: Harshan Seliyan

Extracts:
- Search topic / clean subject
- Geographic entity & resolved coordinates
- Geographic scope (worldwide, country, region, city, locality, near_me)
- Search radius (e.g. "within 20 km of Tambaram" -> 20.0 km)
- Content / business category
- Freshness requirements
- Context-aware disambiguation
"""

import re
import logging
from typing import Optional, Dict, Any, List, Tuple
from app.geo.models import GeoQueryIntent, GeoCoordinates, GeoPlace
from app.geo.database import geo_db

logger = logging.getLogger(__name__)

# Pattern for explicit radius: "within 20 km of X", "in a 15 km radius around Y", "5 miles from Z"
RADIUS_PATTERN = re.compile(
    r"\b(?:within|in a|around|radius of)?\s*(?P<dist>\d+(?:\.\d+)?)\s*(?P<unit>km|kms|kilometers?|miles?|mi)\s*(?:of|from|around)?\s*",
    re.IGNORECASE
)

# Relative / near-me patterns
NEAR_ME_PATTERN = re.compile(
    r"\b(?:near\s+me|nearby|around\s+here|closest|close\s+to\s+me|in\s+my\s+area|local)\b",
    re.IGNORECASE
)

# Location connectors: "in Chennai", "near Tambaram", "around London", "at Tokyo"
LOCATION_CONNECTOR_PATTERN = re.compile(
    r"\b(?:in|at|near|around|from|of|across)\s+([A-Za-z\u0080-\uffff\s\.\-]{2,40})$",
    re.IGNORECASE
)

CATEGORY_KEYWORDS = {
    "hospital": ["hospitals?", "clinics?", "health\s*care", "medical\s*center", "doctors?"],
    "university": ["universit(?:y|ies)", "colleges?", "engineering\s*colleges?", "schools?", "institutes?"],
    "restaurant": ["restaurants?", "cafes?", "diners?", "food", "bakery", "hotels?\s+to\s+eat", "eateries"],
    "hotel": ["hotels?", "resorts?", "lodging", "motels?", "stay"],
    "tourist_destination": ["tourist\s*places?", "attractions?", "monuments?", "places?\s+to\s+visit", "sightseeing"],
    "transit": ["airports?", "railway\s*stations?", "train\s*stations?", "metro\s*stations?", "bus\s*stands?"],
    "government": ["government\s*schemes?", "gov", "collector\s*office", "municipal", "schemes?"],
    "service": ["it\s*companies?", "companies?", "software\s*firms?", "startups?", "services?", "agencies?"],
    "sports": ["stadiums?", "sports\s*complex", "arenas?", "gyms?"]
}

class LocationQueryParser:
    """Parses user queries for geographic intent, radius, and entity extraction."""

    def __init__(self):
        self.geo_db = geo_db

    async def parse_query(
        self,
        query: str,
        user_coords: Optional[GeoCoordinates] = None,
        context_country: Optional[str] = None,
        context_state: Optional[str] = None
    ) -> GeoQueryIntent:
        """
        Analyze search query and determine geographic scope and parameters.
        """
        raw_q = query.strip()
        working_q = raw_q

        intent = GeoQueryIntent(
            clean_query=raw_q,
            is_geo_query=False,
            intent_type="worldwide",
            radius_km=25.0,
            user_location=user_coords
        )

        # 1. Detect Freshness Requirements
        if any(w in raw_q.lower() for w in ["latest", "open now", "current", "today", "breaking", "live", "recent"]):
            intent.freshness_needed = True

        # 2. Detect Category
        for cat, patterns in CATEGORY_KEYWORDS.items():
            for pat in patterns:
                if re.search(r"\b" + pat + r"\b", raw_q, re.IGNORECASE):
                    intent.category = cat
                    break
            if intent.category:
                break

        # 3. Detect Explicit Radius (e.g., "within 20 km of Tambaram")
        radius_match = RADIUS_PATTERN.search(working_q)
        radius_place_candidate = None
        if radius_match:
            dist_val = float(radius_match.group("dist"))
            unit = radius_match.group("unit").lower()
            if "mile" in unit or unit == "mi":
                dist_val = dist_val * 1.60934 # Convert to km
            intent.radius_km = max(1.0, min(dist_val, 500.0))
            intent.intent_type = "within_radius"
            intent.is_geo_query = True

            after_match = working_q[radius_match.end():].strip()
            before_match = working_q[:radius_match.start()].strip()
            if after_match:
                radius_place_candidate = after_match
                working_q = before_match or after_match
            else:
                working_q = RADIUS_PATTERN.sub("", working_q).strip()

        # 4. Detect "Near Me" / "Nearby"
        if NEAR_ME_PATTERN.search(working_q):
            intent.is_geo_query = True
            intent.intent_type = "near_me"
            working_q = NEAR_ME_PATTERN.sub("", working_q).strip()
            # Clean leftover connector like "in", "near"
            working_q = re.sub(r"\b(in|near|around|at)\s*$", "", working_q, flags=re.IGNORECASE).strip()
            intent.clean_query = working_q or raw_q
            return intent

        # 5. Extract Named Geographic Entity (e.g. "Best hospitals in Chennai", "IT companies in Tambaram")
        geo_candidate = radius_place_candidate
        candidate_clean_q = working_q
        if not geo_candidate:
            conn_match = LOCATION_CONNECTOR_PATTERN.search(working_q)
            if conn_match:
                geo_candidate = conn_match.group(1).strip()
                candidate_clean_q = working_q[:conn_match.start()].strip()
            else:
                if "," in working_q:
                    parts = working_q.split(",")
                    possible_geo = parts[-1].strip()
                    if len(possible_geo.split()) <= 3:
                        geo_candidate = working_q[working_q.rfind(",") - len(parts[-2].strip()):].strip() if len(parts) >= 2 else possible_geo
                        candidate_clean_q = working_q[:working_q.find(geo_candidate)].strip()
                else:
                    # Check trailing tokens in working_q (e.g. "colleges Tambaram")
                    words = working_q.split()
                    if len(words) >= 2:
                        last_word = words[-1]
                        places_check = await self.geo_db.geocode(last_word)
                        if places_check and places_check[0].name.lower() == last_word.lower():
                            geo_candidate = last_word
                            candidate_clean_q = " ".join(words[:-1])

        # If connector found or potential candidate
        if geo_candidate:
            # Geocode the candidate
            places = await self.geo_db.geocode(
                geo_candidate,
                country_hint=context_country,
                state_hint=context_state,
                user_lat=user_coords.lat if user_coords else None,
                user_lon=user_coords.lon if user_coords else None
            )
            if places:
                intent.is_geo_query = True
                intent.geo_entity = geo_candidate
                intent.resolved_place = places[0]
                intent.ambiguous_matches = places[1:4] # Keep alternate resolutions
                intent.clean_query = candidate_clean_q or working_q

                # Set intent scope according to resolved place level
                level = places[0].admin_level
                if level == 2:
                    intent.intent_type = "country"
                elif level == 3:
                    intent.intent_type = "region"
                elif level in (4, 5):
                    intent.intent_type = "city"
                else:
                    intent.intent_type = "locality"

                return intent

        # 6. Fallback: Check if the entire query is a place name (e.g., "Tambaram", "London", "Japan")
        direct_places = await self.geo_db.geocode(
            working_q,
            country_hint=context_country,
            state_hint=context_state,
            user_lat=user_coords.lat if user_coords else None,
            user_lon=user_coords.lon if user_coords else None
        )
        if direct_places and (
            direct_places[0].name.lower() == working_q.lower() or
            working_q.lower() in [a.lower() for a in direct_places[0].alternate_names]
        ):
            intent.is_geo_query = True
            intent.geo_entity = direct_places[0].name
            intent.resolved_place = direct_places[0]
            intent.ambiguous_matches = direct_places[1:4]
            intent.clean_query = working_q
            intent.intent_type = "city" if direct_places[0].admin_level <= 5 else "locality"
            return intent

        intent.clean_query = working_q
        return intent

location_query_parser = LocationQueryParser()
