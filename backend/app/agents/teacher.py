"""Teacher agent: the Concept Tutor 2.0.

Explains every technical concept at three depths, tracks what the user has
already learned (via the persistent profile) to avoid re-teaching, and links
each concept to previous meetings where it came up.
"""

from sqlalchemy import select

from ..concept_library import find_concepts
from ..models import Concept, Meeting, UserProfile
from ..state import MeetingState
from .base import Agent, AgentServices


def derive_interview(entry: dict) -> str:
    """A crisp interview-style answer assembled from the concept's fields."""
    first_advanced = entry.get("advanced", "").split(". ")[0]
    pitfall = entry.get("pitfalls", "").split(",")[0]
    parts = [f"Start with the definition: “{entry.get('what', '')}”"]
    if first_advanced:
        parts.append(f"Show depth: “{first_advanced}.”")
    if pitfall:
        parts.append(f"Stand out by naming a pitfall: “{pitfall}.”")
    return " ".join(parts)


class TeacherAgent(Agent):
    name = "teacher"

    async def tick(self, state: MeetingState, new: list[dict], services: AgentServices) -> list[dict]:
        events: list[dict] = []
        known_tech = {k.lower() for k in state.profile.get("known_technologies", [])}
        learned = state.profile.get("learned", {})

        for seg in new:
            for entry in find_concepts(seg["text"]):
                term = entry["term"]
                key = term.lower()
                if key in state.concepts:
                    state.concepts[key]["mentions"] += 1
                    events.append({
                        "type": "concept_mention", "term": term,
                        "mentions": state.concepts[key]["mentions"], "t": seg["t"],
                    })
                    continue

                prior = self._prior_meetings(state, key, services)
                seen_before = learned.get(key, {}).get("count", 0)
                payload = {
                    "type": "concept",
                    "t": seg["t"],
                    "first_t": seg["t"],
                    "mentions": 1,
                    "term": term,
                    "category": entry["category"],
                    "what": entry["what"],
                    "why_matters": entry["why_matters"],
                    "why_now": f"{seg['speaker']} brought this up: “{seg['text'][:140]}”",
                    "beginner": entry["beginner"],
                    "intermediate": entry.get("intermediate", entry["what"]),
                    "advanced": entry["advanced"],
                    "interview": derive_interview(entry),
                    "analogy": entry["analogy"],
                    "pitfalls": entry["pitfalls"],
                    "related": entry["related"],
                    "known": key in known_tech or seen_before >= 3,
                    "prior_meetings": prior,
                }
                state.concepts[key] = payload
                events.append(payload)
                state.speakers[seg["speaker"]].topics.add(term)
                self._record_learned(state, key, services)
        return events

    def _prior_meetings(self, state: MeetingState, term_key: str, services: AgentServices) -> list[dict]:
        db = services.db_factory()
        try:
            rows = db.execute(
                select(Concept.meeting_id, Meeting.title, Meeting.started_at)
                .join(Meeting, Meeting.id == Concept.meeting_id)
                .where(Concept.term.ilike(f"%{term_key}%"), Concept.meeting_id != state.meeting_id)
                .order_by(Meeting.started_at.desc())
                .limit(3)
            ).all()
            return [
                {"id": mid, "title": title, "date": started.strftime("%b %d")}
                for mid, title, started in rows
            ]
        finally:
            db.close()

    def _record_learned(self, state: MeetingState, term_key: str, services: AgentServices) -> None:
        learned = dict(state.profile.get("learned", {}))
        entry = dict(learned.get(term_key, {"count": 0}))
        entry["count"] = entry.get("count", 0) + 1
        entry["last_meeting_id"] = state.meeting_id
        learned[term_key] = entry
        state.profile["learned"] = learned
        db = services.db_factory()
        try:
            profile = db.get(UserProfile, "default")
            if profile is not None:
                profile.learned = learned
                db.commit()
        finally:
            db.close()
