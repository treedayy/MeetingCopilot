"""Architect agent: listens for descriptions of technical systems and
maintains a live architecture diagram (Mermaid) that evolves with the
discussion."""

import re

from ..state import MeetingState
from .base import Agent, AgentServices

# Known infrastructure entities: match phrase -> (node key, display label)
ENTITIES: dict[str, tuple[str, str]] = {
    "api gateway": ("gateway", "API Gateway"),
    "gateway": ("gateway", "API Gateway"),
    "auth service": ("auth", "Auth Service"),
    "session service": ("sessions", "Session Service"),
    "session auth": ("sessions", "Session Service"),
    "identity provider": ("idp", "Identity Provider"),
    "audit pipeline": ("audit", "Audit Pipeline"),
    "redis": ("redis", "Redis"),
    "kafka": ("kafka", "Kafka"),
    "postgres": ("postgres", "PostgreSQL"),
    "database": ("postgres", "PostgreSQL"),
    "revocation list": ("revocation", "Revocation List (Redis)"),
    "webhook": ("webhooks", "Webhook Configs"),
    "partner": ("partner", "Partner Client"),
    "partnerhub backend": ("partnerhub", "PartnerHub Backend"),
    "partnerhub": ("partnerhub", "PartnerHub"),
    "frontend": ("frontend", "Frontend"),
    "kubernetes cluster": ("k8s", "Kubernetes Cluster"),
    "staging": ("k8s", "Kubernetes Cluster"),
    "ingress": ("ingress", "Ingress Controller"),
    "downstream consumer": ("consumers", "Downstream Consumers"),
    "compliance": ("compliance", "Compliance"),
}

FLOW_VERBS = [
    (r"dual-?writ\w*", "dual-writes"),
    (r"\bhits?\b", "calls"),
    (r"\bcalls?\b", "calls"),
    (r"\bchecks?\b", "checks"),
    (r"\bvalidat\w+", "validates"),
    (r"\bfeeds?\b", "feeds"),
    (r"\bemit\w*", "emits events"),
    (r"\bpublish\w*", "publishes"),
    (r"\bconsum\w*", "consumes"),
    (r"\bstor\w+|\blive\b|\bkeep\w*\b", "stores in"),
    (r"\bcach\w+", "caches in"),
    (r"\breads?\b", "reads"),
    (r"\binstrument\w*", "traces"),
    (r"\broutes?\b", "routes to"),
]

GENERIC_SERVICE_RE = re.compile(r"\b([a-z]+) service\b")


class ArchitectAgent(Agent):
    name = "architect"

    async def tick(self, state: MeetingState, new: list[dict], services: AgentServices) -> list[dict]:
        changed = False
        latest_t = state.last_t()
        for seg in new:
            changed |= self._parse_segment(state, seg)
        if not changed:
            return []
        state.diagram_version += 1
        return [{
            "type": "diagram",
            "t": latest_t,
            "version": state.diagram_version,
            "title": "System architecture (from discussion)",
            "mermaid": self._to_mermaid(state),
        }]

    def _entities_in(self, text: str) -> list[tuple[int, str, str]]:
        """(position, key, label) for each entity mentioned, ordered by position."""
        lower = text.lower()
        found: dict[str, tuple[int, str, str]] = {}
        for phrase, (key, label) in ENTITIES.items():
            pos = lower.find(phrase)
            if pos != -1 and (key not in found or pos < found[key][0]):
                found[key] = (pos, key, label)
        for m in GENERIC_SERVICE_RE.finditer(lower):
            name = m.group(1)
            if f"{name} service" in ENTITIES:
                continue  # already covered by the curated lexicon
            key = f"{name}_svc"
            if key not in found:
                found[key] = (m.start(), key, f"{name.title()} Service")
        return sorted(found.values())

    def _verb_in(self, text: str) -> str | None:
        lower = text.lower()
        for pattern, label in FLOW_VERBS:
            if re.search(pattern, lower):
                return label
        return None

    def _parse_segment(self, state: MeetingState, seg: dict) -> bool:
        entities = self._entities_in(seg["text"])
        if len(entities) < 1:
            return False
        changed = False
        for _, key, label in entities:
            if key not in state.arch_nodes:
                state.arch_nodes[key] = label
                changed = True
        verb = self._verb_in(seg["text"])
        if verb and len(entities) >= 2:
            # Connect consecutive entities in the order they were spoken.
            for (_, src, _), (_, dst, _) in zip(entities, entities[1:]):
                edge = (src, dst, verb)
                reverse = (dst, src, verb)
                if edge not in state.arch_edges and reverse not in state.arch_edges:
                    state.arch_edges.add(edge)
                    changed = True
        return changed

    def _to_mermaid(self, state: MeetingState) -> str:
        lines = ["graph LR"]
        connected = {k for edge in state.arch_edges for k in edge[:2]}
        for key, label in state.arch_nodes.items():
            if key in connected or len(state.arch_edges) == 0:
                lines.append(f'  {key}["{label}"]')
        for src, dst, verb in sorted(state.arch_edges):
            lines.append(f"  {src} -->|{verb}| {dst}")
        return "\n".join(lines)
