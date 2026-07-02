"""Workspace-level records: the system-of-record views that span meetings.

Activity is an append-only event log; tasks and decisions are the same rows
shown per-meeting, addressed globally with wall-clock timestamps.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ActionItem, Decision, Meeting

router = APIRouter(prefix="/api", tags=["records"])


def _at(meeting: Meeting, t: float) -> str:
    return (meeting.started_at + timedelta(seconds=t)).isoformat()


@router.get("/activity")
def activity(limit: int = 100, db: Session = Depends(get_db)):
    meetings = {m.id: m for m in db.scalars(select(Meeting))}
    events: list[dict] = []
    for m in meetings.values():
        events.append({
            "at": m.started_at.isoformat(), "type": "meeting_started",
            "meeting_id": m.id, "meeting_title": m.title,
            "text": f"Meeting started · {m.title}",
        })
        if m.ended_at:
            events.append({
                "at": m.ended_at.isoformat(), "type": "meeting_ended",
                "meeting_id": m.id, "meeting_title": m.title,
                "text": f"Meeting ended · notes published",
            })
    for d in db.scalars(select(Decision)):
        m = meetings.get(d.meeting_id)
        if m:
            events.append({
                "at": _at(m, d.t), "type": "decision",
                "meeting_id": m.id, "meeting_title": m.title,
                "text": d.decision, "needs_review": d.confidence < 0.7,
            })
    for a in db.scalars(select(ActionItem)):
        m = meetings.get(a.meeting_id)
        if m:
            events.append({
                "at": _at(m, a.t), "type": "task",
                "meeting_id": m.id, "meeting_title": m.title,
                "text": f"{a.task} — {a.owner}", "needs_review": a.confidence < 0.7,
            })
    events.sort(key=lambda e: e["at"], reverse=True)
    return events[:limit]


@router.get("/tasks")
def tasks(db: Session = Depends(get_db)):
    meetings = {m.id: m for m in db.scalars(select(Meeting))}
    out = []
    for a in db.scalars(select(ActionItem)):
        m = meetings.get(a.meeting_id)
        if m is None:
            continue
        out.append({
            "id": a.id, "meeting_id": m.id, "meeting_title": m.title,
            "at": _at(m, a.t), "task": a.task, "owner": a.owner,
            "deadline": a.deadline, "priority": a.priority, "status": a.status,
            "needs_review": a.confidence < 0.7,
        })
    out.sort(key=lambda x: x["at"], reverse=True)
    return out


@router.get("/decisions")
def decisions(db: Session = Depends(get_db)):
    meetings = {m.id: m for m in db.scalars(select(Meeting))}
    out = []
    for d in db.scalars(select(Decision)):
        m = meetings.get(d.meeting_id)
        if m is None:
            continue
        out.append({
            "id": d.id, "meeting_id": m.id, "meeting_title": m.title,
            "at": _at(m, d.t), "decision": d.decision, "reason": d.reason,
            "approved_by": d.approved_by, "needs_review": d.confidence < 0.7,
        })
    out.sort(key=lambda x: x["at"], reverse=True)
    return out
