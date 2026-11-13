"""
Pendulum Hybrid Search Ranker
Company: HS AI Solutions
Founder: Harshan Seliyan

Implements Reciprocal Rank Fusion (RRF) + 7-component final scoring for
merged results from Pendulum's native index and external search providers.

Scoring Components:
  lexical      (0.30) — BM25 / full-text match quality
  semantic     (0.20) — Dense vector cosine similarity
  authority    (0.15) — Domain authority / credibility
  freshness    (0.10) — Publication recency decay
  geographic   (0.10) — Geo-proximity signal (if applicable)
  rrf          (0.10) — Reciprocal Rank Fusion cross-provider signal
  completeness (0.05) — Content richness (title + snippet length + images)

Source labels:
  Pendulum native only  → "Pendulum Indexed"
  External only         → "External Search"
  Both providers        → "Multiple Sources"
"""

import math
import re
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_TRACKING_PARAMS = frozenset({
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "ref", "fbclid", "gclid", "source", "trk", "si",
})

_HIGH_AUTHORITY = frozenset({
    "wikipedia.org", "britannica.com", "bbc.com", "reuters.com", "apnews.com",
    "nature.com", "science.org", "arxiv.org", "pubmed.ncbi.nlm.nih.gov",
    "who.int", "un.org", "gov.uk", "nytimes.com", "theguardian.com",
    "stackoverflow.com", "github.com", "developer.mozilla.org", "docs.python.org",
    "w3.org", "ietf.org", "ieee.org", "acm.org",
})

_MEDIUM_AUTHORITY = frozenset({
    "medium.com", "dev.to", "hackernoon.com", "techcrunch.com", "wired.com",
    "arstechnica.com", "venturebeat.com", "zdnet.com", "infoq.com",
    "towardsdatascience.com", "analyticsvidhya.com", "kaggle.com",
})

_PROVIDER_WEIGHTS = {
    "pendulum": 1.20,  # Pendulum native index
    "external": 1.00,  # External (DDG / SearXNG)
}

_RRF_K = 60  # Standard RRF constant

DEFAULT_WEIGHTS = {
    "lexical": 0.30,
    "semantic": 0.20,
    "authority": 0.15,
    "freshness": 0.10,
    "geographic": 0.10,
    "rrf": 0.10,
    "completeness": 0.05,
}

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class HybridResult:
    id: str
    title: str
    url: str
    canonical_url: str
    snippet: str
    domain: str
    published_at: Optional[datetime]
    indexed_at: Optional[datetime]
    published_str: str
    indexed_str: str

    # Sources that contributed this result
    sources: List[str] = field(default_factory=list)   # e.g. ["pendulum", "external"]
    provider_ranks: Dict[str, int] = field(default_factory=dict)

    # Score components
    scores: Dict[str, float] = field(default_factory=dict)

    # Final computed score
    final_score: float = 0.0

    # Display metadata
    source_label: str = "External Search"
    favicon: str = ""
    images: List[Dict] = field(default_factory=list)
    location: Optional[Dict] = None
    distance_km: Optional[float] = None
    distance_str: Optional[str] = None
    is_live: bool = False
    language: str = "en"
    category: str = "general"
    content_type: str = "text/html"

    # Raw provider data for further processing
    _raw_text_score: float = 0.0
    _raw_semantic_score: float = 0.0
    _raw_geo_score: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "url": self.url,
            "canonicalUrl": self.canonical_url,
            "snippet": self.snippet,
            "domain": self.domain,
            "publishedAt": self.published_at.isoformat() if self.published_at else None,
            "indexedAt": self.indexed_at.isoformat() if self.indexed_at else None,
            "publishedStr": self.published_str,
            "indexedStr": self.indexed_str,
            "sources": self.sources,
            "providerRanks": self.provider_ranks,
            "scores": {k: round(v, 4) for k, v in self.scores.items()},
            "score": round(self.final_score, 4),
            "sourceLabel": self.source_label,
            "favicon": self.favicon,
            "images": self.images,
            "location": self.location,
            "distanceKm": self.distance_km,
            "distanceStr": self.distance_str,
            "isLive": self.is_live,
            "language": self.language,
            "category": self.category,
            "contentType": self.content_type,
        }


# ---------------------------------------------------------------------------
# Stats tracker (in-memory, reset on restart)
# ---------------------------------------------------------------------------

class HybridRankerStats:
    def __init__(self):
        self.total_queries = 0
        self.total_pendulum_results = 0
        self.total_external_results = 0
        self.total_merged = 0
        self.total_deduped = 0
        self.provider_errors: Dict[str, int] = {"pendulum": 0, "external": 0}
        self.avg_latency_ms: Dict[str, float] = {"pendulum": 0.0, "external": 0.0}
        self._latency_counts: Dict[str, int] = {"pendulum": 0, "external": 0}

    def record_query(self, pendulum_count: int, external_count: int, deduped: int):
        self.total_queries += 1
        self.total_pendulum_results += pendulum_count
        self.total_external_results += external_count
        self.total_merged += pendulum_count + external_count - deduped
        self.total_deduped += deduped

    def record_latency(self, provider: str, latency_ms: float):
        n = self._latency_counts.get(provider, 0)
        prev = self.avg_latency_ms.get(provider, 0.0)
        self.avg_latency_ms[provider] = (prev * n + latency_ms) / (n + 1)
        self._latency_counts[provider] = n + 1

    def record_error(self, provider: str):
        self.provider_errors[provider] = self.provider_errors.get(provider, 0) + 1

    def to_dict(self) -> Dict[str, Any]:
        dedup_rate = (self.total_deduped / max(1, self.total_pendulum_results + self.total_external_results))
        return {
            "totalQueries": self.total_queries,
            "totalPendulumResults": self.total_pendulum_results,
            "totalExternalResults": self.total_external_results,
            "totalMerged": self.total_merged,
            "totalDeduped": self.total_deduped,
            "dedupRate": round(dedup_rate, 3),
            "providerErrors": self.provider_errors,
            "avgLatencyMs": {k: round(v, 1) for k, v in self.avg_latency_ms.items()},
        }


hybrid_ranker_stats = HybridRankerStats()


# ---------------------------------------------------------------------------
# Main Ranker
# ---------------------------------------------------------------------------

class HybridRanker:
    """
    Merge, deduplicate, and rank results from Pendulum native index + external providers.
    Applies RRF + 7-component weighted scoring.
    """

    def __init__(self, weights: Optional[Dict[str, float]] = None):
        self.weights = weights or DEFAULT_WEIGHTS
        # Normalize weights to sum to 1.0
        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in self.weights.items()}

    # -------------------------------------------------------------------------
    # URL normalization
    # -------------------------------------------------------------------------

    def canonicalize_url(self, url: str) -> str:
        try:
            p = urlparse(url.strip())
            netloc = p.netloc.lower()
            if netloc.startswith("www."):
                netloc = netloc[4:]
            path = p.path.rstrip("/") or "/"
            params = {k: v for k, v in parse_qs(p.query).items()
                      if k not in _TRACKING_PARAMS}
            q = urlencode(params, doseq=True)
            return urlunparse((p.scheme.lower() or "https", netloc, path, "", q, ""))
        except Exception:
            return url.strip().lower().rstrip("/")

    def result_id(self, url: str) -> str:
        return hashlib.md5(self.canonicalize_url(url).encode()).hexdigest()[:16]

    # -------------------------------------------------------------------------
    # Title similarity dedup
    # -------------------------------------------------------------------------

    def _title_key(self, title: str) -> str:
        """Normalize title for similarity comparison."""
        return re.sub(r"[^a-z0-9 ]", "", title.lower()).strip()

    def _title_overlap(self, a: str, b: str) -> float:
        """Word-level Jaccard similarity."""
        sa = set(self._title_key(a).split())
        sb = set(self._title_key(b).split())
        if not sa or not sb:
            return 0.0
        return len(sa & sb) / len(sa | sb)

    # -------------------------------------------------------------------------
    # Score components
    # -------------------------------------------------------------------------

    def _lexical_score(self, result: HybridResult) -> float:
        """Use raw text score from native provider, or estimate from snippet quality."""
        s = result._raw_text_score
        if s <= 0:
            # Estimate: longer snippets → better content match
            s = min(1.0, len(result.snippet) / 300)
        return min(1.0, max(0.0, s))

    def _semantic_score(self, result: HybridResult) -> float:
        s = result._raw_semantic_score
        return min(1.0, max(0.0, s))

    def _authority_score(self, domain: str) -> float:
        clean = domain.lstrip("www.").lower()
        for auth in _HIGH_AUTHORITY:
            if clean == auth or clean.endswith("." + auth):
                return 1.0
        for med in _MEDIUM_AUTHORITY:
            if clean == med or clean.endswith("." + med):
                return 0.70
        # TLD signals
        if clean.endswith(".gov") or clean.endswith(".edu") or clean.endswith(".ac.uk"):
            return 0.90
        return 0.40

    def _freshness_score(self, pub_date: Optional[datetime]) -> float:
        """Exponential decay. Half-life ≈ 48 hours for news; floors at 0.05."""
        if not pub_date:
            return 0.30  # Unknown date — moderate score
        try:
            now = datetime.now(timezone.utc)
            if pub_date.tzinfo is None:
                pub_date = pub_date.replace(tzinfo=timezone.utc)
            age_hours = max(0.0, (now - pub_date).total_seconds() / 3600)
            # Decay constant: ln(2) / 168h (1 week half-life — balanced for general search)
            decay = 0.00413
            return max(0.05, math.exp(-decay * age_hours))
        except Exception:
            return 0.30

    def _geographic_score(self, result: HybridResult) -> float:
        if result._raw_geo_score > 0:
            return min(1.0, result._raw_geo_score)
        if result.distance_km is not None:
            # Inverse distance: closer = higher
            return max(0.0, 1.0 - result.distance_km / 50.0)
        return 0.0  # Non-geo result

    def _rrf_score(self, result: HybridResult) -> float:
        """
        Reciprocal Rank Fusion across providers.
        Score = Σ(weight_i / (k + rank_i))  for each provider i
        """
        rrf = 0.0
        for provider, rank in result.provider_ranks.items():
            w = _PROVIDER_WEIGHTS.get(provider, 1.0)
            rrf += w / (_RRF_K + rank)
        # Normalize to 0-1 range (theoretical max ≈ 2 providers × 1.2/60 ≈ 0.04)
        return min(1.0, rrf * 25)  # scale so rank-1 from both ≈ 1.0

    def _completeness_score(self, result: HybridResult) -> float:
        """Content richness signal."""
        score = 0.0
        if result.title and len(result.title) > 10:
            score += 0.4
        if result.snippet and len(result.snippet) > 80:
            score += 0.4
        if result.images:
            score += 0.2
        return min(1.0, score)

    def compute_final_score(self, result: HybridResult) -> Dict[str, float]:
        components = {
            "lexical": self._lexical_score(result),
            "semantic": self._semantic_score(result),
            "authority": self._authority_score(result.domain),
            "freshness": self._freshness_score(result.published_at),
            "geographic": self._geographic_score(result),
            "rrf": self._rrf_score(result),
            "completeness": self._completeness_score(result),
        }
        final = sum(self.weights.get(k, 0.0) * v for k, v in components.items())
        components["final"] = round(min(1.0, max(0.0, final)), 4)
        return components

    # -------------------------------------------------------------------------
    # Source label
    # -------------------------------------------------------------------------

    def _source_label(self, sources: List[str]) -> str:
        has_pendulum = "pendulum" in sources
        has_external = "external" in sources
        if has_pendulum and has_external:
            return "Multiple Sources"
        if has_pendulum:
            return "Pendulum Indexed"
        return "External Search"

    # -------------------------------------------------------------------------
    # Merge & rank
    # -------------------------------------------------------------------------

    def merge_and_rank(
        self,
        pendulum_results: List[Dict[str, Any]],
        external_results: List[Dict[str, Any]],
        user_lat: Optional[float] = None,
        user_lon: Optional[float] = None,
        limit: int = 20,
    ) -> List[HybridResult]:
        """
        Merge results from both providers into a single ranked list.

        Args:
            pendulum_results: Serialized SearchResultItem dicts from native scorer.
            external_results: ProviderResult-like dicts from external provider.
            user_lat / user_lon: User coordinates for geographic scoring.
            limit: Maximum results to return.

        Returns:
            Ranked list of HybridResult objects.
        """
        seen_canonical: Dict[str, HybridResult] = {}
        seen_titles: List[str] = []
        dedup_count = 0

        # --- Ingest Pendulum results ---
        for rank, item in enumerate(pendulum_results):
            url = item.get("url", "")
            if not url:
                continue
            can = self.canonicalize_url(url)
            rid = self.result_id(url)

            title = item.get("title", "")
            # Title dedup
            if self._is_title_duplicate(title, seen_titles):
                dedup_count += 1
                continue
            seen_titles.append(title)

            pub_at = self._parse_dt(item.get("published_at") or item.get("publishedAt"))
            idx_at = self._parse_dt(item.get("indexed_at") or item.get("indexedAt"))
            domain = item.get("domain") or self._extract_domain(url)

            hr = HybridResult(
                id=rid,
                title=title,
                url=url,
                canonical_url=can,
                snippet=item.get("snippet", ""),
                domain=domain,
                published_at=pub_at,
                indexed_at=idx_at,
                published_str=item.get("published_str", "") or item.get("publishedStr", ""),
                indexed_str=item.get("indexed_str", "") or item.get("indexedStr", ""),
                sources=["pendulum"],
                provider_ranks={"pendulum": rank + 1},
                images=item.get("images", []),
                location=item.get("location"),
                distance_km=item.get("distance_km") or item.get("distanceKm"),
                distance_str=item.get("distance_str") or item.get("distanceStr"),
                is_live=item.get("is_live", False) or item.get("isLive", False),
                language=item.get("language", "en"),
                category=item.get("category", "general"),
                content_type=item.get("content_type", "text/html"),
                _raw_text_score=float(item.get("text_score", 0) or item.get("textScore", 0)),
                _raw_semantic_score=float(item.get("semantic_score", 0) or item.get("semanticScore", 0)),
                _raw_geo_score=float(item.get("geo_score", 0) or item.get("geoScore", 0)),
            )

            if can in seen_canonical:
                # Merge: both provided this URL
                existing = seen_canonical[can]
                if "pendulum" not in existing.sources:
                    existing.sources.append("pendulum")
                existing.provider_ranks["pendulum"] = rank + 1
                dedup_count += 1
            else:
                seen_canonical[can] = hr

        # --- Ingest External results ---
        for rank, item in enumerate(external_results):
            url = item.get("url", "")
            if not url:
                continue
            can = self.canonicalize_url(url)
            rid = self.result_id(url)

            title = item.get("title", "")
            domain = item.get("domain") or self._extract_domain(url)

            if can in seen_canonical:
                # Same canonical URL — merge metadata
                existing = seen_canonical[can]
                if "external" not in existing.sources:
                    existing.sources.append("external")
                existing.provider_ranks["external"] = rank + 1
                # Enrich snippet if external has a better one
                if len(item.get("snippet", "")) > len(existing.snippet):
                    existing.snippet = item["snippet"]
                dedup_count += 1
                continue

            # Title dedup
            if self._is_title_duplicate(title, seen_titles):
                dedup_count += 1
                continue
            seen_titles.append(title)

            pub_at = self._parse_dt(item.get("publication_timestamp") or item.get("publishedAt"))
            idx_at = item.get("retrieval_timestamp")
            if isinstance(idx_at, str):
                idx_at = self._parse_dt(idx_at)

            hr = HybridResult(
                id=rid,
                title=title,
                url=url,
                canonical_url=can,
                snippet=item.get("snippet", ""),
                domain=domain,
                published_at=pub_at,
                indexed_at=idx_at if isinstance(idx_at, datetime) else None,
                published_str="",
                indexed_str="",
                sources=["external"],
                provider_ranks={"external": rank + 1},
                is_live=False,
                language=item.get("language", "en"),
                category=item.get("category", "general"),
                content_type="text/html",
                _raw_text_score=float(item.get("score", 0.5)),
                _raw_semantic_score=0.0,
                _raw_geo_score=0.0,
            )
            seen_canonical[can] = hr

        # --- Score & rank ---
        final_list: List[HybridResult] = list(seen_canonical.values())
        hybrid_ranker_stats.record_query(
            len(pendulum_results), len(external_results), dedup_count
        )

        for hr in final_list:
            scores = self.compute_final_score(hr)
            hr.scores = scores
            hr.final_score = scores["final"]
            hr.source_label = self._source_label(hr.sources)
            hr.favicon = f"https://www.google.com/s2/favicons?domain={hr.domain}&sz=32"

        final_list.sort(key=lambda r: r.final_score, reverse=True)
        return final_list[:limit]

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def _extract_domain(url: str) -> str:
        try:
            m = re.search(r"https?://(?:www\.)?([^/\?#]+)", url)
            return m.group(1).lower() if m else ""
        except Exception:
            return ""

    @staticmethod
    def _parse_dt(value: Any) -> Optional[datetime]:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            for fmt in ("%Y-%m-%dT%H:%M:%S+00:00", "%Y-%m-%dT%H:%M:%SZ",
                        "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                try:
                    return datetime.strptime(value[:19], fmt).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
        return None

    def _is_title_duplicate(self, title: str, seen: List[str], threshold: float = 0.80) -> bool:
        """Return True if title is too similar to any title already seen."""
        for existing in seen:
            if self._title_overlap(title, existing) >= threshold:
                return True
        return False


# Singleton
hybrid_ranker = HybridRanker()
