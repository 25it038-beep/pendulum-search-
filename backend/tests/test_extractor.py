"""
Unit Tests for Data Extraction & HTML Parsing Engine
"""

import pytest
from app.crawler.extractor import extract_content, compute_simhash, normalize_url

SAMPLE_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Quantum Computing Breakthrough Announced</title>
    <meta name="description" content="Researchers have achieved high-fidelity quantum state transmission across optical networks.">
    <meta property="article:published_time" content="2026-11-10T14:30:00Z">
    <link rel="canonical" href="https://example.com/quantum-breakthrough">
</head>
<body>
    <header><nav><a href="/home">Home</a></nav></header>
    <main>
        <h1>Quantum Computing Breakthrough Announced</h1>
        <p>In a major milestone for quantum communications, laboratory scientists successfully deployed a 100-qubit processor.</p>
        <img src="https://example.com/images/quantum_chip.png" alt="100-qubit quantum chip" width="800" height="600" />
        <a href="https://example.com/research/paper?utm_source=twitter">Read Full Paper</a>
        <a href="/related-news">Related Articles</a>
    </main>
    <footer>Copyright 2026</footer>
</body>
</html>
"""

def test_extract_content():
    extracted = extract_content(SAMPLE_HTML, "https://example.com/quantum-breakthrough")
    assert extracted["title"] == "Quantum Computing Breakthrough Announced"
    assert "quantum state transmission" in extracted["snippet"]
    assert "100-qubit processor" in extracted["content_text"]
    assert extracted["metadata"].language == "en"
    assert extracted["published_at"] is not None
    assert len(extracted["images"]) == 1
    assert extracted["images"][0].alt == "100-qubit quantum chip"
    assert len(extracted["outlinks"]) >= 2
    # Check that tracking parameter utm_source was stripped
    assert "utm_source" not in extracted["outlinks"][0]

def test_simhash():
    text1 = "Quantum computing algorithms can accelerate molecular discovery."
    text2 = "Quantum computing algorithms can accelerate molecular discovery significantly."
    text3 = "A delicious recipe for homemade Italian pasta with tomato sauce."
    
    h1 = compute_simhash(text1)
    h2 = compute_simhash(text2)
    h3 = compute_simhash(text3)

    assert len(h1) == 16
    assert h1 != h3

def test_normalize_url():
    base = "https://example.com/articles/index.html"
    rel = "../news/breaking?utm_source=newsletter&id=12"
    norm = normalize_url(rel, base)
    assert norm == "https://example.com/news/breaking?id=12"
