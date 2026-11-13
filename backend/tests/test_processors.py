"""
Document Processors Test Suite for HS SEARCH
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import pytest
from app.crawler.processors.html_processor import html_processor
from app.crawler.processors.api_dataset_processor import api_dataset_processor
from app.crawler.processors.multimedia_processor import multimedia_processor

def test_html_processor_extraction():
    html_sample = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <title>HS Search - Universal Web Search Engine</title>
        <meta name="description" content="Discover, crawl and index the global web.">
        <meta name="author" content="Harshan Seliyan">
    </head>
    <body>
        <h1>Universal Web Coverage</h1>
        <p>HS Search crawls and indexes information across all categories and countries.</p>
        <a href="https://example.com/docs">Documentation</a>
        <img src="https://example.com/logo.png" alt="HS Search Logo" />
    </body>
    </html>
    """
    res = html_processor.process(html_sample, "https://hsaisolutions.com/about")
    assert res["title"] == "HS Search - Universal Web Search Engine"
    assert "Discover, crawl and index" in res["description"]
    assert "Harshan Seliyan" in (res.get("author") or "")
    assert len(res["headings"]) >= 1
    assert "https://example.com/docs" in res["outlinks"]
    assert res["language"] == "en"

def test_api_dataset_processor():
    json_sample = """
    {
        "name": "Global Open Climate Dataset",
        "version": "2.4",
        "description": "Public scientific measurements of atmospheric carbon and temperatures.",
        "records": [
            {"year": 2024, "anomaly": 1.25},
            {"year": 2025, "anomaly": 1.28}
        ]
    }
    """
    res = api_dataset_processor.process(json_sample, "https://data.gov/climate.json")
    assert "Global Open Climate Dataset" in res["title"]
    assert "climate" in res["content_text"].lower() or "records" in res["content_text"].lower()
    assert res["content_type"] == "application/json"
    assert res["category"] in ("science_research", "general")

def test_multimedia_processor():
    html_with_media = """
    <html>
    <head><title>Space Exploration Media Gallery</title></head>
    <body>
        <img src="https://nasa.gov/mars.jpg" alt="Mars Rover panorama" />
        <video src="https://nasa.gov/launch.mp4"></video>
        <audio src="https://nasa.gov/audio/countdown.mp3"></audio>
    </body>
    </html>
    """
    res = multimedia_processor.process(html_with_media, "https://nasa.gov/gallery")
    assert res["category"] == "multimedia"
    assert len(res["images"]) >= 1
    assert len(res["videos"]) >= 1
    assert len(res["audios"]) >= 1
