# HS SEARCH — System Architecture

**Company:** HS AI Solutions  
**Founder:** Harshan Seliyan  
**Platform:** HS Search Autonomous Global-Scale Search Infrastructure  
**Core System:** HS MegaCrawler Distributed Ecosystem  

---

## 1. Executive Architectural Overview

HS Search is an **independent, real-time, AI-powered search infrastructure** engineered to discover, crawl, parse, index, rank, and retrieve internet content autonomously without delegating queries to external commercial search engines (Google, Bing, or Yahoo).

```
                      +-------------------------------------------------------+
                      |               GLOBAL INTERNET TARGETS                 |
                      +-------------------------------------------------------+
                                                  |
                    [Sitemaps, RSS, Common Crawl, IndexNow, APIs, Hyperlinks]
                                                  v
                      +-------------------------------------------------------+
                      |         AUTONOMOUS WEB DISCOVERY ENGINE               |
                      | (Continuous 10-Channel Discovery & Gap Sweep)         |
                      +-------------------------------------------------------+
                                                  |
                                                  v
                      +-------------------------------------------------------+
                      |         INTELLIGENT URL PRIORITIZER                   |
                      | Score = w_rel*R + w_qual*Q + w_auth*A + w_freq*F      |
                      |         + w_fresh*Fr + w_dem*D - w_cost*C             |
                      +-------------------------------------------------------+
                                                  |
                                                  v
                      +-------------------------------------------------------+
                      |       DISTRIBUTED URL FRONTIER QUEUE                  |
                      | (Redis Streams / SQLite WAL + Lease Locks + Traps)    |
                      +-------------------------------------------------------+
                                                  |
                                                  v
                      +-------------------------------------------------------+
                      |       HS MEGACRAWLER ECOSYSTEM (15 SERVICES)          |
                      | 1. HS-WebCrawler       | 9.  HS-LiveCrawler           |
                      | 2. HS-NewsCrawler      | 10. HS-ImageCrawler          |
                      | 3. HS-ResearchCrawler  | 11. HS-VideoCrawler          |
                      | 4. HS-TechCrawler      | 12. HS-DiscoveryCrawler      |
                      | 5. HS-CodeCrawler      | 13. HS-RefreshCrawler        |
                      | 6. HS-DocCrawler       | 14. HS-DeepCrawler           |
                      | 7. HS-GovCrawler       | 15. HS-API-Crawler           |
                      | 8. HS-ScienceCrawler   |                              |
                      +-------------------------------------------------------+
                               /                                     \
                              v                                       v
             +----------------------------------+   +----------------------------------+
             |    Modal Cloud CPU Workers       |   |    Modal Cloud GPU Workers       |
             | (HTTP/2 Fetch, HTML/PDF Extract, |   | (July LLM Inference, Neural      |
             | SimHash, Outlinks, Politeness)   |   |  Reranking & Dense Embeddings)   |
             +----------------------------------+   +----------------------------------+
                              \                                       /
                               v                                     v
                      +-------------------------------------------------------+
                      |       CONTENT INTELLIGENCE & DEDUPLICATION            |
                      | (Boilerplate Removal, 64-bit SimHash, Quality Scorer) |
                      +-------------------------------------------------------+
                               /                     |                     \
                              v                      v                      v
             +------------------------+  +------------------------+  +------------------------+
             | Central Index Pipeline |  | Compressed Object Store|  | Knowledge Graph & Gaps |
             | (FTS5 BM25 + Qdrant)   |  | (Modal Volume / Gzip)  |  | (Entities & Relations) |
             +------------------------+  +------------------------+  +------------------------+
                                           \         |         /
                                            v        v        v
                      +-------------------------------------------------------+
                      |         CRAWLER SELF-OPTIMIZATION ENGINE              |
                      | (Yield Analysis, Backpressure Tuning, Concurrency)    |
                      +-------------------------------------------------------+
                                                     |
                                                     v
                      +-------------------------------------------------------+
                      |             JULY AI SEARCH INTEGRATION                |
                      | (Fast, Deep, Research, Live, Technical Search Modes)   |
                      +-------------------------------------------------------+
                                                     |
                                                     v
                      +-------------------------------------------------------+
                      |            CINEMATIC OBSIDIAN & GOLD UI               |
                      | Search Interface & MegaCrawler Command Center         |
                      +-------------------------------------------------------+
```

---

## 2. HS MegaCrawler 15 Specialized Services

Each crawler runs with independent configuration, worker pools, queues, politeness boundaries, and retry policies:

1. **HS-WebCrawler**: General public web pages, knowledge bases, and encyclopedias.
2. **HS-NewsCrawler**: Global journalism, breaking news portals, and publication feeds.
3. **HS-ResearchCrawler**: Academic papers, arXiv preprints, CrossRef DOIs, and scientific repositories.
4. **HS-TechCrawler**: Technology journalism, artificial intelligence, chip architecture, and computing.
5. **HS-CodeCrawler**: Public source-code repositories, SDKs, package indices (GitHub, PyPI, npm, crates.io).
6. **HS-DocCrawler**: Software manuals, specifications, and developer documentation trees.
7. **HS-GovCrawler**: Open government data portals, legislation, statistics, and official reports.
8. **HS-ScienceCrawler**: STEM educational materials, peer-reviewed open science, and educational curricula.
9. **HS-LiveCrawler**: Real-time RSS/Atom streams, breaking news tickers, and financial market tickers.
10. **HS-ImageCrawler**: Creative commons and public image metadata, dimensions, captions, and licenses.
11. **HS-VideoCrawler**: Video metadata, transcripts, titles, and embed resources.
12. **HS-DiscoveryCrawler**: Graph-level traversal across unindexed domains, directory trees, and Common Crawl.
13. **HS-RefreshCrawler**: Conditional HTTP (ETag, Last-Modified, 304 Not Modified) recrawling monitor.
14. **HS-DeepCrawler**: Subtree crawler traversing up to 5 levels deep within permitted crawl boundaries.
15. **HS-API-Crawler**: Structured ingestion collector querying authorized open REST/GraphQL endpoints.

---

## 3. Intelligent URL Prioritizer

Every discovered candidate URL is evaluated across 9 weighted signals before enqueueing:
$$\text{Priority Score} = w_{\text{rel}} \cdot R + w_{\text{qual}} \cdot Q + w_{\text{auth}} \cdot A + w_{\text{freq}} \cdot F + w_{\text{fresh}} \cdot Fr + w_{\text{demand}} \cdot D + w_{\text{hist}} \cdot H + w_{\text{uniq}} \cdot U - w_{\text{cost}} \cdot C$$

- **Content Relevance ($R$):** Keyword overlap with high-demand query topics.
- **Source Quality ($Q$):** TLS security, short canonical paths, editorial structure.
- **Domain Authority ($A$):** Whitelist authority scoring and top-level domain trust (.edu, .gov).
- **Update Frequency ($F$):** Category-specific update probability (Live > News > Tech > Docs).
- **Freshness ($Fr$):** Recency of the discovery signal.
- **User Search Demand ($D$):** Feedback from user query logs and identified discovery gaps.
- **Historical Change Frequency ($H$):** Rate of actual mutations observed in document versions.
- **Content Uniqueness ($U$):** Penalty for repeated tag, archive, or calendar pages.
- **Crawl Cost ($C$):** Penalty for deep crawl depth or query string parameter explosions.

Mapped to priority tiers $P \in [1, 10]$ where priority 1 receives immediate worker dispatch.

---

## 4. Modal Cloud Compute Architecture

To achieve massive horizontal scalability without runaway spending:

### A. CPU-Intensive Worker Tier
- **Workloads:** HTTP/2 & HTTP/3 fetching, connection pooling, Brotli/Gzip decompression, BeautifulSoup HTML parsing, PDF text extraction, 64-bit SimHash calculation, outlink extraction.
- **Resource Limits:** `cpu=1.0`, `memory=1024MB`, maximum concurrency capped at 24 distributed containers.
- **Durable Storage:** Persistent Modal Volume mounted at `/hs_data` for content snapshots.

### B. GPU-Intensive Inference Tier
- **Workloads:** July LLM neural reranking, dense 256-D semantic embedding generation, and multi-document cross-comparison.
- **Hardware:** Dedicated `T4` or `A10G` GPUs.
- **Isolation:** GPUs are strictly prohibited from routine HTTP crawling tasks.

---

## 5. Object Storage & Content Retention

Raw documents and revision history are managed by `ObjectStorageManager`:
- Content-addressed using SHA-256 digests.
- Two-tier directory partitioning (`aa/hash.gz`) preventing filesystem inode bottlenecks.
- Level 6 Gzip compression delivering an average 2.8:1 compression ratio.
- Supports local storage, Modal persistent volumes, or S3-compatible endpoints.

---

## 6. Self-Optimization & Safety Guard Rails

The `CrawlerIntelligenceOptimizer` monitors real-time telemetry to apply controlled configuration adjustments:
- Automatically scales up worker concurrency when queue backlog is high and failure rates are under 5%.
- Implements backpressure dampening when target servers return rate limits or failure rates exceed 25%.
- **Immutable Safety Boundaries:**
  - `robots.txt` compliance is enforced at all times.
  - SSRF protection and private IP range blocking (10.0.0.0/8, 127.0.0.0/8, 169.254.169.254) can never be overridden.
  - Per-domain rate limits and politeness delays cannot be disabled.
  - The optimizer cannot rewrite executable production code.

---

## 7. July AI 5 Search Modes

Integrated directly with the HS Search engine:
1. **Fast Search:** Sub-second instant answers with concise summaries.
2. **Deep Search:** Multi-hop traversal across correlated domain subtrees.
3. **Research Search:** Academic preprints, DOI citation verification, and hypothesis testing.
4. **Live Search:** Sub-minute breaking updates from real-time RSS tickers.
5. **Technical Search:** Developer specifications, GitHub syntax, and API references.
- **Zero Fabrication:** Every claim maps directly to verified citations `[1]`, `[2]`.
