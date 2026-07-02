"""Documentation agent: maintains the evolving narrative — current topic,
topic shifts, and the running "what is happening" understanding. When an LLM
is available it periodically enriches the whole state with a structured pass."""

import logging

from .. import llm
from ..state import MeetingState
from .base import Agent, AgentServices

logger = logging.getLogger(__name__)


class DocumentarianAgent(Agent):
    name = "documentarian"

    async def tick(self, state: MeetingState, new: list[dict], services: AgentServices) -> list[dict]:
        if not new:
            return []
        events: list[dict] = []
        events += self._update_topic(state)
        if state.tick % 2 == 0 or events:  # summarize regularly and on topic shifts
            events += self._understanding(state, new)
        if services.llm_enabled and state.tick % 3 == 0:
            try:
                events += await self._llm_enrich(state)
            except Exception:
                logger.exception("LLM enrichment failed; heuristic output stands")
        return events

    # -- topic tracking -------------------------------------------------- #

    def _current_topic(self, state: MeetingState) -> tuple[str, float]:
        window = state.window(8)
        if not window:
            return "", 0.0
        text = " ".join(s["text"].lower() for s in window)
        concept_hits = [(c["term"], text.count(c["term"].split(" ")[0].lower())) for c in state.concepts.values()]
        concept_hits = [(term, n) for term, n in concept_hits if n > 0]
        if concept_hits:
            concept_hits.sort(key=lambda kv: -kv[1])
            top, n = concept_hits[0]
            return top, min(0.95, 0.5 + n * 0.12)
        keywords = state.keywords(window, 2)
        if keywords:
            return " / ".join(keywords), 0.45
        return "general discussion", 0.3

    def _update_topic(self, state: MeetingState) -> list[dict]:
        topic, confidence = self._current_topic(state)
        if not topic:
            return []
        previous = state.topic
        state.topic = topic
        state.topic_confidence = confidence
        if previous and topic != previous:
            t = state.last_t()
            state.topic_history.append((t, topic))
            shift_conf = round(min(0.9, confidence + 0.1), 2)
            text = f"Topic shift: the discussion moved from “{previous}” to “{topic}”."
            if text not in state.insight_texts:
                state.insight_texts.add(text)
                return [{"type": "insight", "t": t, "kind": "topic", "text": text, "confidence": shift_conf},
                        {"type": "topic_shift", "t": t, "from": previous, "to": topic, "confidence": shift_conf}]
        elif not previous:
            state.topic_history.append((state.last_t(), topic))
        return []

    # -- narrative -------------------------------------------------------- #

    def _understanding(self, state: MeetingState, new: list[dict]) -> list[dict]:
        t = state.last_t()
        parts = [f"The discussion is currently about {state.topic or 'the project'}."]
        recent_decision = next((d for d in reversed(state.decisions) if d["t"] >= new[0]["t"]), None)
        if recent_decision:
            parts.append(f"A decision was just made: “{recent_decision['decision'][:120]}”")
        recent_action = next((a for a in reversed(state.actions) if a["t"] >= new[0]["t"]), None)
        if recent_action:
            parts.append(f"New action item: {recent_action['task'][:100]} (owner: {recent_action['owner']}).")
        if state.agreement < -0.25:
            parts.append("There is visible disagreement — positions haven't converged yet.")
        elif state.agreement > 0.35:
            parts.append("The room is aligned on this.")
        lead = max(state.speakers.values(), key=lambda s: s.words).name if state.speakers else None
        if lead:
            parts.append(f"{lead} is doing most of the talking so far.")
        return [{"type": "understanding", "t": t, "text": " ".join(parts)}]

    # -- LLM enrichment ---------------------------------------------------- #

    SYSTEM_PROMPT = """You are the coordinator of Meeting Copilot, silently attending a meeting for one participant. Given the recent transcript and extracted state, respond ONLY with JSON:
{
  "understanding": "2-4 sentences: what is happening right now, what is being decided, why it matters",
  "insights": [{"kind": "thought|alert|reminder", "text": "...", "confidence": 0.0-1.0}],
  "questions": [{"text": "...", "category": "clarifying|strategic|architecture|risk|timeline|product|engineering", "score": 0.0-1.0, "rationale": "..."}],
  "concepts": [{"term": "...", "category": "...", "what": "...", "why_matters": "...", "why_now": "...", "beginner": "...", "intermediate": "...", "advanced": "...", "interview": "...", "analogy": "...", "pitfalls": "...", "related": ["..."]}]
}
Only NEW concepts not in the known list. Insights are your private running thoughts with honest confidence."""

    async def _llm_enrich(self, state: MeetingState) -> list[dict]:
        window = state.window(14)
        transcript = "\n".join(f"[{s['t']:.0f}s] {s['speaker']}: {s['text']}" for s in window)
        known = {
            "concepts": [c["term"] for c in state.concepts.values()],
            "topic": state.topic,
            "decisions": [d["decision"][:80] for d in state.decisions],
        }
        data = await llm.complete_json(self.SYSTEM_PROMPT, f"STATE: {known}\n\nTRANSCRIPT:\n{transcript}")
        if not data:
            return []
        t = state.last_t()
        events: list[dict] = []
        if data.get("understanding"):
            events.append({"type": "understanding", "t": t, "text": data["understanding"]})
        for ins in data.get("insights", []):
            if ins.get("text") and ins["text"] not in state.insight_texts:
                state.insight_texts.add(ins["text"])
                events.append({"type": "insight", "t": t, "kind": ins.get("kind", "thought"),
                               "text": ins["text"], "confidence": float(ins.get("confidence", 0.6))})
        for q in data.get("questions", []):
            if q.get("text") and not any(x["text"] == q["text"] for x in state.questions):
                payload = {"type": "question", "t": t, "text": q["text"], "category": q.get("category", "clarifying"),
                           "score": float(q.get("score", 0.5)), "rationale": q.get("rationale", "")}
                state.questions.append(payload)
                events.append(payload)
        for c in data.get("concepts", []):
            key = c.get("term", "").lower()
            if not key or key in state.concepts:
                continue
            payload = {
                "type": "concept", "t": t, "first_t": t, "mentions": 1, "known": False, "prior_meetings": [],
                **{f: c.get(f, "") for f in ("term", "category", "what", "why_matters", "why_now",
                                             "beginner", "intermediate", "advanced", "interview",
                                             "analogy", "pitfalls")},
                "related": c.get("related", []),
            }
            state.concepts[key] = payload
            events.append(payload)
        return events
