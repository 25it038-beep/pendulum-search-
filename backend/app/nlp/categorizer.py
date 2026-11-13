"""
HS SEARCH - Universal Content & Domain Categorization Engine
Company: HS AI Solutions | Founder: Harshan Seliyan

Classifies web resources into universal categories and dynamically discovers
emergent categories based on content semantics, headings, structured data, and entities.
"""

import re
from typing import Dict, Any, List, Optional, Tuple
from collections import Counter

# Core Universal Categories
UNIVERSAL_CATEGORIES = {
    "general_web": {
        "label": "General Web",
        "keywords": ["about us", "home", "company", "services", "contact", "blog", "community", "forum", "wiki", "discussion", "personal", "knowledge"]
    },
    "education": {
        "label": "Education",
        "keywords": ["university", "school", "course", "curriculum", "syllabus", "lecture", "student", "faculty", "academy", "learning", "degree", "tutorial", "admission", "campus", "textbook"]
    },
    "science_research": {
        "label": "Science & Research",
        "keywords": ["research", "doi", "paper", "abstract", "journal", "experiment", "astronomy", "physics", "chemistry", "biology", "mathematics", "engineering", "laboratory", "scientific", "study", "dataset"]
    },
    "healthcare": {
        "label": "Healthcare",
        "keywords": ["health", "hospital", "clinic", "medical", "disease", "patient", "treatment", "doctor", "pharmacy", "medicine", "symptoms", "therapy", "clinical", "vaccine", "diagnosis", "wellness"]
    },
    "commerce": {
        "label": "Commerce",
        "keywords": ["shop", "store", "buy", "cart", "price", "checkout", "product", "retail", "wholesale", "catalog", "order", "shipping", "discount", "sale", "ecommerce", "manufacturer"]
    },
    "news_information": {
        "label": "News & Information",
        "keywords": ["news", "breaking", "headline", "reported", "journalism", "press", "announcement", "gazette", "times", "tribune", "chronicle", "dispatch", "reporter", "bulletin", "investigation"]
    },
    "entertainment_culture": {
        "label": "Entertainment & Culture",
        "keywords": ["movie", "film", "music", "album", "song", "tv", "television", "gaming", "game", "book", "art", "theatre", "festival", "culture", "celebrity", "concert", "museum", "entertainment"]
    },
    "sports": {
        "label": "Sports",
        "keywords": ["sport", "football", "cricket", "basketball", "soccer", "tennis", "olympics", "tournament", "match", "league", "score", "player", "athlete", "championship", "team", "coach"]
    },
    "travel_geography": {
        "label": "Travel & Geography",
        "keywords": ["travel", "hotel", "flight", "tourism", "destination", "resort", "airline", "guide", "vacation", "trip", "map", "geography", "transit", "passport", "itinerary", "attractions"]
    },
    "government_public": {
        "label": "Government & Public Services",
        "keywords": ["government", "ministry", "department", "policy", "law", "legal", "statute", "parliament", "congress", "senate", "official", "gazette", "public notice", "regulations", "civic", "federal"]
    },
    "social_community": {
        "label": "Social & Community",
        "keywords": ["profile", "member", "post", "thread", "discussion", "feed", "creator", "follower", "group", "meetup", "subforum", "guild", "society", "network", "user"]
    },
    "multimedia": {
        "label": "Multimedia",
        "keywords": ["video", "audio", "podcast", "transcript", "stream", "broadcast", "gallery", "photo", "recording", "episode", "clip", "media", "embed", "webcast"]
    }
}

class UniversalCategorizer:
    """
    Automatic content categorizer and emergent category discoverer.
    """

    def classify(
        self,
        title: str,
        content: str,
        headings: Optional[List[str]] = None,
        url: str = "",
        structured_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Classifies a web document into universal categories and detects emergent categories.
        """
        text_corpus = f"{title} {' '.join(headings or [])} {content[:3000]} {url}".lower()
        words = re.findall(r"\b[a-zA-Z\u00C0-\u00FF]{3,}\b", text_corpus)
        word_set = set(words)

        scores: Dict[str, float] = {}

        # 1. Structured Data Schema hints
        if structured_type:
            st = structured_type.lower()
            if any(k in st for k in ["scholarlyarticle", "medicalscholarlyarticle", "dataset"]):
                scores["science_research"] = scores.get("science_research", 0) + 4.0
            elif any(k in st for k in ["medical", "hospital", "drug"]):
                scores["healthcare"] = scores.get("healthcare", 0) + 4.0
            elif any(k in st for k in ["product", "offer", "store", "itemavailability"]):
                scores["commerce"] = scores.get("commerce", 0) + 4.0
            elif any(k in st for k in ["newsarticle", "report"]):
                scores["news_information"] = scores.get("news_information", 0) + 4.0
            elif any(k in st for k in ["course", "educationalorganization", "school"]):
                scores["education"] = scores.get("education", 0) + 4.0
            elif any(k in st for k in ["movie", "musicalbum", "videoobject", "game"]):
                scores["entertainment_culture"] = scores.get("entertainment_culture", 0) + 4.0
            elif any(k in st for k in ["sportsteam", "sportsevent"]):
                scores["sports"] = scores.get("sports", 0) + 4.0
            elif any(k in st for k in ["touristattraction", "hotel", "lodgingbusiness"]):
                scores["travel_geography"] = scores.get("travel_geography", 0) + 4.0
            elif any(k in st for k in ["governmentorganization", "legislation"]):
                scores["government_public"] = scores.get("government_public", 0) + 4.0

        # 2. TLD and URL structure hints
        if url:
            u_lower = url.lower()
            if ".edu" in u_lower or "/courses/" in u_lower or "/university/" in u_lower:
                scores["education"] = scores.get("education", 0) + 3.0
            if ".gov" in u_lower or ".mil" in u_lower or "/policy/" in u_lower:
                scores["government_public"] = scores.get("government_public", 0) + 3.5
            if "/product/" in u_lower or "/shop/" in u_lower or "/cart/" in u_lower:
                scores["commerce"] = scores.get("commerce", 0) + 3.0
            if "/sports/" in u_lower or "/league/" in u_lower:
                scores["sports"] = scores.get("sports", 0) + 3.0

        # 3. Keyword Density Matching
        for cat_key, cat_data in UNIVERSAL_CATEGORIES.items():
            base_score = scores.get(cat_key, 0.0)
            matches = sum(1 for kw in cat_data["keywords"] if kw in text_corpus)
            scores[cat_key] = base_score + matches

        best_category_key = max(scores, key=scores.get)
        top_score = scores[best_category_key]

        # 4. Emergent Category Discovery when standard categories have low confidence
        emergent_category = None
        if top_score <= 2:
            # Extract common informative bigrams/noun phrases as emergent category
            stopwords = {"the", "and", "for", "with", "from", "that", "this", "are", "was", "will", "have", "about"}
            meaningful_words = [w for w in words if w not in stopwords and len(w) > 4]
            word_counts = Counter(meaningful_words)
            top_words = [w for w, _ in word_counts.most_common(2)]
            if top_words:
                emergent_category = " ".join(top_words).title()
            best_category_key = "general_web"

        primary_category_label = UNIVERSAL_CATEGORIES[best_category_key]["label"]

        confidence = min(0.99, max(0.40, top_score / 12.0))

        return {
            "category_key": best_category_key,
            "category_label": primary_category_label,
            "confidence": round(confidence, 2),
            "emergent_category": emergent_category,
            "scores": {k: round(v, 2) for k, v in scores.items() if v > 0}
        }

    def classify_document(self, *args, **kwargs):
        return self.classify(*args, **kwargs)

    def categorize_document(self, *args, **kwargs):
        return self.classify(*args, **kwargs)

universal_categorizer = UniversalCategorizer()
