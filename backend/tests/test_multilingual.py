"""
Multilingual & Cross-Lingual Search Test Suite for HS SEARCH
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import pytest
import numpy as np
from app.nlp.language import multilingual_engine
from app.nlp.categorizer import universal_categorizer
from app.indexer.vector_index import vector_index

def test_language_detection():
    # Tamil
    res_ta = multilingual_engine.detect_language("செயற்கை நுண்ணறிவு புதிய தொழில்நுட்பங்களை உருவாக்குகிறது.")
    assert res_ta["code"] == "ta"
    assert res_ta["name"] == "Tamil"
    assert res_ta["script"] == "Tamil"

    # Hindi
    res_hi = multilingual_engine.detect_language("कृत्रिम बुद्धिमत्ता आधुनिक दुनिया को बदल रही है।")
    assert res_hi["code"] == "hi"
    assert res_hi["script"] == "Devanagari"

    # Telugu
    res_te = multilingual_engine.detect_language("కృత్రిమ మేధస్సు మరియు కంప్యూటర్ సైన్స్ పరిశోధన.")
    assert res_te["code"] == "te"

    # Malayalam
    res_ml = multilingual_engine.detect_language("നിർമ്മിത ബുദ്ധി ആധുനിക ലോകത്ത് വലിയ മാറ്റങ്ങൾ വരുത്തുന്നു.")
    assert res_ml["code"] == "ml"

    # Arabic
    res_ar = multilingual_engine.detect_language("الذكاء الاصطناعي يحدث ثورة في عالم التكنولوجيا.")
    assert res_ar["code"] == "ar"
    assert res_ar["script"] == "Arabic"

    # French
    res_fr = multilingual_engine.detect_language("L'intelligence artificielle transforme l'avenir de l'informatique moderne avec le cloud.")
    assert res_fr["code"] == "fr"

    # German
    res_de = multilingual_engine.detect_language("Künstliche Intelligenz verändert die Industrie und Gesellschaft weltweit.")
    assert res_de["code"] == "de"

    # Japanese
    res_ja = multilingual_engine.detect_language("人工知能と機械学習は急速に進化しています。")
    assert res_ja["code"] == "ja"

    # English
    res_en = multilingual_engine.detect_language("Artificial intelligence is advancing modern computer science research.")
    assert res_en["code"] == "en"

def test_cross_lingual_concept_bridge():
    # Tamil query expansion contains English term
    expansions = multilingual_engine.expand_cross_lingual_query("செயற்கை நுண்ணறிவு மருத்துவத்தில்")
    assert len(expansions) > 0
    concepts = [e["concept"] for e in expansions]
    assert "artificial intelligence" in concepts or "medicine" in concepts

def test_cross_lingual_vector_similarity():
    # Verify vector similarity between Tamil query and English document
    tamil_vec = vector_index.encoder.encode("செயற்கை நுண்ணறிவு")
    english_vec = vector_index.encoder.encode("Artificial intelligence and machine learning technology")

    # Cosine similarity between normalized vectors is dot product
    sim = float(np.dot(tamil_vec, english_vec))
    # In 256-D space, cross-lingual anchor boost achieves >0.30
    assert sim >= 0.30, f"Cross-lingual similarity {sim} should be >= 0.30"

def test_universal_categorization():
    # Healthcare
    cat_health = universal_categorizer.classify(
        title="Novel clinical trial for cancer immunotherapy",
        content="Doctors and patients in the medical hospital evaluated the clinical drug treatment for immunology."
    )
    assert cat_health["category_key"] == "healthcare"

    # Education
    cat_edu = universal_categorizer.classify(
        title="University curriculum and syllabus",
        content="The academic faculty, students and school teachers published syllabus assignments for university semester exams."
    )
    assert cat_edu["category_key"] == "education"

    # Commerce
    cat_comm = universal_categorizer.classify(
        title="Online shopping checkout",
        content="Add to cart, review retail product discount coupon and checkout with credit card payment warranty shipping."
    )
    assert cat_comm["category_key"] == "commerce"

    # Sports
    cat_sports = universal_categorizer.classify(
        title="World Cup Football Championship",
        content="The tournament match score was 3-2 after striker scored goals in the league playoff final."
    )
    assert cat_sports["category_key"] == "sports"
