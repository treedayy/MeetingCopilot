"""Coordinator: runs every specialized agent on each reasoning tick and merges
their output into one coherent event stream.

Order matters: the teacher populates concepts before the PM links decisions to
them; risk runs before the coach so gaps become coaching; the documentarian
updates the topic before the coach reasons about timing.
"""

import logging
import re

from ..concept_library import find_concepts
from ..state import MeetingState
from .architect import ArchitectAgent
from .base import Agent, AgentServices
from .coach import CoachAgent
from .documentarian import DocumentarianAgent
from .memory import MemoryAgent
from .pm import PMAgent
from .questions import QuestionAgent
from .risk import RiskAgent
from .teacher import TeacherAgent

logger = logging.getLogger(__name__)

PROJECT_RE = re.compile(r"\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b")  # CamelCase names


class Coordinator:
    def __init__(self, services: AgentServices):
        self.services = services
        self.agents: list[Agent] = [
            TeacherAgent(),
            PMAgent(),
            RiskAgent(),
            ArchitectAgent(),
            DocumentarianAgent(),
            MemoryAgent(),
            QuestionAgent(),
            CoachAgent(),
        ]

    async def tick(self, state: MeetingState) -> list[dict]:
        new = state.new_segments()
        if not new and state.tick % 6 != 0:
            state.tick += 1
            return []  # nothing changed; re-evaluate occasionally anyway

        events: list[dict] = []
        # Prologue: shared bookkeeping every agent depends on.
        for seg in new:
            state.update_speaker(seg["t"], seg["speaker"], seg["text"], self.services.roles)
            events += self._base_graph(state, seg)
        state.update_agreement()

        for agent in self.agents:
            try:
                events += await agent.tick(state, new, self.services)
            except Exception:
                logger.exception("agent %s failed on tick %d", agent.name, state.tick)

        # Person cards refresh whenever someone spoke.
        for seg in {s["speaker"] for s in new}:
            events.append(self._person_event(state, seg))

        state.processed_upto = len(state.segments)
        state.tick += 1
        events.append(state.health_payload())
        return events

    # -- conversation graph base layer: people, technologies, projects ------ #

    def _base_graph(self, state: MeetingState, seg: dict) -> list[dict]:
        new_nodes, new_edges = [], []

        def add_node(key: str, label: str, kind: str):
            if key not in state.graph_nodes:
                node = {"key": key, "label": label, "kind": kind, "t": seg["t"]}
                state.graph_nodes[key] = node
                new_nodes.append(node)

        def add_edge(src: str, dst: str, rel: str):
            edge = (src, dst, rel)
            if edge not in state.graph_edges and src != dst:
                state.graph_edges.add(edge)
                new_edges.append({"source": src, "target": dst, "relation": rel, "t": seg["t"]})

        speaker_key = f"person:{seg['speaker'].lower()}"
        add_node(speaker_key, seg["speaker"], "person")

        for entry in find_concepts(seg["text"]):
            tech_key = f"tech:{entry['term'].lower()}"
            add_node(tech_key, entry["term"], "technology")
            add_edge(speaker_key, tech_key, "discussed")

        for project in PROJECT_RE.findall(seg["text"]):
            project_key = f"project:{project.lower()}"
            add_node(project_key, project, "project")
            add_edge(speaker_key, project_key, "works on")
            for entry in find_concepts(seg["text"]):
                add_edge(project_key, f"tech:{entry['term'].lower()}", "uses")

        if new_nodes or new_edges:
            return [{"type": "graph", "nodes": new_nodes, "edges": new_edges, "t": seg["t"]}]
        return []

    def _person_event(self, state: MeetingState, name: str) -> dict:
        stats = state.speakers[name]
        total_words = max(1, sum(s.words for s in state.speakers.values()))
        total_decisions = max(1, sum(s.decisions for s in state.speakers.values()))
        sentiment = "neutral"
        if stats.negative > stats.positive + 1:
            sentiment = "concerned"
        elif stats.positive > stats.negative + 1:
            sentiment = "positive"
        return {
            "type": "person",
            "name": stats.name,
            "role": stats.role,
            "expertise": sorted(stats.topics)[:6],
            "segments_count": stats.segments,
            "words": stats.words,
            "sentiment": sentiment,
            "influence": round(0.6 * (stats.words / total_words) + 0.4 * (stats.decisions / total_decisions), 2),
        }
