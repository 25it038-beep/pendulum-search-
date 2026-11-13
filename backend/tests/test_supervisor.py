"""
Unit Tests for Self-Healing Infrastructure, Telemetry & Backpressure
"""

import pytest
from app.supervisor.health_monitor import health_supervisor
from app.discovery.intelligence import discovery_intelligence
from app.database.connection import db

@pytest.mark.asyncio
async def test_health_supervisor_telemetry():
    await db.init_db()
    res = health_supervisor.get_realtime_resources()
    assert "cpu_percent" in res
    assert "ram_percent" in res
    assert "disk_percent" in res
    assert res["concurrency_throttle"] > 0

@pytest.mark.asyncio
async def test_discovery_gaps_logging():
    await db.init_db()
    await db.log_discovery_gap("quantum teleportation protocols", "science", "low_coverage")
    gaps = await db.get_discovery_gaps()
    assert len(gaps) >= 1
    assert any(g["topic_or_query"] == "quantum teleportation protocols" for g in gaps)
