# HS SEARCH — An Independent, Real-Time, AI-Powered Search Engine

**Company:** HS AI Solutions  
**Founder:** Harshan Seliyan  
**Platform Version:** 1.0.0

---

## Overview

**HS SEARCH** is a completely independent search engine engineered from the ground up by **HS AI Solutions**. It operates its own autonomous web crawler, website discovery frontier, data extraction engine, real-time live monitoring system, incremental indexing pipeline, original multi-factor ranking algorithm, and proprietary AI intelligence models (**JULY** and **GRAVITY**).

**HS Search does not proxy or delegate queries to Google, Bing, or any third-party search engine.** It collects, verifies, indexes, and retrieves internet content autonomously.

---

## Key Capabilities

1. **HS MegaCrawler Autonomous Ecosystem (15 Specialized Services):**
   - **HS-WebCrawler**: General public websites, encyclopedias, and educational foundations.
   - **HS-NewsCrawler**: Global journalism, breaking news portals, and press syndicates.
   - **HS-ResearchCrawler**: Academic papers, arXiv preprints, CrossRef DOIs, and scientific repositories.
   - **HS-TechCrawler**: Technology journalism, artificial intelligence, semiconductor architecture, and computing.
   - **HS-CodeCrawler**: Public source-code repositories, SDKs, and package registries (GitHub, PyPI, npm, crates.io).
   - **HS-DocCrawler**: Software manuals, specifications, and developer documentation trees.
   - **HS-GovCrawler**: Open government data portals, legislation, census data, and official reports.
   - **HS-ScienceCrawler**: STEM educational materials, peer-reviewed open science, and educational curricula.
   - **HS-LiveCrawler**: Real-time RSS/Atom streams, breaking news tickers, and market indicators.
   - **HS-ImageCrawler**: Creative commons and public image metadata, dimensions, captions, and licenses.
   - **HS-VideoCrawler**: Video metadata, transcripts, titles, and embed resources.
   - **HS-DiscoveryCrawler**: Graph-level traversal discovering unindexed domains, directory trees, and Common Crawl.
   - **HS-RefreshCrawler**: Conditional HTTP (ETag, Last-Modified, 304 Not Modified) recrawling monitor.
   - **HS-DeepCrawler**: Subtree crawler traversing up to 5 levels deep within permitted crawl boundaries.
   - **HS-API-Crawler**: Structured ingestion collector querying authorized open REST/GraphQL endpoints.
   - **Autonomous Discovery Engine**: 10-channel discovery engine with XML sitemaps, RSS, Common Crawl, IndexNow, and APIs.
   - **Intelligent URL Prioritizer**: Multi-signal scoring algorithm evaluating relevance, quality, domain authority, update frequency, freshness, demand, uniqueness, and crawl cost.
   - **Compressed Object Storage**: SHA-256 content-addressed document store with Level 6 Gzip compression.
   - **Self-Optimization Engine**: Autonomous tuning of worker pools, priorities, and schedules within immutable safety boundaries.
   - **Modal Cloud Distributed Infrastructure**: Separated CPU (crawling/extraction) vs GPU (July AI / embeddings) tiers with persistent volumes.

2. **HS Live Subsystem:**
   - Continuous real-time RSS/Atom feed monitoring with configurable refresh intervals:
     - **Critical feeds:** 1 second
     - **High-priority feeds:** 5 seconds
     - **Regular feeds:** 30 seconds
     - **Adaptive scheduling:** dynamic adjustments based on change frequency
   - Event-driven push ingestion via `/api/live/webhook`.
   - Displays verifiable `last_checked_at` and `last_updated_at` timestamps.
   - Live stream ticker broadcasting newly indexed breaking updates.

3. **Incremental Search Indexing Engine:**
   - Full-text lexical indexing with SQLite FTS5 (Porter Stemmer + Unicode61 tokenizers).
   - Pluggable OpenSearch cluster integration.
   - Dense 256-dimensional semantic vector index with normalized cosine similarity search.
   - Pluggable Qdrant vector database integration.
   - Incremental real-time indexing pipeline with zero index re-build required.

4. **Intelligent Ranking Algorithm:**
   - Original multi-factor scoring formula:
     $$\text{Score} = w_{\text{text}} \cdot \text{BM25} + w_{\text{sem}} \cdot \text{CosineSim} + w_{\text{fresh}} \cdot e^{-\lambda \Delta t} + w_{\text{cred}} \cdot \text{Credibility} + w_{\text{qual}} \cdot \text{Quality}$$
   - **9 Search Modes:**
     1. General Search
     2. Latest Search (freshness-dominant)
     3. News Search
     4. Technical Search (code, docs, GitHub)
     5. Academic Search (arXiv, DOI, scientific papers)
     6. Image Search (visual grid with dimensions and direct preview)
     7. Video Search
     8. Research Search (deep synthesis)
     9. Real-Time Search (HS Live events)
   - Sort by Relevance, Newest, or Oldest.
   - Strictly distinguishes publication date from indexed timestamp.

5. **HS AI Intelligence (JULY & GRAVITY):**
   - **JULY:** Lightweight, sub-500ms search assistant. Provides query intent understanding, query rewriting, direct grounded answers, and strict source citation links `[1]`, `[2]`.
   - **GRAVITY:** Advanced autonomous research agent. Decomposes complex queries into sub-questions, runs parallel multi-source searches, cross-compares evidence, identifies contradictions, and outputs structured research reports with complete audit trails.
   - Zero fabrication rule: Every claim links directly to original indexed sources.

6. **Administrative & Self-Monitoring Dashboard:**
   - Real-time telemetry: Discovered domains, indexed webpages count, crawl queue size, requests/sec, indexing ops/sec, and search latency.
   - Crawler management: Start, pause, inject seed URLs, or execute on-demand crawls.
   - Live feeds manager: Add feeds, configure intervals, and monitor synchronization state.
   - Live streaming system logs.

7. **Cinematic Obsidian & Champagne Gold UI:**
   - Aesthetic: Obsidian Black (`#0B0B0E`) with Champagne Gold (`#D4AF37`) accents.
   - Central search bar with real-time autocomplete suggestions and keyboard shortcuts (`/` to focus).
   - Interactive source citation drawer, image lightbox, and live ticker ribbon.

---

## Architecture

```
hs-search/
├── backend/
│   ├── app/
│   │   ├── config.py                 # Application settings & environment
│   │   ├── database/
│   │   │   ├── models.py             # Pydantic data schemas
│   │   │   └── connection.py         # Async SQLite FTS5 & WAL persistence
│   │   ├── crawler/
│   │   │   ├── robots.py             # Robots.txt parser & compliance
│   │   │   ├── extractor.py          # HTML parser, SimHash, metadata extraction
│   │   │   ├── sitemap.py            # XML sitemap parser
│   │   │   ├── frontier.py           # Politeness queue & rate limiting
│   │   │   └── engine.py             # Concurrent crawler engine
│   │   ├── live/
│   │   │   └── rss_monitor.py        # HS Live continuous feed monitor
│   │   ├── indexer/
│   │   │   ├── vector_index.py       # 256-D semantic vector engine
│   │   │   ├── opensearch_adapter.py # OpenSearch cluster connector
│   │   │   ├── qdrant_adapter.py     # Qdrant vector DB connector
│   │   │   └── pipeline.py           # Incremental indexing pipeline
│   │   ├── ranking/
│   │   │   └── scorer.py             # Multi-factor ranking algorithm & modes
│   │   ├── ai/
│   │   │   ├── july.py               # July fast AI assistant
│   │   │   ├── gravity.py            # Gravity autonomous research agent
│   │   │   └── router.py             # Intelligent AI router
│   │   ├── api/
│   │   │   ├── search.py             # Search & suggestions endpoints
│   │   │   ├── crawler_admin.py      # Crawler controls & seed injection
│   │   │   ├── live.py               # HS Live feeds & webhook API
│   │   │   ├── monitor.py            # Metrics & logs API
│   │   │   └── websocket.py          # WebSocket live event stream
│   │   └── main.py                   # FastAPI lifespan application
│   ├── tests/                        # Automated unit & integration tests
│   ├── requirements.txt
│   └── run_backend.py
├── frontend/
│   ├── src/
│   │   ├── components/               # Header, SearchBar, ModeSelector, ResultCard,
│   │   │                             # JulyAnswerCard, GravityResearchView, ImageGrid,
│   │   │                             # LiveFeedTicker, AdminDashboard
│   │   ├── services/api.ts           # Typed API client
│   │   ├── types/index.ts            # TypeScript interfaces
│   │   ├── App.tsx                   # Main React Application
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
├── .env.example
├── ARCHITECTURE.md
└── API_DOCUMENTATION.md
```

---

## Quickstart Guide

### 1. Prerequisites
- Python 3.10+ (tested with Python 3.11, 3.14)
- Node.js 18+ and npm

### 2. Backend Setup
```bash
# From repository root
cd backend
python -m pip install -r requirements.txt

# Start backend server
python run_backend.py
```
The backend starts at `http://localhost:8000`. Interactive OpenAPI documentation is accessible at `http://localhost:8000/docs`.

### 3. Frontend Setup
```bash
# In a new terminal window
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your web browser.

---

## Docker Deployment

To launch the entire distributed stack including OpenSearch and Qdrant:
```bash
cd docker
docker compose up -d --build
```
- Frontend UI: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- OpenSearch: `http://localhost:9200`
- Qdrant: `http://localhost:6333`

---

## Running Automated Tests

Run the full automated test suite covering the crawler, parser, indexer, ranking algorithm, July/Gravity AI agents, and FastAPI endpoints:
```bash
# From repository root
python -m pytest backend/tests
```
All 17 tests run in sub-second execution.

---

## License & Credits

**HS SEARCH** is engineered for **HS AI Solutions**.  
**Founder:** Harshan Seliyan.  
All rights reserved.
