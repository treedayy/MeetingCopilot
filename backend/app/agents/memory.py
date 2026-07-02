"""Memory agent: connects the current discussion to organizational history.

- "Redis has come up in 3 previous meetings, most recently on Jun 18."
- "This decision may contradict one made in a previous meeting."
- Retrieves knowledge-base docs and past reports when entities are mentioned.
"""

import re

from sqlalchemy import func, select

from ..concept_library import find_concepts
from ..models import Decision, Meeting, Segment
from ..retrieval import search_all
from ..state import MeetingState
from .base import Agent, AgentServices


def _subject_terms(text: str) -> set[str]:
    """The technical subjects a decision is about: its concepts plus each
    concept's related terms, so 'hybrid JWT' and 'session auth vs OAuth'
    resolve to the same subject (authentication)."""
    terms: set[str] = set()
    for entry in find_concepts(text):
        terms.add(entry["term"].lower())
        terms.update(r.lower() for r in entry.get("related", []))
    return terms

# A new decision "contradicts" an old one when they share a subject but pull
# in opposite directions (keep/stay vs move/adopt/migrate).
KEEP_WORDS = ("keep", "stay with", "stick with", "revisit", "not move", "hold off", "defer")
CHANGE_WORDS = ("go with", "adopt", "move to", "migrate", "switch", "moving to", "replace")


class MemoryAgent(Agent):
    name = "memory"

    async def tick(self, state: MeetingState, new: list[dict], services: AgentServices) -> list[dict]:
        events: list[dict] = []
        events += self._entity_history(state, services)
        events += self._decision_history(state, services)
        events += self._retrieve(state)
        return events

    # -- "this has come up before" ---------------------------------------- #

    def _entity_history(self, state: MeetingState, services: AgentServices) -> list[dict]:
        events = []
        candidates = [c["term"] for c in state.concepts.values()]
        candidates += [n["label"] for n in state.graph_nodes.values() if n["kind"] == "project"]
        db = services.db_factory()
        try:
            for term in candidates:
                key = term.lower()
                if key in state.memory_checked:
                    continue
                state.memory_checked.add(key)
                probe = key.split(" (")[0].split(" ")[0]  # "JWT (JSON Web Token)" -> "jwt"
                if len(probe) < 3:
                    continue
                rows = db.execute(
                    select(Segment.meeting_id, func.count())
                    .where(Segment.text.ilike(f"%{probe}%"), Segment.meeting_id != state.meeting_id)
                    .group_by(Segment.meeting_id)
                ).all()
                if not rows:
                    continue
                latest = db.scalars(
                    select(Meeting)
                    .where(Meeting.id.in_([r[0] for r in rows]))
                    .order_by(Meeting.started_at.desc())
                ).first()
                if latest is None:
                    continue
                count = len(rows)
                events.append({
                    "type": "memory", "t": state.last_t(), "kind": "mention",
                    "text": f"{term} has come up in {count} previous meeting{'s' if count != 1 else ''} — "
                            f"most recently in “{latest.title}” ({latest.started_at:%b %d}).",
                    "ref_meeting_id": latest.id, "ref_meeting_title": latest.title,
                    "confidence": 0.95,
                })
        finally:
            db.close()
        return events

    # -- related and contradicting past decisions -------------------------- #

    def _decision_history(self, state: MeetingState, services: AgentServices) -> list[dict]:
        fresh = [d for d in state.decisions if f"dec:{d['_key']}" not in state.memory_checked]
        if not fresh:
            return []
        events = []
        db = services.db_factory()
        try:
            past = db.execute(
                select(Decision, Meeting.title, Meeting.started_at)
                .join(Meeting, Meeting.id == Decision.meeting_id)
                .where(Decision.meeting_id != state.meeting_id)
                .order_by(Meeting.started_at.desc())
                .limit(50)
            ).all()
        finally:
            db.close()
        for decision in fresh:
            state.memory_checked.add(f"dec:{decision['_key']}")
            new_words = set(re.findall(r"[a-z]{4,}", decision["decision"].lower()))
            new_subjects = _subject_terms(decision["decision"])
            new_lower = decision["decision"].lower()
            contradiction_hit = None
            related_hit = None
            for old, title, started in past:
                old_lower = old.decision.lower()
                old_words = set(re.findall(r"[a-z]{4,}", old_lower))
                shared_subjects = new_subjects & _subject_terms(old.decision)
                if not shared_subjects and len(new_words & old_words) < 4:
                    continue
                contradiction = (
                    any(w in old_lower for w in KEEP_WORDS) and any(w in new_lower for w in CHANGE_WORDS)
                ) or (
                    any(w in new_lower for w in KEEP_WORDS) and any(w in old_lower for w in CHANGE_WORDS)
                )
                if contradiction and contradiction_hit is None:
                    contradiction_hit = (old, title, started)
                elif related_hit is None:
                    related_hit = (old, title, started)
            # One historical link per new decision; contradictions win.
            if contradiction_hit:
                old, title, started = contradiction_hit
                events.append({
                    "type": "memory", "t": state.last_t(), "kind": "contradiction",
                    "text": f"This may contradict a decision from “{title}” ({started:%b %d}): "
                            f"“{old.decision[:140]}”. Worth confirming the old decision is superseded.",
                    "ref_meeting_id": old.meeting_id, "ref_meeting_title": title,
                    "confidence": 0.6,
                })
            elif related_hit:
                old, title, started = related_hit
                events.append({
                    "type": "memory", "t": state.last_t(), "kind": "related_decision",
                    "text": f"Related decision in “{title}” ({started:%b %d}): “{old.decision[:140]}”",
                    "ref_meeting_id": old.meeting_id, "ref_meeting_title": title,
                    "confidence": 0.7,
                })
        return events

    # -- knowledge retrieval ------------------------------------------------ #

    def _retrieve(self, state: MeetingState) -> list[dict]:
        events = []
        candidates = [n["label"] for n in state.graph_nodes.values() if n["kind"] in ("project", "technology")]
        for label in candidates:
            key = f"ret:{label.lower()}"
            if key in state.retrieval_checked:
                continue
            state.retrieval_checked.add(key)
            probe = label.split(" (")[0]
            for result in search_all(probe, limit_per_provider=1):
                if result.ref == state.meeting_id:
                    continue
                events.append({
                    "type": "retrieval", "t": state.last_t(), "source": result.source,
                    "title": result.title, "summary": result.summary, "ref": result.ref,
                })
        return events
