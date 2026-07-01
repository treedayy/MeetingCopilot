"""Meeting memory: search everything ever discussed, across all meetings."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ActionItem, Concept, Decision, Meeting, Segment

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def search(q: str, db: Session = Depends(get_db)):
    q = q.strip()
    if not q:
        return {"query": q, "results": []}
    like = f"%{q}%"
    titles = {m.id: m.title for m in db.scalars(select(Meeting))}
    results = []

    for s in db.scalars(select(Segment).where(Segment.text.ilike(like)).order_by(Segment.t).limit(30)):
        results.append({
            "kind": "transcript", "meeting_id": s.meeting_id,
            "meeting_title": titles.get(s.meeting_id, "?"), "t": s.t,
            "text": f"{s.speaker}: {s.text}",
        })
    for d in db.scalars(select(Decision).where(Decision.decision.ilike(like)).limit(15)):
        results.append({
            "kind": "decision", "meeting_id": d.meeting_id,
            "meeting_title": titles.get(d.meeting_id, "?"), "t": d.t,
            "text": d.decision,
        })
    for a in db.scalars(select(ActionItem).where(ActionItem.task.ilike(like)).limit(15)):
        results.append({
            "kind": "action", "meeting_id": a.meeting_id,
            "meeting_title": titles.get(a.meeting_id, "?"), "t": a.t,
            "text": f"{a.task} — {a.owner} ({a.status})",
        })
    for c in db.scalars(select(Concept).where(Concept.term.ilike(like)).limit(15)):
        results.append({
            "kind": "concept", "meeting_id": c.meeting_id,
            "meeting_title": titles.get(c.meeting_id, "?"), "t": c.first_t,
            "text": f"{c.term}: {c.what[:200]}",
        })
    return {"query": q, "results": results}


@router.get("/open-blockers")
def open_blockers(db: Session = Depends(get_db)):
    """All open high-priority action items across every meeting."""
    titles = {m.id: m.title for m in db.scalars(select(Meeting))}
    items = db.scalars(
        select(ActionItem).where(ActionItem.status == "open").order_by(ActionItem.t.desc()).limit(50)
    ).all()
    return [
        {"meeting_id": a.meeting_id, "meeting_title": titles.get(a.meeting_id, "?"),
         "task": a.task, "owner": a.owner, "deadline": a.deadline, "priority": a.priority}
        for a in items
    ]
