"""Live meeting sessions: WebSocket hub + event persistence.

One LiveSession per active meeting. Segments arrive either from the demo
simulator or from the client (browser Web Speech API / manual input); every
derived event is persisted and broadcast to all connected panels.
"""

import asyncio
import json
import logging
import time

from fastapi import WebSocket
from sqlalchemy import select

from .analyst import MeetingAnalyst
from .config import get_settings
from .db import SessionLocal
from .models import (
    ActionItem, Concept, Decision, GraphEdge, GraphNode, Insight, Meeting,
    Person, Segment, SuggestedQuestion, Understanding, utcnow,
)
from .report import generate_report
from .simulator import DEMO_SCRIPT, SPEAKER_ROLES

logger = logging.getLogger(__name__)


class LiveSession:
    def __init__(self, meeting_id: str, mode: str):
        self.meeting_id = meeting_id
        self.mode = mode
        self.sockets: set[WebSocket] = set()
        self.analyst = MeetingAnalyst(meeting_id, SPEAKER_ROLES if mode == "demo" else {})
        self.started = time.monotonic()
        self.segment_count = 0
        self.demo_task: asyncio.Task | None = None
        self.analysis_lock = asyncio.Lock()
        self.ended = False

    # -- broadcasting ---------------------------------------------------- #

    async def broadcast(self, event: dict):
        dead = []
        payload = json.dumps(event, default=str)
        for ws in self.sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.sockets.discard(ws)

    # -- ingestion --------------------------------------------------------#

    async def add_utterance(self, speaker: str, text: str, t: float | None = None):
        if self.ended or not text.strip():
            return
        t = t if t is not None else time.monotonic() - self.started
        db = SessionLocal()
        try:
            seg = Segment(meeting_id=self.meeting_id, t=t, speaker=speaker, text=text.strip())
            db.add(seg)
            db.commit()
            await self.broadcast({"type": "transcript_segment", "id": seg.id, "t": t, "speaker": speaker, "text": text.strip()})

            events = self.analyst.on_segment(t, speaker, text.strip())
            for event in events:
                self._persist_event(db, event)
            db.commit()
            for event in events:
                await self.broadcast(event)
        finally:
            db.close()

        self.segment_count += 1
        if self.segment_count % get_settings().analysis_every_segments == 0:
            asyncio.create_task(self.run_analysis())

    async def run_analysis(self):
        async with self.analysis_lock:
            try:
                events = await self.analyst.analyze()
            except Exception:
                logger.exception("analysis pass failed")
                return
            if not events:
                return
            db = SessionLocal()
            try:
                for event in events:
                    self._persist_event(db, event)
                db.commit()
            finally:
                db.close()
            for event in events:
                await self.broadcast(event)

    # -- persistence ------------------------------------------------------#

    def _persist_event(self, db, e: dict):
        mid = self.meeting_id
        kind = e["type"]
        if kind == "understanding":
            db.add(Understanding(meeting_id=mid, t=e["t"], text=e["text"]))
        elif kind == "insight":
            db.add(Insight(meeting_id=mid, t=e["t"], kind=e["kind"], text=e["text"]))
        elif kind == "concept":
            db.add(Concept(
                meeting_id=mid, term=e["term"], category=e["category"], what=e["what"],
                why_matters=e["why_matters"], why_now=e["why_now"], beginner=e["beginner"],
                advanced=e["advanced"], analogy=e["analogy"], pitfalls=e["pitfalls"],
                related=e["related"], mentions=e["mentions"], first_t=e["first_t"],
            ))
        elif kind == "concept_mention":
            row = db.scalars(select(Concept).where(Concept.meeting_id == mid, Concept.term == e["term"])).first()
            if row:
                row.mentions = e["mentions"]
        elif kind == "question":
            db.add(SuggestedQuestion(meeting_id=mid, t=e["t"], text=e["text"], category=e["category"], score=e["score"], rationale=e["rationale"]))
        elif kind == "action_item":
            db.add(ActionItem(meeting_id=mid, t=e["t"], task=e["task"], owner=e["owner"], deadline=e["deadline"], priority=e["priority"], status=e["status"], dependencies=e["dependencies"]))
        elif kind == "decision":
            db.add(Decision(meeting_id=mid, t=e["t"], decision=e["decision"], reason=e["reason"], alternatives=e["alternatives"], tradeoffs=e["tradeoffs"], approved_by=e["approved_by"]))
        elif kind == "person":
            row = db.scalars(select(Person).where(Person.meeting_id == mid, Person.name == e["name"])).first()
            if row is None:
                row = Person(meeting_id=mid, name=e["name"])
                db.add(row)
            row.role = e["role"]
            row.expertise = e["expertise"]
            row.segments_count = e["segments_count"]
            row.words = e["words"]
            row.sentiment = e["sentiment"]
            row.influence = e["influence"]
        elif kind == "graph":
            for n in e["nodes"]:
                db.add(GraphNode(meeting_id=mid, key=n["key"], label=n["label"], kind=n["kind"]))
            for edge in e["edges"]:
                db.add(GraphEdge(meeting_id=mid, source=edge["source"], target=edge["target"], relation=edge["relation"]))

    # -- demo playback ------------------------------------------------------#

    def start_demo(self):
        if self.demo_task is None or self.demo_task.done():
            self.demo_task = asyncio.create_task(self._play_demo())

    async def _play_demo(self):
        t = 0.0
        try:
            for speaker, text, delay in DEMO_SCRIPT:
                await asyncio.sleep(delay)
                if self.ended:
                    return
                t += delay
                await self.add_utterance(speaker, text, t=t)
            await self.broadcast({"type": "status", "text": "Demo script finished — end the meeting to generate the report."})
        except asyncio.CancelledError:
            pass

    # -- lifecycle ------------------------------------------------------#

    async def end(self, my_name: str = ""):
        if self.ended:
            return
        self.ended = True
        if self.demo_task:
            self.demo_task.cancel()
        await self.broadcast({"type": "status", "text": "Meeting ended — generating report…"})
        # Final analysis pass over any remaining segments, then the report.
        async with self.analysis_lock:
            pass
        await self.run_analysis()
        db = SessionLocal()
        try:
            meeting = db.get(Meeting, self.meeting_id)
            meeting.status = "ended"
            meeting.ended_at = utcnow()
            db.commit()
            try:
                meeting.report_md = await generate_report(db, meeting, my_name)
            except Exception:
                logger.exception("report generation failed")
                meeting.report_md = "# Report generation failed\nSee server logs."
            db.commit()
        finally:
            db.close()
        await self.broadcast({"type": "report_ready", "meeting_id": self.meeting_id})


sessions: dict[str, LiveSession] = {}


def get_session(meeting_id: str, mode: str) -> LiveSession:
    if meeting_id not in sessions:
        sessions[meeting_id] = LiveSession(meeting_id, mode)
    return sessions[meeting_id]
