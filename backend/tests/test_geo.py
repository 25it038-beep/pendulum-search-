"""
Unit and Integration Tests for HS SEARCH - Global Geolocation Intelligence
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import pytest
import asyncio
from datetime import datetime
from app.database.connection import db
from app.geo.database import geo_db
from app.geo.models import GeoCoordinates, DocumentLocationRecord
from app.geo.geohash import encode_geohash, decode_geohash, haversine_distance_km, bounding_box_for_radius
from app.geo.spatial_index import spatial_index
from app.geo.query_parser import location_query_parser
from app.geo.ranking import geo_scorer
from app.geo.extractor import geo_extractor
from app.geo.live_local import live_local_service
from app.ai.july import july_assistant
from app.ranking.scorer import search_scorer

@pytest.mark.asyncio
async def test_global_geographic_database_and_multilingual():
    """Verify global coverage, continents, countries, states, localities, and multilingual scripts."""
    await db.init_db()

    # 1. Test Tamil Script Geocoding: சென்னை (Chennai)
    chennai_matches = await geo_db.geocode("சென்னை")
    assert len(chennai_matches) > 0
    assert chennai_matches[0].name == "Chennai"
    assert chennai_matches[0].country_code == "IN"

    # 2. Test Japanese Script Geocoding: 東京 (Tokyo)
    tokyo_matches = await geo_db.geocode("東京")
    assert len(tokyo_matches) > 0
    assert tokyo_matches[0].name == "Tokyo"
    assert tokyo_matches[0].country_code == "JP"

    # 3. Test Locality Geocoding: Tambaram
    tambaram_matches = await geo_db.geocode("Tambaram")
    assert len(tambaram_matches) > 0
    assert tambaram_matches[0].name == "Tambaram"
    assert tambaram_matches[0].city == "Chennai"
    assert tambaram_matches[0].postal_code == "600045"

    # 4. Test Global Countries Worldwide
    countries_to_test = [
        ("United States", "US"),
        ("United Kingdom", "GB"),
        ("France", "FR"),
        ("Germany", "DE"),
        ("Japan", "JP"),
        ("Australia", "AU"),
        ("Canada", "CA"),
        ("Brazil", "BR"),
        ("South Africa", "ZA"),
        ("Egypt", "EG")
    ]
    for country_name, code in countries_to_test:
        c_matches = await geo_db.geocode(country_name)
        assert len(c_matches) > 0
        assert c_matches[0].country_code == code

@pytest.mark.asyncio
async def test_place_name_disambiguation():
    """Verify context-aware disambiguation between same-named places."""
    await db.init_db()

    # 1. Cambridge, UK vs Cambridge, MA (USA)
    cam_uk = await geo_db.geocode("Cambridge", country_hint="GB")
    assert len(cam_uk) > 0
    assert cam_uk[0].country_code == "GB"

    cam_us = await geo_db.geocode("Cambridge", country_hint="US")
    assert len(cam_us) > 0
    assert cam_us[0].country_code == "US"
    assert cam_us[0].state_province == "Massachusetts"

    # 2. Salem, Tamil Nadu (India) vs Salem, Oregon (USA)
    salem_in = await geo_db.geocode("Salem", country_hint="IN")
    assert len(salem_in) > 0
    assert salem_in[0].country_code == "IN"
    assert salem_in[0].state_province == "Tamil Nadu"

    salem_us = await geo_db.geocode("Salem", country_hint="US")
    assert len(salem_us) > 0
    assert salem_us[0].country_code == "US"
    assert salem_us[0].state_province == "Oregon"

@pytest.mark.asyncio
async def test_geohash_and_spatial_math():
    """Verify Geohash encoding/decoding and Haversine great-circle distance."""
    # Chennai Central: 13.0827, 80.2707
    gh = encode_geohash(13.0827, 80.2707, precision=7)
    assert len(gh) == 7
    assert isinstance(gh, str)

    lat_dec, lon_dec, lat_err, lon_err = decode_geohash(gh)
    assert abs(lat_dec - 13.0827) < 0.01
    assert abs(lon_dec - 80.2707) < 0.01

    # Distance between Chennai (13.0827, 80.2707) and Tambaram (12.9249, 80.1000) is ~25 km
    dist = haversine_distance_km(13.0827, 80.2707, 12.9249, 80.1000)
    assert 20.0 <= dist <= 30.0

    # Bounding box for 10 km radius
    min_lat, max_lat, min_lon, max_lon = bounding_box_for_radius(12.9249, 80.1000, 10.0)
    assert min_lat < 12.9249 < max_lat
    assert min_lon < 80.1000 < max_lon

@pytest.mark.asyncio
async def test_intelligent_location_query_parser():
    """Verify extraction of topic, geo entity, radius, category and intent."""
    await db.init_db()

    # 1. "Restaurants near me"
    user_pos = GeoCoordinates(lat=12.9249, lon=80.1000)
    intent1 = await location_query_parser.parse_query("Restaurants near me", user_coords=user_pos)
    assert intent1.is_geo_query
    assert intent1.intent_type == "near_me"
    assert intent1.category == "restaurant"
    assert "restaurants" in intent1.clean_query.lower()

    # 2. "Best hospitals in Chennai"
    intent2 = await location_query_parser.parse_query("Best hospitals in Chennai")
    assert intent2.is_geo_query
    assert intent2.geo_entity == "Chennai"
    assert intent2.resolved_place is not None
    assert intent2.resolved_place.name == "Chennai"
    assert intent2.category == "hospital"
    assert "best hospitals" in intent2.clean_query.lower()

    # 3. "IT companies within 20 km of Tambaram"
    intent3 = await location_query_parser.parse_query("IT companies within 20 km of Tambaram")
    assert intent3.is_geo_query
    assert intent3.geo_entity == "Tambaram"
    assert intent3.radius_km == 20.0
    assert intent3.resolved_place is not None
    assert intent3.resolved_place.name == "Tambaram"

    # 4. "Tourist places in Japan"
    intent4 = await location_query_parser.parse_query("Tourist places in Japan")
    assert intent4.is_geo_query
    assert intent4.geo_entity == "Japan"
    assert intent4.intent_type == "country"

    # 5. "Latest news in London"
    intent5 = await location_query_parser.parse_query("Latest news in London")
    assert intent5.is_geo_query
    assert intent5.geo_entity == "London"
    assert intent5.freshness_needed

@pytest.mark.asyncio
async def test_spatial_index_and_local_discovery():
    """Verify R*Tree radius search and local POI discovery (hospitals, colleges)."""
    await db.init_db()

    # Tambaram coords: 12.9249, 80.1000
    # Search local colleges/universities within 10 km
    entities = await spatial_index.search_local_entities(
        lat=12.9249,
        lon=80.1000,
        radius_km=10.0,
        category="university"
    )
    assert len(entities) > 0
    # MIT Chromepet (~3.2 km) and Crescent (~6.1 km) should be returned
    names = [e.name for e in entities]
    assert any("MIT" in n or "Madras Institute of Technology" in n or "Crescent" in n for n in names)
    assert entities[0].distance_km is not None
    assert entities[0].distance_km <= 10.0

@pytest.mark.asyncio
async def test_geo_extractor_schema_org_and_meta():
    """Verify crawler extraction of Schema.org LocalBusiness, GeoCoordinates, and meta tags."""
    sample_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Tambaram Specialty Dental Clinic</title>
        <meta name="geo.position" content="12.9249;80.1000">
        <meta name="geo.placename" content="Tambaram">
        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "Dentist",
            "name": "Tambaram Dental Care",
            "address": {
                "@type": "PostalAddress",
                "streetAddress": "45 Shanmugam Road, West Tambaram",
                "addressLocality": "Chennai",
                "addressRegion": "Tamil Nadu",
                "postalCode": "600045",
                "addressCountry": "IN"
            },
            "geo": {
                "@type": "GeoCoordinates",
                "latitude": 12.9249,
                "longitude": 80.1000
            }
        }
        </script>
    </head>
    <body>
        <h1>Tambaram Dental Care Center</h1>
        <p>Serving patients in Tambaram, Chromepet, and Chennai with advanced dental implants.</p>
    </body>
    </html>
    """
    locations = await geo_extractor.extract_locations(
        html=sample_html,
        url="https://tambaramdentalcare.com",
        title="Tambaram Specialty Dental Clinic",
        body_text="Serving patients in Tambaram, Chromepet, and Chennai with advanced dental implants."
    )
    assert len(locations) > 0
    # Highest confidence item from Schema.org
    schema_item = next(loc for loc in locations if loc["source"] == "schema_org")
    assert schema_item["confidence"] >= 0.90
    assert schema_item["lat"] == 12.9249
    assert schema_item["lon"] == 80.1000
    assert schema_item["city"] == "Chennai"
    assert schema_item["location_type"] == "business_physical"

@pytest.mark.asyncio
async def test_search_scorer_with_geo_ranking():
    """Verify SearchScorer executes location-aware search with distances and geo metadata."""
    await db.init_db()

    # Search with query containing explicit location: "colleges in Tambaram"
    res = await search_scorer.execute_search(
        query="colleges in Tambaram",
        mode="general",
        limit=10
    )
    assert res["total_results"] > 0
    assert "geo_metadata" in res
    assert res["geo_metadata"]["is_geo_query"]
    assert res["geo_metadata"]["target_place"] == "Tambaram"

    # Verify first result has location and distance
    first = res["results"][0]
    assert "location" in first
    assert first["location"] is not None
    assert first["distance_km"] is not None
    assert first["distance_str"] is not None

@pytest.mark.asyncio
async def test_july_geosearch_intelligence():
    """Verify July LLM understands location queries, calculates distances, and provides citations."""
    await db.init_db()

    search_res = await search_scorer.execute_search(
        query="Find the best engineering colleges near Tambaram",
        mode="general",
        limit=10
    )
    july_output = await july_assistant.generate_answer_async(
        query="Find the best engineering colleges near Tambaram",
        search_results=search_res["results"],
        geo_metadata=search_res["geo_metadata"]
    )
    assert "JULY" in july_output["model"]
    assert "Tambaram" in july_output.get("target_location", "")
    assert len(july_output["citations"]) > 0
    assert len(july_output["key_takeaways"]) > 0
    # Citations must contain distance and coordinates info
    assert july_output["citations"][0].get("distance_km") is not None
    assert "freshness_statement" in july_output

@pytest.mark.asyncio
async def test_live_local_information():
    """Verify retrieval of live weather, transit updates, and public announcements."""
    chennai_live = live_local_service.get_live_local_info("Chennai")
    assert chennai_live is not None
    assert chennai_live["is_live"]
    assert "weather" in chennai_live
    assert chennai_live["weather"]["temperature_c"] > 0
    assert len(chennai_live["transit_updates"]) > 0
    assert "Tambaram" in chennai_live["transit_updates"][0]["line"]
