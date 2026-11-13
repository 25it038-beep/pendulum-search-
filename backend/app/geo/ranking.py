"""
HS SEARCH - Location-Based Hybrid Ranking Engine
Company: HS AI Solutions
Founder: Harshan Seliyan

Implements multi-factor hybrid scoring with spatial proximity decay:
Score = w_text * BM25 + w_sem * CosineSim + w_geo * GeoProximity + w_fresh * Freshness + w_cred * Credibility + w_qual * Quality + w_verif * Verification

Ranking modes:
- Near Me (distance-dominant for local intents)
- Closest First (pure ascending distance)
- Most Relevant (hybrid balanced)
- Best Rated (only when verified rating data exists)
- Recently Updated (freshness dominant)
- City Specific
- Country Specific
- Worldwide (location weight zeroed out)
"""

import math
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.geo.geohash import haversine_distance_km

class GeoScorer:
    """Computes geographic relevance scores and combines them with universal ranking."""

    RANKING_MODE_WEIGHTS = {
        "near_me": {"text": 0.25, "semantic": 0.20, "geo": 0.40, "freshness": 0.05, "credibility": 0.05, "quality": 0.05},
        "closest_first": {"text": 0.10, "semantic": 0.10, "geo": 0.70, "freshness": 0.05, "credibility": 0.02, "quality": 0.03},
        "most_relevant": {"text": 0.35, "semantic": 0.30, "geo": 0.15, "freshness": 0.10, "credibility": 0.05, "quality": 0.05},
        "best_rated": {"text": 0.25, "semantic": 0.20, "geo": 0.20, "rating": 0.25, "freshness": 0.05, "credibility": 0.05},
        "recently_updated": {"text": 0.20, "semantic": 0.15, "geo": 0.15, "freshness": 0.40, "credibility": 0.05, "quality": 0.05},
        "city_specific": {"text": 0.30, "semantic": 0.25, "geo": 0.25, "freshness": 0.10, "credibility": 0.05, "quality": 0.05},
        "country_specific": {"text": 0.35, "semantic": 0.30, "geo": 0.15, "freshness": 0.10, "credibility": 0.05, "quality": 0.05},
        "worldwide": {"text": 0.40, "semantic": 0.35, "geo": 0.00, "freshness": 0.15, "credibility": 0.05, "quality": 0.05}
    }

    def compute_distance_score(self, distance_km: float, max_radius_km: float = 25.0) -> float:
        """
        Smooth exponential decay for geographic proximity:
        Score approaches 1.0 when distance is 0 km, decays smoothly over radius.
        """
        if distance_km is None or distance_km < 0:
            return 0.0
        # Scale parameter so that at distance = radius, score is approx 0.36
        scale = max(max_radius_km, 5.0)
        return max(0.01, math.exp(-distance_km / scale))

    def compute_administrative_match_bonus(
        self,
        doc_loc: Dict[str, Any],
        target_country: Optional[str] = None,
        target_state: Optional[str] = None,
        target_city: Optional[str] = None,
        target_locality: Optional[str] = None
    ) -> float:
        """
        Calculates administrative hierarchy containment score:
        Locality match: +1.0
        City match: +0.75
        State match: +0.50
        Country match: +0.25
        """
        bonus = 0.0
        if target_locality and doc_loc.get("locality"):
            if target_locality.lower() == doc_loc["locality"].lower():
                return 1.0

        if target_city and doc_loc.get("city"):
            if target_city.lower() == doc_loc["city"].lower():
                bonus = max(bonus, 0.75)

        if target_state and doc_loc.get("state_province"):
            if target_state.lower() in doc_loc["state_province"].lower():
                bonus = max(bonus, 0.50)

        if target_country and (doc_loc.get("country_code") or doc_loc.get("country_name")):
            code = (doc_loc.get("country_code") or "").lower()
            name = (doc_loc.get("country_name") or "").lower()
            if target_country.lower() in (code, name):
                bonus = max(bonus, 0.25)

        return bonus

    def rank_items(
        self,
        items: List[Dict[str, Any]],
        ranking_mode: str = "most_relevant",
        user_lat: Optional[float] = None,
        user_lon: Optional[float] = None,
        target_radius_km: float = 25.0
    ) -> List[Dict[str, Any]]:
        """
        Ranks candidate search items according to the requested mode and geographic factors.
        """
        mode = ranking_mode.lower()
        weights = self.RANKING_MODE_WEIGHTS.get(mode, self.RANKING_MODE_WEIGHTS["most_relevant"])

        for it in items:
            # 1. Base Scores
            text_score = float(it.get("text_score") or 0.0)
            sem_score = float(it.get("semantic_score") or 0.0)
            fresh_score = float(it.get("freshness_score") or 0.1)
            cred_score = float(it.get("credibility_score") or 0.5)
            qual_score = float(it.get("quality_score") or 0.5)

            # 2. Distance & Geo Score
            dist_km = it.get("distance_km")
            if dist_km is None and user_lat is not None and user_lon is not None and it.get("lat") and it.get("lon"):
                dist_km = haversine_distance_km(user_lat, user_lon, it["lat"], it["lon"])
                it["distance_km"] = round(dist_km, 2)
                it["distance_str"] = f"{dist_km:.1f} km away" if dist_km >= 1.0 else f"{int(dist_km * 1000)} m away"

            geo_score = self.compute_distance_score(dist_km, target_radius_km) if dist_km is not None else 0.0
            it["geo_score"] = round(geo_score, 3)

            # 3. Verified Rating Score
            rating_score = 0.0
            if it.get("rating"):
                rating_score = min(1.0, float(it["rating"]) / 5.0)

            # 4. Composite Score
            score = (
                weights.get("text", 0.0) * text_score +
                weights.get("semantic", 0.0) * sem_score +
                weights.get("geo", 0.0) * geo_score +
                weights.get("freshness", 0.0) * fresh_score +
                weights.get("credibility", 0.0) * cred_score +
                weights.get("quality", 0.0) * qual_score +
                weights.get("rating", 0.0) * rating_score
            )
            it["score"] = round(score, 4)

        # Sorting
        if mode == "closest_first":
            # Items with distance come first, sorted by distance ascending
            items.sort(key=lambda x: (x.get("distance_km") is None, x.get("distance_km") or float("inf")))
        elif mode == "recently_updated":
            items.sort(key=lambda x: x.get("published_at") or x.get("indexed_at") or "", reverse=True)
        elif mode == "best_rated":
            items.sort(key=lambda x: (x.get("rating") or 0.0, x.get("score") or 0.0), reverse=True)
        else: # most_relevant, near_me, city_specific, etc.
            if mode in ("near_me", "city_specific") or user_lat is not None:
                items.sort(key=lambda x: (x.get("location") is None and x.get("distance_km") is None, -(x.get("score") or 0.0)))
            else:
                items.sort(key=lambda x: x.get("score") or 0.0, reverse=True)

        return items

geo_scorer = GeoScorer()
