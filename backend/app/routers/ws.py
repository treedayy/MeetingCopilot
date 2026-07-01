import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..db import SessionLocal
from ..live import get_session, sessions
from ..models import Meeting

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/meeting/{meeting_id}")
async def meeting_ws(websocket: WebSocket, meeting_id: str):
    await websocket.accept()
    db = SessionLocal()
    try:
        meeting = db.get(Meeting, meeting_id)
    finally:
        db.close()
    if meeting is None:
        await websocket.send_text(json.dumps({"type": "error", "text": "meeting not found"}))
        await websocket.close()
        return
    if meeting.status == "ended":
        await websocket.send_text(json.dumps({"type": "report_ready", "meeting_id": meeting_id}))
        await websocket.close()
        return

    session = get_session(meeting_id, meeting.mode)
    session.sockets.add(websocket)
    await websocket.send_text(json.dumps({"type": "status", "text": "connected"}))

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            kind = msg.get("type")
            if kind == "start_demo":
                session.start_demo()
            elif kind == "utterance":
                await session.add_utterance(msg.get("speaker") or "Me", msg.get("text", ""))
            elif kind == "end":
                await session.end(my_name=msg.get("my_name", ""))
                sessions.pop(meeting_id, None)
    except WebSocketDisconnect:
        session.sockets.discard(websocket)
    except Exception:
        logger.exception("websocket error")
        session.sockets.discard(websocket)
