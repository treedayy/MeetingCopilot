"""PM agent: tracks commitments — action items, owners, deadlines, decisions —
and wires them into the conversation graph (assigned_to / approved_by edges)."""

import re

from ..state import MeetingState
from .base import Agent, AgentServices

DEADLINE_RE = re.compile(
    r"\bby ((?:next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
    r"|tomorrow|eod|end of (?:the )?(?:day|week|month|sprint|quarter)"
    r"|next (?:week|sprint|month)|q[1-4])\b",
    re.IGNORECASE,
)

ACTION_RE = re.compile(
    r"\b(?:i'?ll|i will|i can|i'?m going to|let me)\s+"
    r"((?:take|handle|own|do|write|set|update|create|follow|look|draft|fix|"
    r"investigate|schedule|prepare|send|review|spike|prototype|document|talk|sync|"
    r"pair|check|migrate|benchmark|ship|open|file|escalate|confirm|add|get|have|"
    r"instrument|book|rotate|put)\b[^.!?]*)",
    re.IGNORECASE,
)

ASK_RE = re.compile(r"\b(?:can you|could you|would you)\s+([^.!?]*)", re.IGNORECASE)

DECISION_STRONG_RE = re.compile(
    r"\b(?:we decided to|decision is|we agreed to|final call is|so it'?s settled|decision recorded)\b",
    re.IGNORECASE,
)
DECISION_RE = re.compile(
    r"\b(?:we'?ll go with|let'?s go with|we'?re going with|we decided to|"
    r"decision is|let'?s use|we agreed to|we'?re moving to|final call is|"
    r"let'?s lock in|we'?ll adopt|so it'?s settled)\b",
    re.IGNORECASE,
)


class PMAgent(Agent):
    name = "pm"

    async def tick(self, state: MeetingState, new: list[dict], services: AgentServices) -> list[dict]:
        events: list[dict] = []
        for seg in new:
            events += self._actions(state, seg)
            events += self._decisions(state, seg)
        return events

    def _actions(self, state: MeetingState, seg: dict) -> list[dict]:
        events = []
        for match, owner, confidence in (
            (ACTION_RE.search(seg["text"]), seg["speaker"], 0.85),
            (ASK_RE.search(seg["text"]), "TBD", 0.6),
        ):
            if not match:
                continue
            task = match.group(1).strip().rstrip(",")
            if len(task.split()) < 3:
                continue
            dedupe = task.lower()[:60]
            if any(a["_key"] == dedupe for a in state.actions):
                continue
            deadline = DEADLINE_RE.search(seg["text"])
            lower = seg["text"].lower()
            priority = (
                "high" if any(w in lower for w in ("asap", "critical", "blocker", "urgent", "p0"))
                else "low" if "eventually" in lower or "at some point" in lower
                else "medium"
            )
            event = {
                "type": "action_item", "t": seg["t"],
                "task": task[0].upper() + task[1:], "owner": owner,
                "deadline": deadline.group(1) if deadline else "",
                "priority": priority, "status": "open", "dependencies": [],
                "confidence": confidence + (0.08 if deadline else 0.0),
                "_key": dedupe,
            }
            state.actions.append(event)
            events.append({k: v for k, v in event.items() if not k.startswith("_")})
            events += self._graph_for_action(state, event)
        return events

    def _decisions(self, state: MeetingState, seg: dict) -> list[dict]:
        if not DECISION_RE.search(seg["text"]):
            return []
        dedupe = seg["text"].lower()[:60]
        if any(d["_key"] == dedupe for d in state.decisions):
            return []
        because = re.search(r"because\s+([^.!?]*)", seg["text"], re.IGNORECASE)
        confidence = 0.95 if DECISION_STRONG_RE.search(seg["text"]) else 0.8
        if state.agreement > 0.2:
            confidence = min(0.98, confidence + 0.05)
        elif state.agreement < -0.2:
            confidence = max(0.4, confidence - 0.2)  # contested — may not stick
        event = {
            "type": "decision", "t": seg["t"], "decision": seg["text"].strip(),
            "reason": because.group(1).strip() if because else "",
            "alternatives": [], "tradeoffs": "", "approved_by": seg["speaker"],
            "confidence": round(confidence, 2), "_key": dedupe,
        }
        state.decisions.append(event)
        state.speakers[seg["speaker"]].decisions += 1
        events = [{k: v for k, v in event.items() if not k.startswith("_")}]
        events += self._graph_for_decision(state, event)
        return events

    # -- conversation graph wiring -------------------------------------- #

    def _graph_for_action(self, state: MeetingState, action: dict) -> list[dict]:
        key = f"action:{action['_key'][:32]}"
        nodes, edges = [], []
        if key not in state.graph_nodes:
            node = {"key": key, "label": action["task"][:40], "kind": "action", "t": action["t"]}
            state.graph_nodes[key] = node
            nodes.append(node)
        owner_key = f"person:{action['owner'].lower()}"
        if action["owner"] not in ("TBD", "") and owner_key in state.graph_nodes:
            edge = (key, owner_key, "assigned_to")
            if edge not in state.graph_edges:
                state.graph_edges.add(edge)
                edges.append({"source": key, "target": owner_key, "relation": "assigned_to", "t": action["t"]})
        return [{"type": "graph", "nodes": nodes, "edges": edges, "t": action["t"]}] if nodes or edges else []

    def _graph_for_decision(self, state: MeetingState, decision: dict) -> list[dict]:
        key = f"decision:{decision['_key'][:32]}"
        nodes, edges = [], []
        if key not in state.graph_nodes:
            node = {"key": key, "label": decision["decision"][:40], "kind": "decision", "t": decision["t"]}
            state.graph_nodes[key] = node
            nodes.append(node)
        approver_key = f"person:{decision['approved_by'].lower()}"
        if approver_key in state.graph_nodes:
            edge = (key, approver_key, "approved_by")
            if edge not in state.graph_edges:
                state.graph_edges.add(edge)
                edges.append({"source": key, "target": approver_key, "relation": "approved_by", "t": decision["t"]})
        # Link the decision to technologies mentioned in the same utterance.
        lower = decision["decision"].lower()
        for ckey, concept in state.concepts.items():
            if ckey in lower:
                tech_key = f"tech:{ckey}"
                if tech_key in state.graph_nodes:
                    edge = (key, tech_key, "mentions")
                    if edge not in state.graph_edges:
                        state.graph_edges.add(edge)
                        edges.append({"source": key, "target": tech_key, "relation": "mentions", "t": decision["t"]})
        return [{"type": "graph", "nodes": nodes, "edges": edges, "t": decision["t"]}] if nodes or edges else []
