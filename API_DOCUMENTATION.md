# HS SEARCH — REST & WebSocket API Documentation

**Company:** HS AI Solutions  
**Founder:** Harshan Seliyan  
**Base URL:** `http://localhost:8000` (or configured host/port)

---

## 1. Search Endpoints

### 1.1 Perform Search
- **Endpoint:** `GET /api/search`
- **Description:** Hybrid retrieval combining BM25 lexical search, dense semantic vector retrieval, and HS AI intelligence.
- **Parameters:**
  - `q` (string, required): The query string.
  - `mode` (string, optional, default: `"general"`): One of `general`, `latest`, `news`, `tech`, `academic`, `image`, `video`, `research`, `realtime`.
  - `sort` (string, optional, default: `"relevance"`): One of `relevance`, `newest`, `oldest`.
  - `page` (integer, optional, default: `1`): Page number.
  - `limit` (integer, optional, default: `15`, max: `50`): Results per page.
  - `ai_mode` (string, optional, default: `"auto"`): One of `auto`, `july`, `gravity`, `none`.
- **Response:**
```json
{
  "engine": "HS SEARCH",
  "company": "HS AI Solutions",
  "founder": "Harshan Seliyan",
  "query": "artificial intelligence",
  "mode": "general",
  "sort": "relevance",
  "page": 1,
  "total_results": 24,
  "execution_time_ms": 14.8,
  "ai_intelligence": {
    "model": "JULY (Fast Assistant)",
    "summary": "Artificial intelligence systems have advanced significantly [1]...",
    "key_takeaways": ["Neural networks enable complex pattern recognition [1]"],
    "citations": [
      {
        "index": 1,
        "title": "Artificial Intelligence Overview",
        "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
        "domain": "en.wikipedia.org",
        "published_str": "Nov 10, 2026",
        "indexed_str": "Indexed 15m ago"
      }
    ]
  },
  "results": [
    {
      "id": 1,
      "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
      "domain": "en.wikipedia.org",
      "title": "Artificial intelligence - Wikipedia",
      "snippet": "Artificial intelligence (AI) is intelligence demonstrated by machines...",
      "published_at": "2026-11-10T00:00:00",
      "indexed_at": "2026-11-12T22:15:00",
      "published_str": "Nov 10, 2026",
      "indexed_str": "Indexed 15m ago",
      "score": 0.884,
      "text_score": 0.92,
      "semantic_score": 0.85,
      "freshness_score": 0.78,
      "credibility_score": 0.90,
      "category": "general",
      "images": [],
      "videos": [],
      "is_live": false,
      "source_type": "crawler"
    }
  ]
}
```

### 1.2 Autocomplete Suggestions
- **Endpoint:** `GET /api/suggestions?q={prefix}`
- **Response:**
```json
{
  "suggestions": [
    "artificial intelligence breakthroughs",
    "artificial neural networks"
  ]
}
```

### 1.3 Autonomous Deep Research (Gravity)
- **Endpoint:** `GET /api/research?q={complex_question}`
- **Description:** Invokes GRAVITY multi-step research agent to decompose queries, run cross-source evidence comparison, check contradictions, and generate a citation-backed report.

---

## 2. Crawler Administration Endpoints

### 2.1 Crawler Status
- **Endpoint:** `GET /api/crawler/status`
- **Response:**
```json
{
  "is_running": true,
  "stats": {
    "requests_total": 42,
    "requests_success": 39,
    "requests_failed": 3,
    "links_discovered": 184
  },
  "queue_size": 142,
  "indexed_webpages": 39,
  "total_domains": 18
}
```

### 2.2 Seed Crawler Frontier
- **Endpoint:** `POST /api/crawler/seed`
- **Body:**
```json
{
  "urls": [
    "https://news.ycombinator.com/",
    "https://en.wikipedia.org/wiki/Quantum_computing"
  ],
  "priority": 1,
  "depth": 0
}
```

### 2.3 On-Demand Immediate Crawl
- **Endpoint:** `POST /api/crawler/crawl-now`
- **Body:**
```json
{
  "url": "https://example.com/breaking-story"
}
```

### 2.4 Start / Stop Crawler Loop
- `POST /api/crawler/start`
- `POST /api/crawler/stop`

---

## 3. HS Live Subsystem Endpoints

### 3.1 List Feeds
- **Endpoint:** `GET /api/live/feeds`
- **Response:** Returns list of active feeds with `interval_sec`, `priority_level`, `last_checked_at`, `last_updated_at`, and `items_indexed`.

### 3.2 Add Live Feed
- **Endpoint:** `POST /api/live/feeds/add`
- **Body:**
```json
{
  "name": "TechCrunch Headlines",
  "feed_url": "https://techcrunch.com/feed/",
  "feed_type": "rss",
  "category": "tech",
  "interval_sec": 30,
  "priority_level": "regular"
}
```

### 3.3 Live Ingestion Webhook
- **Endpoint:** `POST /api/live/webhook`
- **Body:**
```json
{
  "title": "Breaking Discovery Announced",
  "url": "https://news.example.com/breaking-1",
  "content": "Scientists confirm major experimental validation...",
  "category": "news"
}
```

### 3.4 Live Stream Ticker
- **Endpoint:** `GET /api/live/stream`

---

## 4. System Monitoring & Telemetry

### 4.1 System Metrics
- **Endpoint:** `GET /api/monitor/metrics`
- **Returns:**
  - `total_discovered_domains`
  - `total_discovered_urls`
  - `indexed_webpages`
  - `modified_webpages`
  - `queue_size`
  - `average_search_response_time_ms`
  - `crawling_req_per_sec`
  - `indexing_ops_per_sec`

### 4.2 Crawler Activity Logs
- **Endpoint:** `GET /api/monitor/logs?limit=50`

### 4.3 WebSocket Live Stream
- **Endpoint:** `ws://localhost:8000/ws/live`
- **Description:** Real-time bi-directional telemetry pulse broadcasting newly indexed pages and crawler status.
