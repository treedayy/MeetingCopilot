"""Coach agent: optimizes the user's participation, not just their notes.

Timing guidance, ownership/deadline nudges, participation balance, and
possible-disagreement alerts — each with honest confidence."""

from ..state import MeetingState
from .base import Agent, AgentServices


class CoachAgent(Agent):
    name = "coach"

    async def tick(self, state: MeetingState, new: list[dict], services: AgentServices) -> list[dict]:
        events: list[dict] = []
        t = state.last_t()

        def tip(key: str, kind: str, text: str, urgency: str = "normal", confidence: float = 0.7):
            if key not in state.coach_sent:
                state.coach_sent.add(key)
                events.append({"type": "coach", "t": t, "kind": kind, "text": text,
                               "urgency": urgency, "confidence": confidence})

        # Ownership: action items nobody owns.
        for action in state.actions:
            if action["owner"] in ("TBD", "", "Unassigned") and t - action["t"] > 20:
                tip(f"own:{action['_key']}", "ownership",
                    f"Nobody has taken ownership of “{action['task'][:80]}”. Good moment to ask: “Who's taking that?”",
                    urgency="high", confidence=0.8)

        # Deadline: a decision landed but no timeline has been discussed near it.
        if state.decisions and not state.checklist.get("timeline"):
            last = state.decisions[-1]
            if t - last["t"] > 15:
                tip(f"deadline:{last['_key']}", "reminder",
                    "A decision was made but the deadline is unclear. Ask: “When do we want this live?”",
                    confidence=0.7)

        # Participation: the user hasn't spoken.
        me = state.speakers.get(state.my_name)
        total_words = sum(s.words for s in state.speakers.values()) or 1
        my_share = (me.words / total_words) if me else 0.0
        if len(state.segments) >= 16 and my_share < 0.04:
            top_q = max(state.questions, key=lambda q: q["score"], default=None)
            suggestion = f" An easy entry: “{top_q['text']}”" if top_q else ""
            tip("participation", "participation",
                f"You haven't spoken yet and the discussion is {int(state.progress() * 100)}% through.{suggestion}",
                confidence=0.85)

        # Timing: a topic shift is a natural opening.
        if state.topic_history and len(state.topic_history) >= 2:
            shift_t, topic = state.topic_history[-1]
            if t - shift_t < 12:
                tip(f"timing:{topic}", "timing",
                    f"The topic just shifted to {topic} — a natural moment to jump in before positions harden.",
                    confidence=0.65)

        # Hidden disagreement.
        if state.agreement < -0.3:
            dissenters = sorted(state.speakers.values(), key=lambda s: -s.negative)[:2]
            names = " and ".join(s.name for s in dissenters if s.negative > 0)
            if names:
                tip(f"disagreement:{round(state.agreement, 1)}", "guidance",
                    f"Possible disagreement — {names} sound(s) unconvinced. Summarizing both positions out loud often unblocks this.",
                    confidence=0.5)

        # Meeting wrapping up with open questions.
        if state.progress() > 0.85:
            open_actions = [a for a in state.actions if a["owner"] in ("TBD", "Unassigned")]
            if open_actions:
                tip("wrapup", "reminder",
                    f"The meeting is wrapping up with {len(open_actions)} unowned action item(s). Raise them before everyone drops.",
                    urgency="high", confidence=0.8)
        return events
