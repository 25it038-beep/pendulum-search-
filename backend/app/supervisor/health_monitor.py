"""
Self-Healing Infrastructure & System Health Monitor
Tracks actual CPU, RAM, Disk, Queue health, auto-recovers stuck jobs, and manages backpressure.
Company: HS AI Solutions
"""

import asyncio
import psutil
import shutil
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from app.config import settings, BASE_DIR
from app.database.connection import db
from app.crawler.engine import crawler

logger = logging.getLogger(__name__)

class HealthSupervisor:
    def __init__(self):
        self.is_running = False
        self._task = None
        self.backup_dir = BASE_DIR / "data" / "backups"
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.concurrency_throttle = 1.0 # 1.0 = normal, 0.5 = throttled

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        logger.info("Starting Self-Healing Health Supervisor...")
        self._task = asyncio.create_task(self._supervisor_loop())

    async def stop(self):
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()

    async def _supervisor_loop(self):
        while self.is_running:
            try:
                # 1. Collect real OS telemetry
                cpu = psutil.cpu_percent(interval=None)
                ram = psutil.virtual_memory().percent
                disk = psutil.disk_usage(str(BASE_DIR)).percent

                # 2. Check for stuck in_progress queue items (>10 min)
                await self.recover_stuck_queue_items()

                # 3. Dynamic Backpressure Control
                if cpu > 85.0 or ram > 90.0:
                    self.concurrency_throttle = 0.5
                    logger.warning(f"High system load (CPU {cpu}%, RAM {ram}%). Throttling crawler concurrency.")
                else:
                    self.concurrency_throttle = 1.0

                # 4. Save snapshot in DB
                metrics = await db.get_metrics()
                snapshot = {
                    "cpu_percent": cpu,
                    "memory_percent": ram,
                    "disk_percent": disk,
                    "active_workers": settings.CRAWLER_MAX_CONCURRENCY if crawler.is_running else 0,
                    "queue_size": metrics.get("queue_size", 0),
                    "requests_per_sec": metrics.get("crawling_req_per_sec", 0.0),
                    "indexing_per_sec": metrics.get("indexing_ops_per_sec", 0.0),
                    "error_rate": 0.0
                }
                await db.record_system_snapshot(snapshot)

                # Run health cycle every 10 seconds
                await asyncio.sleep(10.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Supervisor loop error: {e}")
                await asyncio.sleep(10.0)

    async def recover_stuck_queue_items(self) -> int:
        """Reset jobs stuck in 'in_progress' for more than 10 minutes back to 'pending'."""
        stuck_threshold = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        recovered = 0
        try:
            async with db.get_connection() as conn:
                cursor = await conn.execute(
                    """UPDATE crawl_queue 
                       SET status = 'pending', retries = retries + 1 
                       WHERE status = 'in_progress' AND scheduled_for < ?""",
                    (stuck_threshold,)
                )
                recovered = cursor.rowcount
                await conn.commit()
            if recovered > 0:
                await db.log_event("supervisor", f"Self-healed {recovered} stalled queue items", "WARNING")
        except Exception:
            pass
        return recovered

    async def create_backup_snapshot(self) -> Optional[str]:
        """Safely create an on-disk backup snapshot of SQLite database."""
        try:
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"hs_search_backup_{timestamp_str}.db"
            target_path = self.backup_dir / backup_filename

            # Using SQLite vacuum into or safe copy
            async with db.get_connection() as conn:
                await conn.execute(f"VACUUM INTO '{str(target_path).replace(chr(92), '/')}'")

            logger.info(f"Database backup created: {target_path}")
            await db.log_event("backup", f"Created database backup snapshot: {backup_filename}", "INFO")
            return str(target_path)
        except Exception as e:
            logger.error(f"Backup creation failed: {e}")
            return None

    def get_realtime_resources(self) -> Dict[str, Any]:
        """Get live CPU, RAM, and Disk metrics."""
        return {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "ram_percent": psutil.virtual_memory().percent,
            "ram_used_gb": round(psutil.virtual_memory().used / (1024**3), 2),
            "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
            "disk_percent": psutil.disk_usage(str(BASE_DIR)).percent,
            "disk_free_gb": round(psutil.disk_usage(str(BASE_DIR)).free / (1024**3), 2),
            "concurrency_throttle": self.concurrency_throttle
        }

health_supervisor = HealthSupervisor()
