"""Question agent: generates the strategic questions an experienced engineer
would ask right now, ranked by usefulness, deduplicated against history."""

from ..state import MeetingState
from .base import Agent, AgentServices

TEMPLATES = [
    ("risk", 0.85, "What's our rollback plan if the {x} change causes issues in production?"),
    ("architecture", 0.8, "How does {x} fit into our current architecture — which components have to change?"),
    ("timeline", 0.75, "What's the realistic target date for the {x} work, and what's most likely to slip it?"),
    ("clarifying", 0.7, "Could we define what success looks like for {x} — how will we measure it?"),
    ("strategic", 0.65, "Is {x} the long-term direction, or a stopgap we expect to replace?"),
    ("engineering", 0.6, "Who has operated {x} in production before — do we need a spike to de-risk it?"),
]


class QuestionAgent(Agent):
    name = "questions"

    async def tick(self, state: MeetingState, new: list[dict], services: AgentServices) -> list[dict]:
        if not new or state.tick % 2 != 0:
            return []
        window_text = " ".join(s["text"].lower() for s in state.window(8))
        live_topics = [c["term"] for c in state.concepts.values() if c["term"].split(" ")[0].lower() in window_text]
        if not live_topics and state.topic:
            live_topics = [state.topic]

        events = []
        for i, topic in enumerate(live_topics[:2]):
            category, score, template = TEMPLATES[(len(state.questions) + i) % len(TEMPLATES)]
            text = template.format(x=topic)
            if any(q["text"] == text for q in state.questions):
                continue
            payload = {
                "type": "question", "t": state.last_t(), "text": text, "category": category,
                "score": score,
                "rationale": f"{topic} is actively being discussed; this is the question an experienced engineer would raise now.",
            }
            state.questions.append(payload)
            events.append(payload)
        return events
