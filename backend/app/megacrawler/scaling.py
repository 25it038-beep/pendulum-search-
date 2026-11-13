"""
HS MegaCrawler Dynamic Worker Scaler
Queue-Based, Resource-Aware Elastic Scaling with Idle Shutdown and Worker Health Checks.
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import psutil
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

from app.config import settings
from app.database.connection import db
from app.megacrawler.frontier import frontier

class WorkerScaler:
    def __init__(self, max_workers: int = settings.MEGACRAWLER_MAX_WORKERS):
        self.max_workers = max_workers
        self.min_workers = 2
        self.batch_size = 5

    async def compute_target_workers(self, queue_size: int, error_rate: float = 0.0) -> Dict[str, Any]:
        """
        Calculates optimal worker count based on queue backlog, host CPU/RAM, and error rate.
        Never scales beyond safe host/cloud limits.
        """
        cpu_pct = psutil.cpu_percent(interval=None)
        ram = psutil.virtual_memory()
        ram_pct = ram.percent

        health_factor = 1.0

        # Backpressure dampening if host is overloaded
        if cpu_pct > 85.0 or ram_pct > 85.0:
            health_factor = 0.4
        elif cpu_pct > 70.0 or ram_pct > 70.0:
            health_factor = 0.7
        elif error_rate > 0.15:
            health_factor = 0.5

        if queue_size == 0:
            target = self.min_workers
            reason = "Idle queue; running at baseline minimum"
        else:
            raw_needed = max(1, queue_size // self.batch_size)
            adjusted = int(raw_needed * health_factor)
            target = max(self.min_workers, min(self.max_workers, adjusted))
            reason = f"Queue size {queue_size} with health factor {health_factor:.2f}"

        return {
            "target_workers": target,
            "max_workers": self.max_workers,
            "min_workers": self.min_workers,
            "current_queue_size": queue_size,
            "host_cpu_percent": cpu_pct,
            "host_ram_percent": ram_pct,
            "health_factor": health_factor,
            "scaling_reason": reason
        }

    async def prune_stale_workers(self, max_stale_sec: int = 90) -> int:
        """Deregister workers that haven't sent a heartbeat within max_stale_sec."""
        stale_threshold = (datetime.now(timezone.utc) - timedelta(seconds=max_stale_sec)).isoformat()
        pruned_count = 0

        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT COUNT(*) as c FROM megacrawler_workers WHERE last_heartbeat < ?",
                (stale_threshold,)
            )
            row = await cursor.fetchone()
            pruned_count = row["c"] if row else 0

            if pruned_count > 0:
                await conn.execute(
                    "DELETE FROM megacrawler_workers WHERE last_heartbeat < ?",
                    (stale_threshold,)
                )
                await conn.commit()

        return pruned_count

worker_scaler = WorkerScaler()
