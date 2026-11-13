"""
WebSocket Live Stream Router for HS SEARCH
Company: HS AI Solutions
"""

import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
import json
import logging
from app.database.connection import db

router = APIRouter(tags=["WebSocket"])
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                self.disconnect(connection)

ws_manager = ConnectionManager()

@router.websocket("/ws/live")
async def websocket_live_stream(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Send periodic pulse of system metrics and latest log
            metrics = await db.get_metrics()
            await websocket.send_text(json.dumps({
                "type": "heartbeat",
                "metrics": metrics
            }))
            await asyncio.sleep(2.0)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"WebSocket client error: {e}")
        ws_manager.disconnect(websocket)
