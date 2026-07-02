"""Risk agent: surfaces emerging risks and blockers as they happen, and runs
the missing-information detector against the discussion checklist."""

from ..state import CHECKLIST, MeetingState
from .base import Agent, AgentServices

GAP_ADVICE = {
    "owner assignment": "Nobody has explicitly taken ownership yet — decisions without owners tend to stall.",
    "timeline": "No timeline has been discussed. Ask what the target date is.",
    "rollback plan": "No rollback plan has been mentioned. Ask: if this goes wrong in production, how do we get back?",
    "testing strategy": "Testing hasn't come up. How will this be validated before launch?",
    "monitoring / observability": "No monitoring strategy discussed — how will you know this is working after it ships?",
    "security": "Security hasn't been discussed. If this touches production data, ask how auth and data protection are handled.",
    "customer impact": "Customer impact hasn't been discussed — who is affected and do they need comms?",
    "success metrics": "No success metrics defined. What number tells you this worked?",
    "risk mitigation": "Risks haven't been discussed explicitly. What's the worst case here?",
}


class RiskAgent(Agent):
    name = "risk"

    async def tick(self, state: MeetingState, new: list[dict], services: AgentServices) -> list[dict]:
        events: list[dict] = []
        state.update_checklist()

        for seg in new:
            events += self._segment_risks(state, seg)

        # Missing-info detection: after enough discussion, flag uncovered
        # dimensions once, most fundamental first.
        if len(state.segments) >= 14:
            order = ["owner assignment", "rollback plan", "security", "timeline", "testing strategy",
                     "monitoring / observability", "success metrics", "customer impact", "risk mitigation"]
            for dim in order:
                if not state.checklist[dim] and dim not in state.gaps_flagged and len(state.gaps_flagged) < (len(state.segments) - 8) // 6:
                    state.gaps_flagged.add(dim)
                    events.append({
                        "type": "coach", "t": state.last_t(), "kind": "gap",
                        "text": GAP_ADVICE.get(dim, f"{dim} has not been discussed."),
                        "urgency": "normal", "confidence": 0.75,
                    })
        return events

    def _segment_risks(self, state: MeetingState, seg: dict) -> list[dict]:
        lower = seg["text"].lower()
        found: list[tuple[str, str, float]] = []
        if "blocker" in lower or "blocked" in lower:
            found.append(("alert", "A blocker was just mentioned — make sure it lands in Action Items with an owner.", 0.9))
        if any(w in lower for w in ("worried", "concern", "concerned", "afraid")):
            topic = next((c["term"] for c in state.concepts.values() if c["term"].lower() in lower), state.topic or "this topic")
            found.append(("thought", f"The team seems worried about {topic}. Worth asking what would reduce the risk.", 0.7))
        if any(w in lower for w in ("scalab", "throughput", "bottleneck")):
            found.append(("thought", "Scalability is on their minds. A good question: what's the expected peak load, in numbers?", 0.7))
        if "migrat" in lower and "rollback" not in lower:
            found.append(("thought", "A migration is being discussed. Migrations need a rollback plan — check if one exists.", 0.65))
        if any(w in lower for w in ("compromised", "vulnerab", "incident")):
            found.append(("alert", "A security scenario was raised — confirm it becomes a tracked risk or action item.", 0.8))
        if "slip" in lower or "behind schedule" in lower or "two weeks" in lower and "sitting" in lower:
            found.append(("alert", "Schedule risk: something has been waiting or may slip. Confirm the new expected date.", 0.6))

        events = []
        for kind, text, confidence in found:
            if text not in state.insight_texts:
                state.insight_texts.add(text)
                events.append({"type": "insight", "t": seg["t"], "kind": kind, "text": text, "confidence": confidence})
                if kind == "alert":
                    events += self._graph_for_risk(state, seg, text)
        return events

    def _graph_for_risk(self, state: MeetingState, seg: dict, text: str) -> list[dict]:
        key = f"risk:{text.lower()[:32]}"
        if key in state.graph_nodes:
            return []
        node = {"key": key, "label": text[:40], "kind": "risk", "t": seg["t"]}
        state.graph_nodes[key] = node
        edges = []
        speaker_key = f"person:{seg['speaker'].lower()}"
        if speaker_key in state.graph_nodes:
            edge = (speaker_key, key, "creates")
            state.graph_edges.add(edge)
            edges.append({"source": speaker_key, "target": key, "relation": "creates", "t": seg["t"]})
        return [{"type": "graph", "nodes": [node], "edges": edges, "t": seg["t"]}]
