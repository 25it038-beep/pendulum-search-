"""
Intelligent Search Ranking Algorithm for HS SEARCH
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import math
import re
import json
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from app.database.connection import db
from app.database.models import SearchResultItem, ImageItem, VideoItem
from app.indexer.vector_index import vector_index
from app.geo.query_parser import location_query_parser
from app.geo.spatial_index import spatial_index
from app.geo.ranking import geo_scorer
from app.geo.database import geo_db
from app.geo.geohash import haversine_distance_km
from app.geo.models import GeoCoordinates
from app.geo.live_local import live_local_service
from app.nlp.language import multilingual_engine
from app.nlp.categorizer import universal_categorizer

class SearchScorer:
    """
    Original Multi-Factor Ranking Engine:
    Combines Full-Text BM25, Dense Semantic Vector Cosine Similarity,
    Temporal Freshness Decay, Domain Credibility, and Content Quality.
    """

    # Default weights for General search mode
    DEFAULT_WEIGHTS = {
        "text": 0.35,
        "semantic": 0.30,
        "freshness": 0.15,
        "credibility": 0.10,
        "quality": 0.10
    }

    # Mode-specific weight profiles
    MODE_WEIGHTS = {
        "general": {"text": 0.35, "semantic": 0.30, "freshness": 0.15, "credibility": 0.10, "quality": 0.10},
        "latest": {"text": 0.20, "semantic": 0.15, "freshness": 0.50, "credibility": 0.10, "quality": 0.05},
        "news": {"text": 0.25, "semantic": 0.20, "freshness": 0.40, "credibility": 0.15, "quality": 0.00},
        "tech": {"text": 0.35, "semantic": 0.35, "freshness": 0.10, "credibility": 0.10, "quality": 0.10},
        "academic": {"text": 0.30, "semantic": 0.35, "freshness": 0.05, "credibility": 0.20, "quality": 0.10},
        "image": {"text": 0.40, "semantic": 0.30, "freshness": 0.10, "credibility": 0.10, "quality": 0.10},
        "video": {"text": 0.40, "semantic": 0.30, "freshness": 0.10, "credibility": 0.10, "quality": 0.10},
        "research": {"text": 0.25, "semantic": 0.40, "freshness": 0.10, "credibility": 0.15, "quality": 0.10},
        "realtime": {"text": 0.20, "semantic": 0.15, "freshness": 0.55, "credibility": 0.05, "quality": 0.05}
    }

    def compute_freshness_score(self, pub_date: Optional[datetime], indexed_date: datetime) -> float:
        """
        Exponential temporal decay: e^(-lambda * dt_hours)
        Gives 1.0 for breaking items (<1 hour old), gracefully decays over 30 days.
        """
        ref_date = pub_date or indexed_date
        if ref_date and ref_date.tzinfo is not None:
            ref_date = ref_date.replace(tzinfo=None)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        age_hours = max(0.0, (now - ref_date).total_seconds() / 3600.0)

        # Half-life of 48 hours for fast news, baseline of 0.1 for evergreen content
        decay_constant = 0.0144 # ln(2) / 48
        return max(0.05, math.exp(-decay_constant * age_hours))

    def highlight_snippet(self, text: str, query: str, max_len: int = 240) -> str:
        """Extract relevant passage around query terms and add highlighting marks."""
        if not text:
            return ""

        words = [re.escape(w.lower()) for w in query.split() if len(w) > 2]
        if not words:
            return text[:max_len] + ("..." if len(text) > max_len else "")

        pattern = re.compile(r"|".join(words), re.IGNORECASE)
        match = pattern.search(text)

        if match:
            start_pos = max(0, match.start() - 60)
            end_pos = min(len(text), start_pos + max_len)
            snippet = text[start_pos:end_pos]
            if start_pos > 0:
                snippet = "..." + snippet
            if end_pos < len(text):
                snippet = snippet + "..."
            return snippet
        else:
            return text[:max_len] + ("..." if len(text) > max_len else "")

    def parse_universal_query_filters(self, raw_query: str) -> Dict[str, Any]:
        """
        Extracts universal search operators and filters from query:
        - Exact phrases: "exact match"
        - Domain: site:example.com
        - Content type: type:pdf, type:video, type:image, type:html
        - Language: lang:ta, lang:hi, lang:en
        - Category: category:healthcare, cat:education
        - Freshness: freshness:hour, freshness:day, freshness:week, freshness:month
        """
        clean_text = raw_query
        filters: Dict[str, Any] = {}

        # 1. Exact Phrases
        exact_phrases = re.findall(r'"([^"]+)"', raw_query)
        if exact_phrases:
            filters["exact_phrases"] = exact_phrases

        # 2. Site filter
        site_match = re.search(r"\bsite:([^\s]+)", clean_text, re.IGNORECASE)
        if site_match:
            filters["domain"] = site_match.group(1).lower().strip()
            clean_text = re.sub(r"\bsite:[^\s]+", "", clean_text, flags=re.IGNORECASE)

        # 3. Content Type filter
        type_match = re.search(r"\btype:([^\s]+)", clean_text, re.IGNORECASE)
        if type_match:
            filters["content_type"] = type_match.group(1).lower().strip()
            clean_text = re.sub(r"\btype:[^\s]+", "", clean_text, flags=re.IGNORECASE)

        # 4. Language filter
        lang_match = re.search(r"\blang:([^\s]+)", clean_text, re.IGNORECASE)
        if lang_match:
            filters["language"] = lang_match.group(1).lower().strip()
            clean_text = re.sub(r"\blang:[^\s]+", "", clean_text, flags=re.IGNORECASE)

        # 5. Category filter
        cat_match = re.search(r"\b(?:category|cat):([^\s]+)", clean_text, re.IGNORECASE)
        if cat_match:
            filters["category"] = cat_match.group(1).lower().strip()
            clean_text = re.sub(r"\b(?:category|cat):[^\s]+", "", clean_text, flags=re.IGNORECASE)

        # 6. Freshness filter
        fresh_match = re.search(r"\bfreshness:([^\s]+)", clean_text, re.IGNORECASE)
        if fresh_match:
            filters["freshness"] = fresh_match.group(1).lower().strip()
            clean_text = re.sub(r"\bfreshness:[^\s]+", "", clean_text, flags=re.IGNORECASE)

        filters["clean_query"] = clean_text.strip()
        return filters

    def compute_simhash_hamming_distance(self, h1: Optional[str], h2: Optional[str]) -> int:
        """Calculates hamming bit-distance between two 16-hex SimHashes (0-64)."""
        if not h1 or not h2 or len(h1) < 8 or len(h2) < 8:
            return 64
        try:
            val1 = int(h1, 16)
            val2 = int(h2, 16)
            xor_val = val1 ^ val2
            return bin(xor_val).count("1")
        except Exception:
            return 64

    async def execute_search(
        self,
        query: str,
        mode: str = "general",
        sort_by: str = "relevance", # "relevance", "newest", "oldest", "closest", "best_rated"
        limit: int = 20,
        offset: int = 0,
        user_lat: Optional[float] = None,
        user_lon: Optional[float] = None,
        radius_km: Optional[float] = None,
        location_name: Optional[str] = None,
        location_mode: Optional[str] = None, # "worldwide", "near_me", "city", "region", "country"
        ranking_mode: Optional[str] = None,
        domain_filter: Optional[str] = None,
        content_type_filter: Optional[str] = None,
        language_filter: Optional[str] = None,
        category_filter: Optional[str] = None,
        freshness_filter: Optional[str] = None,
        enable_diversity: bool = True,
        max_per_domain: int = 2
    ) -> Dict[str, Any]:
        """
        Universal Multi-Factor Search & Retrieval Engine.
        Supports:
        - Keyword BM25 & exact phrase matching
        - Multilingual dense semantic retrieval & cross-language concepts
        - Domain, Content-Type, Language, Category, and Freshness filtering
        - Domain diversity anti-monopoly reranking
        - SimHash near-duplicate and spam suppression
        - Global Geolocation Intelligence
        """
        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        user_coords = GeoCoordinates(lat=user_lat, lon=user_lon) if (user_lat is not None and user_lon is not None) else None

        # 1. Parse Universal Search Operators & Direct Filters
        parsed_filters = self.parse_universal_query_filters(query)
        effective_domain = domain_filter or parsed_filters.get("domain")
        effective_content_type = content_type_filter or parsed_filters.get("content_type")
        effective_language = language_filter or parsed_filters.get("language")
        effective_category = category_filter or parsed_filters.get("category")
        effective_freshness = freshness_filter or parsed_filters.get("freshness")
        exact_phrases = parsed_filters.get("exact_phrases", [])
        base_clean_query = parsed_filters.get("clean_query") or query

        # Parse Location Query
        geo_intent = await location_query_parser.parse_query(
            query=base_clean_query,
            user_coords=user_coords
        )

        effective_ranking_mode = ranking_mode or (
            "near_me" if geo_intent.intent_type == "near_me" else (
                "closest_first" if sort_by == "closest" else (
                    "best_rated" if sort_by == "best_rated" else (
                        "recently_updated" if sort_by == "newest" else (
                            "city_specific" if geo_intent.intent_type in ("city", "locality") else (
                                "country_specific" if geo_intent.intent_type in ("region", "country") else "most_relevant"
                            )
                        )
                    )
                )
            )
        )

        effective_radius = radius_km or geo_intent.radius_km or 25.0

        # Target coordinates for distance decay and map centering
        target_lat = None
        target_lon = None
        target_place_name = None

        if geo_intent.resolved_place:
            target_lat = geo_intent.resolved_place.lat
            target_lon = geo_intent.resolved_place.lon
            target_place_name = geo_intent.resolved_place.name
        elif user_coords:
            target_lat = user_coords.lat
            target_lon = user_coords.lon
            target_place_name = "Your Location"
        elif location_name and location_name.lower() != "worldwide":
            loc_places = await geo_db.geocode(location_name)
            if loc_places:
                target_lat = loc_places[0].lat
                target_lon = loc_places[0].lon
                target_place_name = loc_places[0].name

        clean_q = re.sub(r"[^\w\s]", " ", geo_intent.clean_query or query).strip()

        # 2. Retrieve Lexical Candidates from SQLite FTS5
        lexical_candidates: Dict[int, float] = {}
        if clean_q:
            fts_terms = " ".join([f'"{term}"*' for term in clean_q.split() if len(term) > 1])
            if fts_terms:
                async with db.get_connection() as conn:
                    try:
                        cursor = await conn.execute(
                            """SELECT rowid, bm25(documents_fts, 5.0, 2.0, 1.0, 2.0) as rank
                               FROM documents_fts
                               WHERE documents_fts MATCH ?
                               ORDER BY rank ASC
                               LIMIT 100""",
                            (fts_terms,)
                        )
                        rows = await cursor.fetchall()
                        for r in rows:
                            raw_rank = r["rank"]
                            norm_score = max(0.05, 1.0 / (1.0 + abs(raw_rank)))
                            lexical_candidates[r["rowid"]] = norm_score
                    except Exception:
                        pass

        # 3. Retrieve Semantic Vector Candidates
        semantic_candidates = dict(vector_index.search(geo_intent.clean_query or query, top_k=80))

        # Cross-lingual expansion for universal multilingual discovery
        cross_expansions = multilingual_engine.expand_cross_lingual_query(geo_intent.clean_query or query)
        for exp in cross_expansions[:4]:
            exp_results = vector_index.search(exp["query"], top_k=30)
            for d_id, sc in exp_results:
                if d_id not in semantic_candidates or sc > semantic_candidates[d_id]:
                    semantic_candidates[d_id] = sc * 0.90

        # 4. Spatial Radius Retrieval if target location active
        spatial_doc_map: Dict[int, Dict[str, Any]] = {}
        is_geo_active = (location_mode != "worldwide") or geo_intent.is_geo_query or (location_name and location_name.lower() != "worldwide")
        if target_lat is not None and target_lon is not None and is_geo_active:
            spatial_results = await spatial_index.search_radius(
                lat=target_lat,
                lon=target_lon,
                radius_km=effective_radius,
                limit=60
            )
            for sr in spatial_results:
                doc_id = sr["document_id"]
                spatial_doc_map[doc_id] = sr

        # Combine Candidate IDs
        candidate_ids = set(lexical_candidates.keys()).union(set(semantic_candidates.keys())).union(set(spatial_doc_map.keys()))

        # If query asks about today / latest / current, ensure today's indexed documents are included
        if any(w in query.lower() for w in ["today", "latest", "now", "current", "date"]):
            async with db.get_connection() as conn:
                cursor = await conn.execute("SELECT id FROM documents ORDER BY indexed_at DESC LIMIT 30")
                for r in await cursor.fetchall():
                    candidate_ids.add(r["id"])

        if not candidate_ids:
            async with db.get_connection() as conn:
                cursor = await conn.execute("SELECT id FROM documents ORDER BY indexed_at DESC LIMIT 50")
                candidate_ids = {r["id"] for r in await cursor.fetchall()}

        # 5. Fetch Full Document Records for Candidates
        doc_rows = []
        if candidate_ids:
            placeholders = ",".join("?" * len(candidate_ids))
            async with db.get_connection() as conn:
                cursor = await conn.execute(
                    f"SELECT * FROM documents WHERE id IN ({placeholders})",
                    list(candidate_ids)
                )
                doc_rows = await cursor.fetchall()

        # Query document_locations table for candidate documents
        doc_location_lookup: Dict[int, Dict[str, Any]] = dict(spatial_doc_map)
        if candidate_ids:
            missing_ids = [d_id for d_id in candidate_ids if d_id not in doc_location_lookup]
            if missing_ids:
                ph = ",".join("?" * len(missing_ids))
                async with db.get_connection() as conn:
                    cursor = await conn.execute(
                        f"""SELECT dl.* FROM document_locations dl WHERE dl.document_id IN ({ph})""",
                        missing_ids
                    )
                    for lr in await cursor.fetchall():
                        doc_location_lookup[lr["document_id"]] = {
                            "document_id": lr["document_id"],
                            "lat": lr["lat"],
                            "lon": lr["lon"],
                            "city": lr["city"],
                            "state": lr["state_province"],
                            "country": lr["country_name"],
                            "country_code": lr["country_code"],
                            "locality": lr["locality"],
                            "street_address": lr["street_address"],
                            "location_type": lr["location_type"]
                        }

        # 6. Apply Multi-Factor Scoring & Spatial Ranking
        scored_items: List[SearchResultItem] = []
        seen_simhashes: List[str] = []
        domain_counts: Dict[str, int] = {}
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        for r in doc_rows:
            doc_id = r["id"]
            title = r["title"]
            content = r["content_text"]
            url = r["url"]
            domain = r["domain"]
            raw_meta = json.loads(r["metadata_json"] or "{}")
            category = raw_meta.get("category", "general")
            content_type = raw_meta.get("content_type", "text/html")
            doc_lang = raw_meta.get("language", "en")
            is_live = bool(r["is_live"])

            # 6a. Explicit Operator & Parameter Filtering
            if effective_domain and effective_domain.lower() not in domain.lower():
                continue

            if effective_content_type:
                ct_clean = effective_content_type.lower()
                if ct_clean == "pdf" and not (url.lower().endswith(".pdf") or "application/pdf" in content_type):
                    continue
                elif ct_clean == "video" and not json.loads(r["videos_json"] or "[]"):
                    continue
                elif ct_clean == "image" and not json.loads(r["images_json"] or "[]"):
                    continue
                elif ct_clean in ("api", "json", "dataset") and not ("json" in content_type or "dataset" in category):
                    continue

            if effective_language and doc_lang.lower() != effective_language.lower():
                continue

            if effective_category and effective_category.lower() not in category.lower() and effective_category.lower() not in raw_meta.get("category_label", "").lower():
                continue

            # Extract dates for freshness
            pub_dt = datetime.fromisoformat(r["published_at"]).replace(tzinfo=None) if r["published_at"] else None
            idx_dt = datetime.fromisoformat(r["indexed_at"]).replace(tzinfo=None)
            doc_age_sec = (now - (pub_dt or idx_dt)).total_seconds()

            if effective_freshness:
                ef = effective_freshness.lower()
                if ef in ("1h", "hour", "breaking") and doc_age_sec > 3600:
                    continue
                elif ef in ("24h", "day", "today") and doc_age_sec > 86400:
                    continue
                elif ef in ("7d", "week") and doc_age_sec > 604800:
                    continue
                elif ef in ("30d", "month") and doc_age_sec > 2592000:
                    continue

            # Exact phrase enforcement & boost
            exact_match_all = True
            if exact_phrases:
                doc_full_corpus = f"{title} {r['snippet'] or ''} {content}".lower()
                for phrase in exact_phrases:
                    if phrase.lower() not in doc_full_corpus:
                        exact_match_all = False
                        break
                if not exact_match_all and len(clean_q.split()) <= len(" ".join(exact_phrases).split()):
                    # User strictly searched for exact phrase, exclude non-matches
                    continue

            # 6b. Near-Duplicate Suppression via SimHash (Section 9)
            doc_simhash = r["simhash"]
            if doc_simhash:
                is_duplicate = False
                for seen_sh in seen_simhashes[-40:]:
                    if self.compute_simhash_hamming_distance(doc_simhash, seen_sh) <= 3:
                        is_duplicate = True
                        break
                if is_duplicate:
                    continue
                seen_simhashes.append(doc_simhash)

            # Mode filters
            if mode == "image" and not json.loads(r["images_json"] or "[]"):
                continue
            if mode == "video" and not json.loads(r["videos_json"] or "[]"):
                continue
            if mode == "news" and category not in ("news", "general", "news_information"):
                continue
            if mode == "tech" and category not in ("tech", "general", "science_research"):
                continue
            if mode == "academic" and category not in ("academic", "general", "education", "science_research"):
                continue
            if mode == "realtime" and not is_live:
                if (now - idx_dt).total_seconds() > 7200:
                    continue

            # Component Scores
            text_score = lexical_candidates.get(doc_id, 0.0)
            if exact_phrases and exact_match_all:
                text_score = min(1.0, text_score * 1.5 + 0.3)
            sem_score = semantic_candidates.get(doc_id, 0.0)
            fresh_score = self.compute_freshness_score(pub_dt, idx_dt)
            cred_score = float(r["credibility_score"] or 0.5)
            qual_score = float(r["quality_score"] or 0.5)

            is_wikipedia = "wikipedia.org" in domain.lower()
            q_lower = query.lower()
            is_def_or_hist = any(
                w in q_lower
                for w in ("what is", "who is", "define ", "definition", "meaning", "history of", "overview")
            )
            if is_wikipedia and not is_def_or_hist:
                cred_score = min(cred_score, 0.56)

            # Location and distance calculation
            loc_info = doc_location_lookup.get(doc_id)
            distance_km = None
            distance_str = None
            geo_score = 0.0

            if loc_info and loc_info.get("lat") and loc_info.get("lon") and target_lat is not None and target_lon is not None:
                distance_km = haversine_distance_km(target_lat, target_lon, loc_info["lat"], loc_info["lon"])
                distance_km = round(distance_km, 2)
                distance_str = f"{distance_km:.1f} km away" if distance_km >= 1.0 else f"{int(distance_km * 1000)} m away"
                geo_score = geo_scorer.compute_distance_score(distance_km, effective_radius)

            # Base composite score
            weights = self.MODE_WEIGHTS.get(mode.lower(), self.DEFAULT_WEIGHTS)
            composite_score = (
                weights["text"] * text_score +
                weights["semantic"] * sem_score +
                weights["freshness"] * fresh_score +
                weights["credibility"] * cred_score +
                weights["quality"] * qual_score
            )

            # 6c. Domain Diversity Reranking (Anti-Monopoly: Cap Wikipedia & single-domain crowding)
            if enable_diversity:
                d_key = "wikipedia.org" if is_wikipedia else domain.lower()
                domain_cap = 1 if (is_wikipedia and not is_def_or_hist) else max_per_domain
                d_count = domain_counts.get(d_key, 0)
                domain_counts[d_key] = d_count + 1
                if d_count >= domain_cap:
                    excess = d_count - domain_cap + 1
                    diversity_damp = 1.0 / (1.0 + excess * 0.75)
                    composite_score *= diversity_damp

            # Highlight snippet
            clean_snippet = self.highlight_snippet(r["snippet"] or content, geo_intent.clean_query or query)

            # Images and videos strictly isolated to image/video modes
            images_raw = json.loads(r["images_json"] or "[]") if mode in ("image", "video") else []
            images = [ImageItem(**img) for img in images_raw[:6]]
            videos_raw = json.loads(r["videos_json"] or "[]") if mode == "video" else []
            videos = [VideoItem(**vid) for vid in videos_raw[:2]]

            # Human readable date strings
            pub_str = None
            if pub_dt:
                age_s = (now - pub_dt).total_seconds()
                if age_s < 3600:
                    pub_str = f"{int(age_s // 60)} min ago"
                elif age_s < 86400:
                    pub_str = f"{int(age_s // 3600)}h ago"
                else:
                    pub_str = pub_dt.strftime("%b %d, %Y")

            idx_age_s = (now - idx_dt).total_seconds()
            if idx_age_s < 3600:
                idx_str = f"Indexed {max(1, int(idx_age_s // 60))}m ago"
            else:
                idx_str = f"Indexed {idx_dt.strftime('%b %d, %H:%M')}"

            scored_items.append(SearchResultItem(
                id=doc_id,
                url=url,
                domain=domain,
                title=title,
                snippet=clean_snippet,
                published_at=pub_dt,
                indexed_at=idx_dt,
                published_str=pub_str,
                indexed_str=idx_str,
                score=round(composite_score, 4),
                text_score=round(text_score, 3),
                semantic_score=round(sem_score, 3),
                freshness_score=round(fresh_score, 3),
                credibility_score=round(cred_score, 3),
                category=category,
                category_label=raw_meta.get("category_label", "General Web"),
                language=doc_lang,
                content_type=content_type,
                images=images,
                videos=videos,
                is_live=is_live,
                source_type=r["source_type"] or "crawler",
                location=loc_info,
                geo_score=round(geo_score, 3),
                distance_km=distance_km,
                distance_str=distance_str
            ))

        # 7. Local Discovery Entities (POI integration if geo active)
        if target_lat is not None and target_lon is not None and is_geo_active:
            local_entities = await spatial_index.search_local_entities(
                lat=target_lat,
                lon=target_lon,
                radius_km=effective_radius,
                category=geo_intent.category,
                query_text=geo_intent.clean_query if geo_intent.clean_query != query else None,
                limit=15
            )
            for le in local_entities:
                poi_item = SearchResultItem(
                    id=1000000 + (le.id or 1),
                    url=le.website or f"https://hsaisolutions.com/places/{le.id}",
                    domain=re.sub(r"^https?://(www\.)?", "", le.website).split("/")[0] if le.website else "hsaisolutions.com",
                    title=f"{le.name} ({le.category.replace('_', ' ').title()})",
                    snippet=f"{le.address}. {le.subcategory.replace('_', ' ').title() if le.subcategory else ''} Operating Hours: {le.opening_hours or 'Verified Standard Hours'}. Rating: {le.rating or 4.5} ★ ({le.review_count or 0} reviews). Status: {le.verified_status.replace('_', ' ').title()}.",
                    published_at=None,
                    indexed_at=datetime.now(timezone.utc).replace(tzinfo=None),
                    published_str="Verified Place",
                    indexed_str="Verified Registry",
                    score=0.92,
                    text_score=0.90,
                    semantic_score=0.85,
                    freshness_score=0.80,
                    credibility_score=0.95,
                    category=le.category,
                    location={
                        "name": le.name,
                        "address": le.address,
                        "city": le.city,
                        "state": le.state,
                        "country": le.country,
                        "country_code": le.country_code,
                        "postal_code": le.postal_code,
                        "lat": le.lat,
                        "lon": le.lon,
                        "phone": le.phone,
                        "opening_hours": le.opening_hours,
                        "is_open_now": le.is_open_now,
                        "verified_status": le.verified_status,
                        "rating": le.rating,
                        "review_count": le.review_count
                    },
                    geo_score=round(geo_scorer.compute_distance_score(le.distance_km, effective_radius), 3),
                    distance_km=le.distance_km,
                    distance_str=f"{le.distance_km:.1f} km away" if le.distance_km and le.distance_km >= 1.0 else (f"{int(le.distance_km * 1000)} m away" if le.distance_km is not None else None),
                    is_live=bool(le.is_open_now),
                    source_type="local_discovery"
                )
                scored_items.append(poi_item)

        # 8. Sort and Rank with Hybrid GeoScorer
        items_dict = [it.model_dump() for it in scored_items]
        ranked_dict = geo_scorer.rank_items(
            items=items_dict,
            ranking_mode=effective_ranking_mode,
            user_lat=target_lat,
            user_lon=target_lon,
            target_radius_km=effective_radius
        )

        total_count = len(ranked_dict)
        paginated_items = ranked_dict[offset:offset + limit]
        exec_time = (datetime.now(timezone.utc).replace(tzinfo=None) - start_time).total_seconds() * 1000

        # Retrieve live local data for the target place if available
        live_local_info = None
        if target_place_name:
            live_local_info = live_local_service.get_live_local_info(target_place_name)

        # Build Geo Metadata block
        geo_metadata = {
            "is_geo_query": geo_intent.is_geo_query or (target_lat is not None),
            "intent_type": geo_intent.intent_type,
            "target_place": target_place_name,
            "target_lat": target_lat,
            "target_lon": target_lon,
            "radius_km": effective_radius,
            "ranking_mode": effective_ranking_mode,
            "category": geo_intent.category,
            "ambiguous_matches": [p.model_dump() for p in geo_intent.ambiguous_matches],
            "live_local_info": live_local_info
        }

        # Log query asynchronously
        asyncio.create_task(self._log_query(query, mode, total_count, exec_time))

        return {
            "query": query,
            "clean_query": geo_intent.clean_query or query,
            "mode": mode,
            "sort_by": sort_by,
            "ranking_mode": effective_ranking_mode,
            "total_results": total_count,
            "execution_time_ms": round(exec_time, 2),
            "geo_metadata": geo_metadata,
            "applied_filters": {
                "domain": effective_domain,
                "content_type": effective_content_type,
                "language": effective_language,
                "category": effective_category,
                "freshness": effective_freshness,
                "exact_phrases": exact_phrases
            },
            "results": paginated_items
        }

    async def _log_query(self, query: str, mode: str, count: int, latency_ms: float):
        try:
            async with db.get_connection() as conn:
                await conn.execute(
                    """INSERT INTO search_queries (query, mode, results_count, execution_time_ms, searched_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (query, mode, count, latency_ms, datetime.now(timezone.utc).isoformat())
                )
                await conn.commit()
        except Exception:
            pass

search_scorer = SearchScorer()
