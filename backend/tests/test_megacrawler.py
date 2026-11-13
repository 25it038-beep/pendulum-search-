"""
Unit and Integration Tests for HS MegaCrawler Ecosystem
Validates the 15 Specialized Crawlers, Intelligent Prioritization,
Autonomous Discovery Engine, Object Storage, Self-Optimization,
Security Guard, and July AI 5-Mode Search.
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import pytest
import asyncio
from datetime import datetime, timezone

from app.database.connection import db
from app.megacrawler.security import security_guard
from app.megacrawler.frontier import frontier
from app.megacrawler.models import CrawlerType, JulyCrawlRequest
from app.megacrawler.ecosystem import megacrawler_ecosystem
from app.megacrawler.scaling import worker_scaler
from app.megacrawler.benchmark import crawler_benchmark
from app.megacrawler.july_integration import july_gateway
from app.megacrawler.discovery_engine import discovery_engine
from app.megacrawler.storage import object_storage
from app.megacrawler.optimizer import crawler_optimizer

@pytest.mark.asyncio
async def test_ssrf_and_trap_security():
    """Verify SSRF filters, loopback blocking, and URL trap detection."""
    # 1. Loopback / Localhost
    safe, reason = security_guard.is_safe_url("http://127.0.0.1:8000/private")
    assert not safe
    assert "Blocked host" in reason or "restricted network" in reason

    safe, _ = security_guard.is_safe_url("http://localhost/admin")
    assert not safe

    # 2. Cloud Metadata IP
    safe, _ = security_guard.is_safe_url("http://169.254.169.254/latest/meta-data/")
    assert not safe

    # 3. Valid public URL
    safe, _ = security_guard.is_safe_url("https://en.wikipedia.org/wiki/Artificial_intelligence")
    assert safe

    # 4. URL Trap - Excessive depth
    trap, _ = security_guard.is_url_trap("https://example.com/a/b/c/d/e/f/g/h/i/j")
    assert trap

    # 5. URL Trap - Repeated path segment loop
    trap, _ = security_guard.is_url_trap("https://example.com/docs/api/docs/api/docs/api")
    assert trap

    # 6. Clean URL
    trap, _ = security_guard.is_url_trap("https://example.com/technology/quantum-computing")
    assert not trap

@pytest.mark.asyncio
async def test_frontier_enqueue_and_lease():
    """Verify distributed frontier enqueueing, duplicate prevention, and leasing."""
    await db.init_db()
    await frontier.initialize()

    test_url = "https://techcrunch.com/test-article-megacrawler"

    # Enqueue URL
    enqueued, msg = await frontier.enqueue_url(
        url=test_url,
        crawler_type=CrawlerType.TECH.value,
        priority=3
    )
    assert enqueued or msg == "Already in frontier queue"

    # Re-enqueue duplicate should reject
    dup, reason = await frontier.enqueue_url(
        url=test_url,
        crawler_type=CrawlerType.TECH.value,
        priority=3
    )
    assert not dup
    assert "Duplicate" in reason or "Already in frontier queue" in reason

    # Lease task
    tasks = await frontier.lease_batch(
        crawler_type=CrawlerType.TECH.value,
        worker_id="test-worker-1",
        batch_size=5,
        lease_sec=30
    )
    assert isinstance(tasks, list)
    if tasks:
        first = tasks[0]
        assert first.status == "leased"
        assert first.leased_to == "test-worker-1"
        # Complete task
        await frontier.complete_task(first.id)

@pytest.mark.asyncio
async def test_specialized_crawlers_registered():
    """Verify all 13 Universal Resource-Based crawlers and domain crawlers are registered."""
    assert len(megacrawler_ecosystem.crawlers) >= 15

    universal_expected = [
        "HTMLCrawler", "JavaScriptCrawler", "PDFCrawler", "DocumentCrawler",
        "ImageMetadataCrawler", "VideoMetadataCrawler", "AudioMetadataCrawler",
        "APIDataCrawler", "RSSCrawler", "SitemapCrawler", "DatasetCrawler",
        "DeepDiscoveryCrawler", "RefreshCrawler"
    ]
    for name in universal_expected:
        assert name in megacrawler_ecosystem.crawlers
        crawler = megacrawler_ecosystem.crawlers[name]
        assert crawler.config.concurrency_limit > 0

    legacy_expected = [
        "HS-WebCrawler", "HS-NewsCrawler", "HS-ResearchCrawler", "HS-TechCrawler",
        "HS-CodeCrawler", "HS-DocCrawler", "HS-GovCrawler", "HS-ScienceCrawler",
        "HS-LiveCrawler", "HS-ImageCrawler", "HS-VideoCrawler", "HS-DiscoveryCrawler",
        "HS-RefreshCrawler", "HS-DeepCrawler", "HS-API-Crawler"
    ]
    for name in legacy_expected:
        assert name in megacrawler_ecosystem.crawlers
        crawler = megacrawler_ecosystem.crawlers[name]
        assert crawler.config.concurrency_limit > 0
        assert crawler.config.priority >= 1

@pytest.mark.asyncio
async def test_intelligent_url_prioritization():
    """Verify multi-factor URL priority scoring algorithm."""
    # High authority scientific paper
    prio_research, factors_res, score_res = frontier.calculate_priority_score(
        url="https://arxiv.org/abs/2401.00001",
        crawler_type="HS-ResearchCrawler",
        depth=0,
        discovery_source="rss_atom"
    )
    assert 1 <= prio_research <= 4
    assert factors_res.domain_authority >= 0.90
    assert score_res > 0.60

    # Deep generic tag URL
    prio_deep, factors_deep, score_deep = frontier.calculate_priority_score(
        url="https://some-small-blog.net/tag/archive/page/4?filter=all&sort=asc&view=list",
        crawler_type="HS-WebCrawler",
        depth=4,
        discovery_source="hyperlink"
    )
    assert prio_deep >= 5
    assert factors_deep.crawl_cost > factors_res.crawl_cost

@pytest.mark.asyncio
async def test_worker_scaling_logic():
    """Verify dynamic worker scaler reacts safely to queue backlog and resource constraints."""
    scale_low = await worker_scaler.compute_target_workers(queue_size=2)
    assert scale_low["target_workers"] >= scale_low["min_workers"]

    scale_high = await worker_scaler.compute_target_workers(queue_size=200)
    assert scale_high["target_workers"] > scale_low["target_workers"]
    assert scale_high["target_workers"] <= scale_high["max_workers"]

@pytest.mark.asyncio
async def test_july_crawler_gateway():
    """Verify controlled July AI crawler dispatch."""
    req = JulyCrawlRequest(
        query="Explain Blackwell B200 Tensor Core Architecture",
        suggested_urls=["https://developer.nvidia.com/blackwell-architecture"],
        urgency="high",
        reason="Information gap on Blackwell B200 specs"
    )

    res = await july_gateway.submit_targeted_crawl(req)
    assert res["status"] == "accepted"
    assert res["priority"] == 2
    assert "Governed by HS AI Solutions Controlled Execution Guard" in res["policy"]

@pytest.mark.asyncio
async def test_july_five_search_modes():
    """Verify unified July AI search pipeline across modes."""
    modes = ["fast", "deep", "research", "live", "technical"]
    for m in modes:
        res = await july_gateway.execute_july_search(
            query="Artificial Intelligence breakthroughs",
            search_mode=m,
            max_results=3
        )
        assert res["search_mode"] == m
        assert "execution_time_ms" in res
        assert "citations" in res
        assert "summary" in res

@pytest.mark.asyncio
async def test_object_storage_compression():
    """Verify document snapshot storage, compression, and retrieval."""
    test_content = "<html><head><title>Test Doc</title></head><body>HS Search MegaCrawler Object Store Test</body></html>"
    chash, raw_sz, comp_sz = await object_storage.store_document(
        url="https://example.com/test-store",
        content=test_content,
        content_type="text/html"
    )
    assert chash is not None
    assert raw_sz > 0
    assert comp_sz > 0

    retrieved = await object_storage.retrieve_document(chash)
    assert retrieved is not None
    assert retrieved["content"] == test_content
    assert retrieved["url"] == "https://example.com/test-store"

@pytest.mark.asyncio
async def test_discovery_engine_and_indexnow():
    """Verify autonomous discovery engine channels and IndexNow processing."""
    stats = discovery_engine.get_discovery_stats()
    assert "total_urls_discovered" in stats
    assert len(stats["active_channels"]) >= 8

    # Test IndexNow notification
    res = await discovery_engine.discover_from_indexnow(
        host="example.com",
        url_list=["https://example.com/news/article-1", "https://example.com/news/article-2"]
    )
    assert res["status"] == "success"
    assert res["submitted_urls"] == 2

@pytest.mark.asyncio
async def test_crawler_self_optimization():
    """Verify self-optimization analyzer and recommendations."""
    report = crawler_optimizer.get_optimization_report()
    assert report["safety_boundaries"]["robots_txt_immutable"] is True
    assert report["safety_boundaries"]["ssrf_protection_immutable"] is True

    recs = await crawler_optimizer.run_optimization_cycle()
    assert isinstance(recs, list)

@pytest.mark.asyncio
async def test_benchmark_metrics():
    """Verify benchmark metrics calculation."""
    report = await crawler_benchmark.run_live_benchmark(sample_duration_sec=3)
    assert report.total_pages_indexed >= 0
    assert report.successful_retrieval_rate_pct >= 0.0
    assert report.infrastructure_cost_per_1000_pages_usd >= 0.0
    assert report.system_status == "HEALTHY_HIGH_THROUGHPUT"
