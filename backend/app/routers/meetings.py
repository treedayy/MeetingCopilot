from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    ActionItem, CoachTip, Concept, Decision, Diagram, GraphEdge, GraphNode,
    HealthSnapshot, Insight, Meeting, MemoryItem, Person, RetrievalItem,
    Segment, SuggestedQuestion, Understanding,
)
from ..seed import seed_demo_history
from ..simulator import DEMO_TITLE

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


class CreateMeeting(BaseModel):
    title: str = ""
    mode: str = "demo"  # demo | live


@router.post("")
def create_meeting(body: CreateMeeting, db: Session = Depends(get_db)):
    seeded = False
    if body.mode == "demo":
        seeded = seed_demo_history(db)  # give the memory timeline history to draw on
    title = body.title or (DEMO_TITLE if body.mode == "demo" else "Live meeting")
    meeting = Meeting(title=title, mode=body.mode)
    db.add(meeting)
    db.commit()
    return {"id": meeting.id, "title": meeting.title, "mode": meeting.mode, "seeded_history": seeded}


@router.get("")
def list_meetings(db: Session = Depends(get_db)):
    meetings = db.scalars(select(Meeting).order_by(Meeting.started_at.desc())).all()
    out = []
    for m in meetings:
        out.append({
            "id": m.id, "title": m.title, "mode": m.mode, "status": m.status,
            "started_at": m.started_at.isoformat(),
            "ended_at": m.ended_at.isoformat() if m.ended_at else None,
            "has_report": bool(m.report_md),
            "segments": db.scalar(select(Segment.id).where(Segment.meeting_id == m.id).limit(1)) is not None,
        })
    return out


def _meeting_or_404(db: Session, meeting_id: str) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(404, "meeting not found")
    return meeting


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    m = _meeting_or_404(db, meeting_id)
    mid = m.id
    return {
        "id": m.id, "title": m.title, "mode": m.mode, "status": m.status,
        "started_at": m.started_at.isoformat(),
        "ended_at": m.ended_at.isoformat() if m.ended_at else None,
        "has_report": bool(m.report_md),
        "segments": [
            {"id": s.id, "t": s.t, "speaker": s.speaker, "text": s.text}
            for s in db.scalars(select(Segment).where(Segment.meeting_id == mid).order_by(Segment.t))
        ],
        "understandings": [
            {"t": u.t, "text": u.text}
            for u in db.scalars(select(Understanding).where(Understanding.meeting_id == mid).order_by(Understanding.t))
        ],
        "insights": [
            {"t": i.t, "kind": i.kind, "text": i.text, "confidence": i.confidence}
            for i in db.scalars(select(Insight).where(Insight.meeting_id == mid).order_by(Insight.t))
        ],
        "concepts": [
            {"term": c.term, "category": c.category, "what": c.what, "why_matters": c.why_matters,
             "why_now": c.why_now, "beginner": c.beginner, "intermediate": c.intermediate,
             "advanced": c.advanced, "interview": c.interview, "analogy": c.analogy,
             "pitfalls": c.pitfalls, "related": c.related, "mentions": c.mentions, "first_t": c.first_t,
             "known": c.known, "prior_meetings": c.prior_meetings}
            for c in db.scalars(select(Concept).where(Concept.meeting_id == mid).order_by(Concept.first_t))
        ],
        "questions": [
            {"id": q.id, "t": q.t, "text": q.text, "category": q.category, "score": q.score, "rationale": q.rationale}
            for q in db.scalars(select(SuggestedQuestion).where(SuggestedQuestion.meeting_id == mid).order_by(SuggestedQuestion.score.desc()))
        ],
        "actions": [
            {"id": a.id, "t": a.t, "task": a.task, "owner": a.owner, "deadline": a.deadline,
             "priority": a.priority, "status": a.status, "dependencies": a.dependencies,
             "confidence": a.confidence}
            for a in db.scalars(select(ActionItem).where(ActionItem.meeting_id == mid).order_by(ActionItem.t))
        ],
        "decisions": [
            {"id": d.id, "t": d.t, "decision": d.decision, "reason": d.reason,
             "alternatives": d.alternatives, "tradeoffs": d.tradeoffs, "approved_by": d.approved_by,
             "confidence": d.confidence}
            for d in db.scalars(select(Decision).where(Decision.meeting_id == mid).order_by(Decision.t))
        ],
        "coach_tips": [
            {"t": c.t, "kind": c.kind, "text": c.text, "urgency": c.urgency, "confidence": c.confidence}
            for c in db.scalars(select(CoachTip).where(CoachTip.meeting_id == mid).order_by(CoachTip.t))
        ],
        "memory_items": [
            {"t": m2.t, "kind": m2.kind, "text": m2.text, "ref_meeting_id": m2.ref_meeting_id,
             "ref_meeting_title": m2.ref_meeting_title, "confidence": m2.confidence}
            for m2 in db.scalars(select(MemoryItem).where(MemoryItem.meeting_id == mid).order_by(MemoryItem.t))
        ],
        "retrievals": [
            {"t": r.t, "source": r.source, "title": r.title, "summary": r.summary, "ref": r.ref}
            for r in db.scalars(select(RetrievalItem).where(RetrievalItem.meeting_id == mid).order_by(RetrievalItem.t))
        ],
        "diagrams": [
            {"t": d2.t, "version": d2.version, "title": d2.title, "mermaid": d2.mermaid}
            for d2 in db.scalars(select(Diagram).where(Diagram.meeting_id == mid).order_by(Diagram.version))
        ],
        "health": [
            {"t": h.t, "topic": h.topic, "topic_confidence": h.topic_confidence, "agreement": h.agreement,
             "engagement": h.engagement, "balance": h.balance, "completeness": h.completeness,
             "progress": h.progress}
            for h in db.scalars(select(HealthSnapshot).where(HealthSnapshot.meeting_id == mid).order_by(HealthSnapshot.t))
        ],
        "people": [
            {"name": p.name, "role": p.role, "expertise": p.expertise, "segments_count": p.segments_count,
             "words": p.words, "sentiment": p.sentiment, "influence": p.influence}
            for p in db.scalars(select(Person).where(Person.meeting_id == mid).order_by(Person.words.desc()))
        ],
        "graph": {
            "nodes": [
                {"key": n.key, "label": n.label, "kind": n.kind, "t": n.t}
                for n in db.scalars(select(GraphNode).where(GraphNode.meeting_id == mid))
            ],
            "edges": [
                {"source": e.source, "target": e.target, "relation": e.relation, "t": e.t}
                for e in db.scalars(select(GraphEdge).where(GraphEdge.meeting_id == mid))
            ],
        },
    }


@router.get("/{meeting_id}/report")
def get_report(meeting_id: str, db: Session = Depends(get_db)):
    m = _meeting_or_404(db, meeting_id)
    return {"id": m.id, "title": m.title, "report_md": m.report_md}


class ActionUpdate(BaseModel):
    status: str  # open | done


@router.patch("/{meeting_id}/actions/{action_id}")
def update_action(meeting_id: str, action_id: str, body: ActionUpdate, db: Session = Depends(get_db)):
    action = db.get(ActionItem, action_id)
    if action is None or action.meeting_id != meeting_id:
        raise HTTPException(404, "action item not found")
    action.status = body.status
    db.commit()
    return {"id": action.id, "status": action.status}


@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: str, db: Session = Depends(get_db)):
    m = _meeting_or_404(db, meeting_id)
    for model in (Segment, Understanding, Insight, Concept, SuggestedQuestion, ActionItem, Decision,
                  Person, GraphNode, GraphEdge, CoachTip, MemoryItem, RetrievalItem, Diagram, HealthSnapshot):
        for row in db.scalars(select(model).where(model.meeting_id == meeting_id)):
            db.delete(row)
    db.delete(m)
    db.commit()
    return {"ok": True}
