"""
Self-Healing System Health & Telemetry API
Company: HS AI Solutions
"""

from fastapi import APIRouter, HTTPException
from app.supervisor.health_monitor import health_supervisor
from app.database.connection import db

router = APIRouter(prefix="/api/system", tags=["System Supervisor"])

@router.get("/health")
async def get_system_health():
    """Retrieve live CPU, RAM, Disk, Queue health, and Backpressure throttle status."""
    resources = health_supervisor.get_realtime_resources()
    snapshots = await db.get_recent_snapshots(limit=10)
    metrics = await db.get_metrics()

    return {
        "status": "healthy",
        "resources": resources,
        "metrics": metrics,
        "recent_snapshots": snapshots
    }

@router.post("/backup")
async def trigger_backup():
    """Trigger an on-demand database backup snapshot."""
    path = await health_supervisor.create_backup_snapshot()
    if not path:
        raise HTTPException(status_code=500, detail="Backup snapshot failed")
    return {"status": "success", "backup_path": path}

@router.post("/recover-stuck")
async def trigger_stuck_recovery():
    """Manually force recovery of stalled queue items."""
    recovered = await health_supervisor.recover_stuck_queue_items()
    return {"status": "success", "recovered_items": recovered}
