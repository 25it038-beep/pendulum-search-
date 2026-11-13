"""
HS MegaCrawler - Universal Resource-Based Crawler Fleet (13 Worker Types)
Company: HS AI Solutions | Founder: Harshan Seliyan

Universal distributed crawlers specialized by resource and interaction type,
providing complete global web coverage across all industries, categories, and languages.
"""

from app.megacrawler.models import CrawlerType, CrawlerServiceConfig
from app.megacrawler.crawlers.base import BaseSpecializedCrawler

# ==============================================================================
# 13 UNIVERSAL RESOURCE-BASED SPECIALIZED CRAWLERS
# ==============================================================================

# 1. HTMLCrawler: Standard HTML documents, rich DOM, headings, structured metadata
class HTMLCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.HTML,
            name="HTMLCrawler",
            description="Universal HTML crawler extracting DOM structure, headings, JSON-LD, and multi-category content.",
            target_domains=["en.wikipedia.org", "w3.org", "archive.org", "wikinews.org", "worldbank.org", "who.int"],
            refresh_interval_sec=120,
            concurrency_limit=6,
            max_depth=3,
            priority=5,
            user_agent_suffix="HTML"
        ))

# 2. JavaScriptCrawler: Single-page applications, dynamic state, hydration payloads
class JavaScriptCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.JAVASCRIPT,
            name="JavaScriptCrawler",
            description="SPA & dynamic rendering crawler extracting __NEXT_DATA__, __NUXT__, and client hydration state.",
            target_domains=["react.dev", "nextjs.org", "vuejs.org", "angular.io", "vercel.com"],
            refresh_interval_sec=180,
            concurrency_limit=4,
            max_depth=2,
            priority=5,
            user_agent_suffix="JS-Renderer"
        ))

# 3. PDFCrawler: Educational PDFs, academic papers, official government reports, whitepapers
class PDFCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.PDF,
            name="PDFCrawler",
            description="Binary PDF parser extracting text, page count, document author, creation date, and language.",
            target_domains=["arxiv.org", "biorxiv.org", "nih.gov", "census.gov", "unesco.org"],
            refresh_interval_sec=300,
            concurrency_limit=4,
            max_depth=2,
            priority=4,
            user_agent_suffix="PDF"
        ))

# 4. DocumentCrawler: Markdown, manuals, technical docs, office documents, specifications
class DocumentCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.DOCUMENT,
            name="DocumentCrawler",
            description="Structured documentation harvester for guides, manuals, RFCs, and markdown documentation.",
            target_domains=["docs.python.org", "developer.mozilla.org", "ietf.org", "man7.org", "readthedocs.io"],
            refresh_interval_sec=240,
            concurrency_limit=4,
            max_depth=4,
            priority=4,
            user_agent_suffix="Doc"
        ))

# 5. ImageMetadataCrawler: Public image discovery, alt text, dimensions, licenses, captions
class ImageMetadataCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.IMAGE_METADATA,
            name="ImageMetadataCrawler",
            description="Visual content scanner indexing image dimensions, OpenGraph images, alt-text, and licenses.",
            target_domains=["commons.wikimedia.org", "unsplash.com", "pexels.com", "loc.gov"],
            refresh_interval_sec=180,
            concurrency_limit=4,
            max_depth=2,
            priority=6,
            user_agent_suffix="ImageMeta"
        ))

# 6. VideoMetadataCrawler: Public video discovery, embeds, durations, captions, transcripts
class VideoMetadataCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.VIDEO_METADATA,
            name="VideoMetadataCrawler",
            description="Video metadata scanner indexing video titles, transcripts, durations, and embed sources.",
            target_domains=["youtube.com", "vimeo.com", "ted.com", "c-span.org"],
            refresh_interval_sec=180,
            concurrency_limit=3,
            max_depth=2,
            priority=6,
            user_agent_suffix="VideoMeta"
        ))

# 7. AudioMetadataCrawler: Podcasts, audio streams, RSS enclosures, audio transcripts
class AudioMetadataCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.AUDIO_METADATA,
            name="AudioMetadataCrawler",
            description="Audio metadata scanner indexing podcast episodes, RSS enclosures, and transcripts.",
            target_domains=["podcasts.apple.com", "npr.org", "bbc.co.uk/sounds"],
            refresh_interval_sec=240,
            concurrency_limit=3,
            max_depth=2,
            priority=6,
            user_agent_suffix="AudioMeta"
        ))

# 8. APIDataCrawler: Public REST, JSON, OpenAPI, GraphQL endpoints, schemas, attribution
class APIDataCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.API_DATA,
            name="APIDataCrawler",
            description="API inspector indexing public REST/JSON data schemas, update frequencies, and metadata.",
            target_domains=["api.openalex.org", "api.crossref.org", "api.github.com", "pokeapi.co"],
            refresh_interval_sec=120,
            concurrency_limit=4,
            max_depth=2,
            priority=4,
            user_agent_suffix="API"
        ))

# 9. RSSCrawler: Multi-category RSS and Atom feed aggregator (news, sports, commerce, community)
class RSSCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.RSS,
            name="RSSCrawler",
            description="High-frequency syndication monitor indexing global RSS/Atom feeds across all topics.",
            target_domains=["feeds.bbci.co.uk", "rss.cnn.com", "news.ycombinator.com", "techcrunch.com"],
            refresh_interval_sec=15,
            concurrency_limit=6,
            max_depth=1,
            priority=2,
            user_agent_suffix="RSS"
        ))

# 10. SitemapCrawler: XML sitemaps, sitemap indexes, change frequency, recursive URL queuing
class SitemapCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.SITEMAP,
            name="SitemapCrawler",
            description="XML sitemap parser discovering sitemap indexes, <loc>, <lastmod>, and priority entries.",
            target_domains=["wikipedia.org", "nytimes.com", "bbc.com", "github.com"],
            refresh_interval_sec=120,
            concurrency_limit=5,
            max_depth=3,
            priority=3,
            user_agent_suffix="Sitemap"
        ))

# 11. DatasetCrawler: Open government data, CKAN catalogs, Zenodo, HuggingFace, Kaggle
class DatasetCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.DATASET,
            name="DatasetCrawler",
            description="Open data repository scanner indexing CSV, JSON, and Parquet data schemas and citations.",
            target_domains=["data.gov", "data.gov.uk", "zenodo.org", "huggingface.co/datasets"],
            refresh_interval_sec=300,
            concurrency_limit=3,
            max_depth=2,
            priority=4,
            user_agent_suffix="Dataset"
        ))

# 12. DeepDiscoveryCrawler: External hyperlinks, web directories, DMOZ/Curlie, Common Crawl
class DeepDiscoveryCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.DEEP_DISCOVERY,
            name="DeepDiscoveryCrawler",
            description="Deep graph traverser discovering unindexed domains, external links, and directory hierarchies.",
            target_domains=["commoncrawl.org", "curlie.org", "dmoz-odp.org", "alexa.com"],
            refresh_interval_sec=60,
            concurrency_limit=6,
            max_depth=5,
            priority=4,
            user_agent_suffix="DeepDiscovery"
        ))

# 13. RefreshCrawler: Conditional HTTP GET (ETag/If-Modified-Since), content hashing
class RefreshCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.REFRESH,
            name="RefreshCrawler",
            description="Conditional GET monitor issuing ETag and If-Modified-Since validation checks.",
            target_domains=[],
            refresh_interval_sec=60,
            concurrency_limit=6,
            max_depth=1,
            priority=3,
            user_agent_suffix="Refresh"
        ))

# ==============================================================================
# LEGACY ALIASES (100% Backward-Compatibility with Existing Code & Tests)
# ==============================================================================

class WebCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.WEB,
            name="HS-WebCrawler",
            description="General public web crawl engine discovering and indexing diverse websites.",
            target_domains=["wikipedia.org", "w3.org", "archive.org", "wikinews.org"],
            refresh_interval_sec=120,
            concurrency_limit=6,
            max_depth=3,
            priority=5,
            user_agent_suffix="Web"
        ))

class NewsCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.NEWS,
            name="HS-NewsCrawler",
            description="High-frequency crawler indexing global journalism, breaking news, and feeds.",
            target_domains=["bbc.co.uk", "reuters.com", "apnews.com", "news.ycombinator.com"],
            refresh_interval_sec=15,
            concurrency_limit=6,
            max_depth=2,
            priority=2,
            user_agent_suffix="News"
        ))

class TechCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.TECH,
            name="HS-TechCrawler",
            description="Deep crawler covering AI advancements, semiconductor engineering, and computing.",
            target_domains=["techcrunch.com", "arstechnica.com", "theverge.com", "wired.com", "anandtech.com"],
            refresh_interval_sec=30,
            concurrency_limit=6,
            max_depth=3,
            priority=3,
            user_agent_suffix="Tech"
        ))

class ResearchCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.RESEARCH,
            name="HS-ResearchCrawler",
            description="Academic harvester for arXiv preprints, open-access papers, and scientific DOIs.",
            target_domains=["arxiv.org", "openalex.org", "crossref.org", "biorxiv.org", "nature.com"],
            refresh_interval_sec=60,
            concurrency_limit=4,
            max_depth=2,
            priority=3,
            user_agent_suffix="Research"
        ))

class CodeCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.CODE,
            name="HS-CodeCrawler",
            description="Indexer for open-source code repositories, SDKs, APIs, and developer packages.",
            target_domains=["github.com", "gitlab.com", "pypi.org", "npmjs.com", "crates.io"],
            refresh_interval_sec=120,
            concurrency_limit=4,
            max_depth=3,
            priority=4,
            user_agent_suffix="Code"
        ))

class DocCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.DOC,
            name="HS-DocCrawler",
            description="Structured crawler for software documentation, manuals, guides, and specifications.",
            target_domains=["docs.python.org", "developer.mozilla.org", "react.dev", "fastapi.tiangolo.com"],
            refresh_interval_sec=300,
            concurrency_limit=4,
            max_depth=4,
            priority=4,
            user_agent_suffix="Docs"
        ))

class ImageCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.IMAGE,
            name="HS-ImageCrawler",
            description="Visual content scanner indexing image alt-text, dimensions, captions, and licenses.",
            target_domains=["commons.wikimedia.org", "unsplash.com", "pexels.com"],
            refresh_interval_sec=180,
            concurrency_limit=4,
            max_depth=2,
            priority=6,
            user_agent_suffix="Image"
        ))

class VideoCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.VIDEO,
            name="HS-VideoCrawler",
            description="Multimedia metadata scanner indexing video titles, transcripts, and embed sources.",
            target_domains=["youtube.com", "vimeo.com", "ted.com"],
            refresh_interval_sec=180,
            concurrency_limit=3,
            max_depth=2,
            priority=6,
            user_agent_suffix="Video"
        ))

class GovCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.GOV,
            name="HS-GovCrawler",
            description="Public sector crawler indexing open government data, laws, and official reports.",
            target_domains=["data.gov", "gov.uk", "europa.eu", "who.int", "nasa.gov"],
            refresh_interval_sec=360,
            concurrency_limit=3,
            max_depth=3,
            priority=4,
            user_agent_suffix="Gov"
        ))

class LiveCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.LIVE,
            name="HS-LiveCrawler",
            description="Sub-minute real-time sentinel for rapidly updating news tickers and feeds.",
            target_domains=["news.ycombinator.com", "feeds.bbci.co.uk", "rss.cnn.com"],
            refresh_interval_sec=5,
            concurrency_limit=6,
            max_depth=1,
            priority=1,
            user_agent_suffix="Live"
        ))

class DiscoveryCrawler(BaseSpecializedCrawler):
    def __init__(self):
        super().__init__(CrawlerServiceConfig(
            crawler_type=CrawlerType.DISCOVERY,
            name="HS-DiscoveryCrawler",
            description="Deep graph traverser discovering unindexed domains, sitemaps, and IndexNow entries.",
            target_domains=["commoncrawl.org", "dmoz-odp.org", "curlie.org"],
            refresh_interval_sec=60,
            concurrency_limit=5,
            max_depth=4,
            priority=5,
            user_agent_suffix="Discovery"
        ))

# Compatibility Aliases for Extended Ecosystem
ScienceCrawler = ResearchCrawler
DeepCrawler = DeepDiscoveryCrawler
ApiCrawler = APIDataCrawler



# Aliases for backward compatibility and test imports
ScienceCrawler = ResearchCrawler
DeepCrawler = DeepDiscoveryCrawler
ApiCrawler = APIDataCrawler
