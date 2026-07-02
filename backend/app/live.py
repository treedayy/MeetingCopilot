"""Live meeting sessions: WebSocket hub + the continuous reasoning engine.

One LiveSession per active meeting. Utterances append to the shared
MeetingState immediately (transcript is broadcast instantly); a background
reasoning loop re-evaluates the whole state every few seconds and streams
every agent's conclusions to all connected panels.
"""

import asyncio
import json
import logging
import time

from fastapi import WebSocket
from sqlalchemy import select

from .agents import Coordinator
from .agents.base import AgentServices
from .config import get_settings
from .db import SessionLocal
from .models import (
    ActionItem, CoachTip, Concept, Decision, Diagram, GraphEdge, GraphNode,
    HealthSnapshot, Insight, Meeting, MemoryItem, Person, RetrievalItem,
    Segment, SuggestedQuestion, Understanding, UserProfile, utcnow,
)
from .report import generate_report
from .simulator import DEMO_SCRIPT, SPEAKER_ROLES
from .state import MeetingState

logger = logging.getLogger(__name__)

TICK_SECONDS = 2.5

# ---------------------------------------------------------------------------
# The normalized record contract. Every piece of AI output is exactly one of:
#   event    — raw transcript
#   action   — a task with an owner or clear intent
#   decision — a final choice or consensus
#   risk     — a high-priority issue that justifies interrupting the meeting
#   note     — everything else (summaries, terms, references, analysis)
#
# During a live meeting ONLY event / action / risk reach the client — risks
# interrupt, actions log quietly, everything else stays silent until the
# meeting ends. Decisions and notes are persisted for the post-meeting record.
# ---------------------------------------------------------------------------

CHANNEL_BY_TYPE = {
    "transcript_segment": "event",
    "action_item": "action",
    "decision": "decision",
    "risk": "risk",
}
CONTROL_TYPES = {"status", "report_ready", "error"}
LIVE_CHANNELS = {"event", "action", "risk"}


def channel_of(event: dict) -> str:
    if event["type"] in CONTROL_TYPES:
        return "control"
    return CHANNEL_BY_TYPE.get(event["type"], "note")


def derive_risks(events: list[dict]) -> list[dict]:
    """Promote genuinely critical findings to the interruptive risk channel:
    contradictions with prior decisions, and blocker/security alerts."""
    risks = []
    for e in events:
        if e["type"] == "memory" and e.get("kind") == "contradiction":
            risks.append({
                "type": "risk", "t": e["t"], "kind": "conflict",
                "title": "Conflicts with a prior decision",
                "text": e["text"],
                "ref_meeting_id": e.get("ref_meeting_id", ""),
            })
        elif e["type"] == "insight" and e.get("kind") == "alert" and e.get("confidence", 0) >= 0.8:
            risks.append({
                "type": "risk", "t": e["t"], "kind": "alert",
                "title": "Needs attention",
                "text": e["text"],
                "ref_meeting_id": "",
            })
    return risks


def load_profile() -> dict:
    db = SessionLocal()
    try:
        profile = db.get(UserProfile, "default")
        if profile is None:
            profile = UserProfile(id="default")
            db.add(profile)
            db.commit()
        return {
            "name": profile.name,
            "role": profile.role,
            "experience": profile.experience,
            "depth": profile.depth,
            "known_technologies": profile.known_technologies or [],
            "learning_goals": profile.learning_goals or [],
            "learned": profile.learned or {},
        }
    finally:
        db.close()


class LiveSession:
    def __init__(self, meeting_id: str, mode: str):
        self.meeting_id = meeting_id
        self.mode = mode
        self.sockets: set[WebSocket] = set()
        self.started = time.monotonic()
        self.demo_task: asyncio.Task | None = None
        self.reasoning_task: asyncio.Task | None = None
        self.ended = False

        profile = load_profile()
        self.state = MeetingState(
            meeting_id=meeting_id,
            mode=mode,
            my_name=profile.get("name") or "Me",
            profile=profile,
        )
        if mode == "demo":
            self.state.expected_total_segments = len(DEMO_SCRIPT)
        from .llm import llm_available

        self.coordinator = Coordinator(AgentServices(
            db_factory=SessionLocal,
            roles=SPEAKER_ROLES if mode == "demo" else {},
            llm_enabled=llm_available(),
        ))
        self.reasoning_task = asyncio.create_task(self._reasoning_loop())

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
        text = text.strip()
        db = SessionLocal()
        try:
            seg = Segment(meeting_id=self.meeting_id, t=t, speaker=speaker, text=text)
            db.add(seg)
            db.commit()
            seg_id = seg.id
        finally:
            db.close()
        self.state.segments.append({"t": t, "speaker": speaker, "text": text})
        await self.broadcast({"channel": "event", "type": "transcript_segment", "id": seg_id, "t": t, "speaker": speaker, "text": text})

    # -- the continuous reasoning loop --------------------------------------#

    async def _reasoning_loop(self):
        try:
            while not self.ended:
                await asyncio.sleep(TICK_SECONDS)
                await self._tick()
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("reasoning loop crashed")

    async def _tick(self):
        events = await self.coordinator.tick(self.state)
        if not events:
            return
        db = SessionLocal()
        try:
            for event in events:
                self._persist_event(db, event)
            db.commit()
        finally:
            db.close()
        # Live contract: interrupt with risks, quietly log actions, stay
        # silent about everything else until the meeting ends.
        events += derive_risks(events)
        for event in events:
            ch = channel_of(event)
            if not self.ended and ch not in LIVE_CHANNELS and ch != "control":
                continue
            await self.broadcast({"channel": ch, **event})

    # -- persistence ------------------------------------------------------#

    def _persist_event(self, db, e: dict):
        mid = self.meeting_id
        kind = e["type"]
        if kind == "understanding":
            db.add(Understanding(meeting_id=mid, t=e["t"], text=e["text"]))
        elif kind == "insight":
            db.add(Insight(meeting_id=mid, t=e["t"], kind=e["kind"], text=e["text"],
                           confidence=e.get("confidence", 0.6)))
        elif kind == "concept":
            db.add(Concept(
                meeting_id=mid, term=e["term"], category=e["category"], what=e["what"],
                why_matters=e["why_matters"], why_now=e["why_now"], beginner=e["beginner"],
                intermediate=e.get("intermediate", ""), advanced=e["advanced"],
                interview=e.get("interview", ""), analogy=e["analogy"], pitfalls=e["pitfalls"],
                related=e["related"], mentions=e["mentions"], first_t=e["first_t"],
                known=e.get("known", False), prior_meetings=e.get("prior_meetings", []),
            ))
        elif kind == "concept_mention":
            row = db.scalars(select(Concept).where(Concept.meeting_id == mid, Concept.term == e["term"])).first()
            if row:
                row.mentions = e["mentions"]
        elif kind == "question":
            db.add(SuggestedQuestion(meeting_id=mid, t=e["t"], text=e["text"],
                                     category=e["category"], score=e["score"], rationale=e["rationale"]))
        elif kind == "action_item":
            db.add(ActionItem(meeting_id=mid, t=e["t"], task=e["task"], owner=e["owner"],
                              deadline=e["deadline"], priority=e["priority"], status=e["status"],
                              dependencies=e["dependencies"], confidence=e.get("confidence", 0.7)))
        elif kind == "decision":
            db.add(Decision(meeting_id=mid, t=e["t"], decision=e["decision"], reason=e["reason"],
                            alternatives=e["alternatives"], tradeoffs=e["tradeoffs"],
                            approved_by=e["approved_by"], confidence=e.get("confidence", 0.8)))
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
                db.add(GraphNode(meeting_id=mid, key=n["key"], label=n["label"], kind=n["kind"],
                                 t=n.get("t", e.get("t", 0.0))))
            for edge in e["edges"]:
                db.add(GraphEdge(meeting_id=mid, source=edge["source"], target=edge["target"],
                                 relation=edge["relation"], t=edge.get("t", e.get("t", 0.0))))
        elif kind == "coach":
            db.add(CoachTip(meeting_id=mid, t=e["t"], kind=e["kind"], text=e["text"],
                            urgency=e.get("urgency", "normal"), confidence=e.get("confidence", 0.6)))
        elif kind == "memory":
            db.add(MemoryItem(meeting_id=mid, t=e["t"], kind=e["kind"], text=e["text"],
                              ref_meeting_id=e.get("ref_meeting_id", ""),
                              ref_meeting_title=e.get("ref_meeting_title", ""),
                              confidence=e.get("confidence", 0.7)))
        elif kind == "retrieval":
            db.add(RetrievalItem(meeting_id=mid, t=e["t"], source=e["source"], title=e["title"],
                                 summary=e["summary"], ref=e["ref"]))
        elif kind == "diagram":
            db.add(Diagram(meeting_id=mid, t=e["t"], version=e["version"], title=e["title"],
                           mermaid=e["mermaid"]))
        elif kind == "state_update":
            db.add(HealthSnapshot(meeting_id=mid, t=e["t"], topic=e["topic"],
                                  topic_confidence=e["topic_confidence"], agreement=e["agreement"],
                                  engagement=e["engagement"], balance=e["balance"],
                                  completeness=e["completeness"], progress=e["progress"]))

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
        if self.demo_task:
            self.demo_task.cancel()
        await self.broadcast({"type": "status", "text": "Meeting ended — generating report…"})
        # One final pass over anything not yet processed, then stop the loop.
        await self._tick()
        self.ended = True
        if self.reasoning_task:
            self.reasoning_task.cancel()
        db = SessionLocal()
        try:
            meeting = db.get(Meeting, self.meeting_id)
            meeting.status = "ended"
            meeting.ended_at = utcnow()
            db.commit()
            try:
                meeting.report_md = await generate_report(db, meeting, my_name or self.state.my_name)
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
