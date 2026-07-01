"""The live meeting analysis engine.

One `MeetingAnalyst` instance exists per live meeting session. It consumes
transcript segments and emits typed events (understanding, concepts, questions,
action items, decisions, people, insights, knowledge-graph updates).

Two brains, one interface:
- LLM mode (ANTHROPIC_API_KEY set): a structured Claude call per analysis pass.
- Heuristic mode: pattern matching + the built-in concept library, so the whole
  product works offline and in the demo.
"""

import logging
import re
from dataclasses import dataclass, field

from . import llm
from .concept_library import find_concepts
from .config import get_settings

logger = logging.getLogger(__name__)

STOPWORDS = {
    "the", "and", "for", "that", "this", "with", "have", "will", "from", "what",
    "about", "just", "like", "them", "then", "were", "been", "they", "there",
    "would", "could", "should", "going", "think", "know", "need", "want", "make",
    "sure", "yeah", "okay", "right", "really", "actually", "into", "over", "also",
    "when", "where", "which", "than", "because", "let's", "we're", "it's", "don't",
    "that's", "some", "more", "here", "your", "before", "after", "week", "today",
}

DEADLINE_RE = re.compile(
    r"\bby ((?:next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
    r"|tomorrow|eod|end of (?:the )?(?:day|week|month|sprint|quarter)"
    r"|next (?:week|sprint|month)|q[1-4]|friday)\b",
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

ASK_RE = re.compile(
    r"\b(?:can you|could you|would you)\s+([^.!?]*)",
    re.IGNORECASE,
)

DECISION_RE = re.compile(
    r"\b(?:we'?ll go with|let'?s go with|we'?re going with|we decided to|"
    r"decision is|let'?s use|we agreed to|we'?re moving to|final call is|"
    r"let'?s lock in|we'?ll adopt|so it'?s settled)\b",
    re.IGNORECASE,
)

PROJECT_RE = re.compile(r"\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b")  # CamelCase names

NEGATIVE_WORDS = {"worried", "concern", "concerned", "risky", "risk", "problem", "blocked", "blocker", "behind", "slip", "issue", "afraid", "unfortunately", "broken", "failing"}
POSITIVE_WORDS = {"great", "good", "love", "excited", "nice", "perfect", "solid", "agree", "awesome", "happy", "confident", "works"}


@dataclass
class SpeakerStats:
    name: str
    segments: int = 0
    words: int = 0
    negative: int = 0
    positive: int = 0
    decisions: int = 0
    topics: set = field(default_factory=set)
    role: str = ""


class MeetingAnalyst:
    def __init__(self, meeting_id: str, speaker_roles: dict[str, str] | None = None):
        self.meeting_id = meeting_id
        self.settings = get_settings()
        self.segments: list[dict] = []  # {t, speaker, text}
        self.analyzed_upto = 0  # index into self.segments already deep-analyzed
        self.concepts: dict[str, dict] = {}  # term -> event payload
        self.actions: list[dict] = []
        self.decisions: list[dict] = []
        self.questions: list[dict] = []
        self.insight_texts: set[str] = set()
        self.speakers: dict[str, SpeakerStats] = {}
        self.speaker_roles = speaker_roles or {}
        self.graph_nodes: dict[str, dict] = {}
        self.graph_edges: set[tuple[str, str, str]] = set()
        self.security_reminder_sent = False

    # ------------------------------------------------------------------ #
    # Fast per-segment pass: cheap, synchronous, fires on every utterance
    # ------------------------------------------------------------------ #

    def on_segment(self, t: float, speaker: str, text: str) -> list[dict]:
        self.segments.append({"t": t, "speaker": speaker, "text": text})
        events: list[dict] = []

        stats = self.speakers.setdefault(
            speaker, SpeakerStats(name=speaker, role=self.speaker_roles.get(speaker, ""))
        )
        stats.segments += 1
        stats.words += len(text.split())
        lower = text.lower()
        stats.negative += sum(1 for w in NEGATIVE_WORDS if w in lower)
        stats.positive += sum(1 for w in POSITIVE_WORDS if w in lower)

        events += self._detect_concepts(t, speaker, text)
        events += self._detect_actions(t, speaker, text)
        events += self._detect_decisions(t, speaker, text)
        events += self._detect_insights(t, text)
        events += self._graph_updates_for_segment(speaker, text)
        events.append(self._person_event(stats))
        return events

    def _detect_concepts(self, t: float, speaker: str, text: str) -> list[dict]:
        events = []
        for entry in find_concepts(text):
            term = entry["term"]
            key = term.lower()
            if key in self.concepts:
                self.concepts[key]["mentions"] += 1
                events.append({"type": "concept_mention", "term": term, "mentions": self.concepts[key]["mentions"], "t": t})
            else:
                payload = {
                    "type": "concept",
                    "t": t,
                    "first_t": t,
                    "mentions": 1,
                    "why_now": f"{speaker} brought this up: “{text[:140]}”",
                    **{k: entry[k] for k in ("term", "category", "what", "why_matters", "beginner", "advanced", "analogy", "pitfalls", "related")},
                }
                self.concepts[key] = payload
                events.append(payload)
                self.speakers[speaker].topics.add(term)
        return events

    def _detect_actions(self, t: float, speaker: str, text: str) -> list[dict]:
        events = []
        for match, owner in [(ACTION_RE.search(text), speaker), (ASK_RE.search(text), "TBD")]:
            if not match:
                continue
            task = match.group(1).strip().rstrip(",")
            if len(task.split()) < 3:
                continue
            dedupe = task.lower()[:60]
            if any(a["_key"] == dedupe for a in self.actions):
                continue
            deadline_m = DEADLINE_RE.search(text)
            lower = text.lower()
            priority = "high" if any(w in lower for w in ("asap", "critical", "blocker", "urgent", "p0")) else ("low" if "eventually" in lower or "at some point" in lower else "medium")
            event = {
                "type": "action_item",
                "t": t,
                "task": task[0].upper() + task[1:],
                "owner": owner,
                "deadline": deadline_m.group(1) if deadline_m else "",
                "priority": priority,
                "status": "open",
                "dependencies": [],
                "_key": dedupe,
            }
            self.actions.append(event)
            events.append({k: v for k, v in event.items() if not k.startswith("_")})
        return events

    def _detect_decisions(self, t: float, speaker: str, text: str) -> list[dict]:
        if not DECISION_RE.search(text):
            return []
        dedupe = text.lower()[:60]
        if any(d["_key"] == dedupe for d in self.decisions):
            return []
        reason = ""
        because = re.search(r"because\s+([^.!?]*)", text, re.IGNORECASE)
        if because:
            reason = because.group(1).strip()
        event = {
            "type": "decision",
            "t": t,
            "decision": text.strip(),
            "reason": reason,
            "alternatives": [],
            "tradeoffs": "",
            "approved_by": speaker,
            "_key": dedupe,
        }
        self.decisions.append(event)
        self.speakers[speaker].decisions += 1
        return [{k: v for k, v in event.items() if not k.startswith("_")}]

    def _detect_insights(self, t: float, text: str) -> list[dict]:
        lower = text.lower()
        candidates: list[tuple[str, str]] = []
        if "blocker" in lower or "blocked" in lower:
            candidates.append(("alert", "A blocker was just mentioned — make sure it lands in Action Items with an owner."))
        if any(w in lower for w in ("worried", "concern", "concerned", "afraid")):
            topic = next((c["term"] for c in self.concepts.values() if c["term"].lower() in lower), "this topic")
            candidates.append(("thought", f"The team seems worried about {topic}. Worth asking what would reduce the risk."))
        if DEADLINE_RE.search(text):
            candidates.append(("reminder", "A deadline was mentioned — I've captured it; confirm the owner agrees it's realistic."))
        if any(w in lower for w in ("scalab", "scale", "load", "throughput")):
            candidates.append(("thought", "Scalability is on their minds. A good question: what's the expected peak load, in numbers?"))
        if "migrat" in lower:
            candidates.append(("thought", "A migration is being discussed. Migrations need a rollback plan — check if one exists."))
        if len(self.segments) > 12 and not self.security_reminder_sent and not any("secur" in s["text"].lower() for s in self.segments):
            self.security_reminder_sent = True
            candidates.append(("reminder", "Nobody has mentioned security yet. If this ships to production, ask how auth and data protection are handled."))
        events = []
        for kind, msg in candidates:
            if msg not in self.insight_texts:
                self.insight_texts.add(msg)
                events.append({"type": "insight", "t": t, "kind": kind, "text": msg})
        return events

    def _graph_updates_for_segment(self, speaker: str, text: str) -> list[dict]:
        new_nodes, new_edges = [], []

        def add_node(key: str, label: str, kind: str):
            if key not in self.graph_nodes:
                node = {"key": key, "label": label, "kind": kind}
                self.graph_nodes[key] = node
                new_nodes.append(node)

        def add_edge(src: str, dst: str, rel: str):
            e = (src, dst, rel)
            if e not in self.graph_edges and src != dst:
                self.graph_edges.add(e)
                new_edges.append({"source": src, "target": dst, "relation": rel})

        speaker_key = f"person:{speaker.lower()}"
        add_node(speaker_key, speaker, "person")

        for entry in find_concepts(text):
            ckey = f"tech:{entry['term'].lower()}"
            add_node(ckey, entry["term"], "technology")
            add_edge(speaker_key, ckey, "discussed")

        for project in PROJECT_RE.findall(text):
            pkey = f"project:{project.lower()}"
            add_node(pkey, project, "project")
            add_edge(speaker_key, pkey, "works on")
            for entry in find_concepts(text):
                add_edge(pkey, f"tech:{entry['term'].lower()}", "uses")

        if new_nodes or new_edges:
            return [{"type": "graph", "nodes": new_nodes, "edges": new_edges}]
        return []

    def _person_event(self, stats: SpeakerStats) -> dict:
        total_words = max(1, sum(s.words for s in self.speakers.values()))
        total_decisions = max(1, sum(s.decisions for s in self.speakers.values()))
        sentiment = "neutral"
        if stats.negative > stats.positive + 1:
            sentiment = "concerned"
        elif stats.positive > stats.negative + 1:
            sentiment = "positive"
        influence = round(0.6 * (stats.words / total_words) + 0.4 * (stats.decisions / total_decisions), 2)
        return {
            "type": "person",
            "name": stats.name,
            "role": stats.role,
            "expertise": sorted(stats.topics)[:6],
            "segments_count": stats.segments,
            "words": stats.words,
            "sentiment": sentiment,
            "influence": influence,
        }

    # ------------------------------------------------------------------ #
    # Deep pass: every N segments — understanding + suggested questions.
    # Uses the LLM when available, heuristics otherwise.
    # ------------------------------------------------------------------ #

    async def analyze(self) -> list[dict]:
        window = self.segments[self.analyzed_upto:]
        if not window:
            return []
        self.analyzed_upto = len(self.segments)
        if llm.llm_available():
            events = await self._analyze_llm(window)
            if events is not None:
                return events
            logger.warning("LLM analysis failed; falling back to heuristics for this pass")
        return self._analyze_heuristic(window)

    # -- heuristic deep pass ------------------------------------------- #

    def _top_keywords(self, window: list[dict], n: int = 5) -> list[str]:
        counts: dict[str, int] = {}
        for seg in window:
            for w in re.findall(r"[a-zA-Z']{4,}", seg["text"].lower()):
                if w not in STOPWORDS:
                    counts[w] = counts.get(w, 0) + 1
        return [w for w, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:n]]

    def _analyze_heuristic(self, window: list[dict]) -> list[dict]:
        events: list[dict] = []
        t = window[-1]["t"]

        concepts_in_window = sorted(
            {c["term"] for c in self.concepts.values() for seg in window if c["term"].lower() in seg["text"].lower()}
        )
        keywords = self._top_keywords(window)
        lead = max(self.speakers.values(), key=lambda s: s.words).name if self.speakers else "The team"
        topic_str = ", ".join(concepts_in_window[:3]) if concepts_in_window else (", ".join(keywords[:3]) or "general project matters")

        parts = [f"The discussion is currently about {topic_str}."]
        if self.decisions and self.decisions[-1]["t"] >= window[0]["t"]:
            parts.append(f"A decision was just made: “{self.decisions[-1]['decision'][:120]}”")
        if self.actions and self.actions[-1]["t"] >= window[0]["t"]:
            parts.append(f"New action item: {self.actions[-1]['task'][:100]} (owner: {self.actions[-1]['owner']}).")
        parts.append(f"{lead} is doing most of the talking so far.")
        events.append({"type": "understanding", "t": t, "text": " ".join(parts)})

        # Suggested questions from templates, keyed on live concepts/topics.
        templates = [
            ("risk", 0.85, "What's our rollback plan if the {x} change causes issues in production?"),
            ("architecture", 0.8, "How does {x} fit into our current architecture — which components have to change?"),
            ("timeline", 0.75, "What's the realistic target date for the {x} work, and what's most likely to slip it?"),
            ("clarifying", 0.7, "Could we define what success looks like for {x} — how will we measure it?"),
            ("strategic", 0.65, "Is {x} the long-term direction, or a stopgap we expect to replace?"),
            ("engineering", 0.6, "Who has operated {x} in production before — do we need a spike to de-risk it?"),
        ]
        topics = concepts_in_window or [k.title() for k in keywords[:2]]
        for i, topic in enumerate(topics[:2]):
            cat, score, tpl = templates[(len(self.questions) + i) % len(templates)]
            q = tpl.format(x=topic)
            if any(existing["text"] == q for existing in self.questions):
                continue
            payload = {
                "type": "question",
                "t": t,
                "text": q,
                "category": cat,
                "score": score,
                "rationale": f"{topic} is actively being discussed; this is the question an experienced engineer would raise now.",
            }
            self.questions.append(payload)
            events.append(payload)
        return events

    # -- LLM deep pass -------------------------------------------------- #

    SYSTEM_PROMPT = """You are Meeting Copilot, an elite staff engineer + technical program manager silently attending a meeting on behalf of one participant. You receive the latest transcript window plus state you've already extracted. Respond ONLY with a JSON object — no prose — using this exact shape (omit list entries you have nothing new for, but include every key):
{
  "understanding": "2-4 sentences: what is happening right now, what the team is deciding, why it matters",
  "insights": [{"kind": "thought|alert|reminder", "text": "..."}],
  "concepts": [{"term": "...", "category": "...", "what": "...", "why_matters": "...", "why_now": "why it came up in THIS meeting", "beginner": "explanation for a newcomer with an analogy", "advanced": "explanation for a senior engineer", "analogy": "...", "pitfalls": "...", "related": ["..."]}],
  "questions": [{"text": "...", "category": "clarifying|strategic|architecture|risk|timeline|product|engineering", "score": 0.0-1.0, "rationale": "..."}],
  "action_items": [{"task": "...", "owner": "...", "deadline": "", "priority": "low|medium|high", "dependencies": []}],
  "decisions": [{"decision": "...", "reason": "...", "alternatives": ["..."], "tradeoffs": "...", "approved_by": "..."}],
  "people": [{"name": "...", "role": "inferred role", "expertise": ["..."]}],
  "graph": {"nodes": [{"key": "kind:lowercase-name", "label": "...", "kind": "person|technology|project|service|topic"}], "edges": [{"source": "key", "target": "key", "relation": "..."}]}
}
Rules: only NEW concepts not in the known list; only genuinely new action items/decisions; questions should be ones that make the attendee sound informed, ranked by score; insights are your running private thoughts ("they seem worried about X", "they forgot to discuss Y")."""

    async def _analyze_llm(self, window: list[dict]) -> list[dict] | None:
        transcript = "\n".join(f"[{s['t']:.0f}s] {s['speaker']}: {s['text']}" for s in window)
        state = {
            "known_concepts": [c["term"] for c in self.concepts.values()],
            "known_action_items": [a["task"] for a in self.actions],
            "known_decisions": [d["decision"][:80] for d in self.decisions],
            "known_graph_nodes": list(self.graph_nodes.keys()),
            "speakers": {s.name: {"role": s.role, "words": s.words} for s in self.speakers.values()},
        }
        user = f"STATE ALREADY EXTRACTED:\n{state}\n\nNEW TRANSCRIPT WINDOW:\n{transcript}"
        data = await llm.complete_json(self.SYSTEM_PROMPT, user)
        if data is None:
            return None

        t = window[-1]["t"]
        events: list[dict] = []
        if data.get("understanding"):
            events.append({"type": "understanding", "t": t, "text": data["understanding"]})
        for ins in data.get("insights", []):
            if ins.get("text") and ins["text"] not in self.insight_texts:
                self.insight_texts.add(ins["text"])
                events.append({"type": "insight", "t": t, "kind": ins.get("kind", "thought"), "text": ins["text"]})
        for c in data.get("concepts", []):
            key = c.get("term", "").lower()
            if not key or key in self.concepts:
                continue
            payload = {
                "type": "concept", "t": t, "first_t": t, "mentions": 1,
                "term": c.get("term", ""), "category": c.get("category", "technology"),
                "what": c.get("what", ""), "why_matters": c.get("why_matters", ""),
                "why_now": c.get("why_now", ""), "beginner": c.get("beginner", ""),
                "advanced": c.get("advanced", ""), "analogy": c.get("analogy", ""),
                "pitfalls": c.get("pitfalls", ""), "related": c.get("related", []),
            }
            self.concepts[key] = payload
            events.append(payload)
        for q in data.get("questions", []):
            if not q.get("text") or any(x["text"] == q["text"] for x in self.questions):
                continue
            payload = {"type": "question", "t": t, "text": q["text"], "category": q.get("category", "clarifying"),
                       "score": float(q.get("score", 0.5)), "rationale": q.get("rationale", "")}
            self.questions.append(payload)
            events.append(payload)
        for a in data.get("action_items", []):
            if not a.get("task"):
                continue
            dedupe = a["task"].lower()[:60]
            if any(x["_key"] == dedupe for x in self.actions):
                continue
            payload = {"type": "action_item", "t": t, "task": a["task"], "owner": a.get("owner", "Unassigned"),
                       "deadline": a.get("deadline", ""), "priority": a.get("priority", "medium"),
                       "status": "open", "dependencies": a.get("dependencies", []), "_key": dedupe}
            self.actions.append(payload)
            events.append({k: v for k, v in payload.items() if not k.startswith("_")})
        for d in data.get("decisions", []):
            if not d.get("decision"):
                continue
            dedupe = d["decision"].lower()[:60]
            if any(x["_key"] == dedupe for x in self.decisions):
                continue
            payload = {"type": "decision", "t": t, "decision": d["decision"], "reason": d.get("reason", ""),
                       "alternatives": d.get("alternatives", []), "tradeoffs": d.get("tradeoffs", ""),
                       "approved_by": d.get("approved_by", ""), "_key": dedupe}
            self.decisions.append(payload)
            events.append({k: v for k, v in payload.items() if not k.startswith("_")})
        for p in data.get("people", []):
            name = p.get("name")
            if name and name in self.speakers:
                stats = self.speakers[name]
                if p.get("role"):
                    stats.role = p["role"]
                for topic in p.get("expertise", []):
                    stats.topics.add(topic)
                events.append(self._person_event(stats))
        graph = data.get("graph") or {}
        new_nodes, new_edges = [], []
        for n in graph.get("nodes", []):
            if n.get("key") and n["key"] not in self.graph_nodes:
                node = {"key": n["key"], "label": n.get("label", n["key"]), "kind": n.get("kind", "topic")}
                self.graph_nodes[n["key"]] = node
                new_nodes.append(node)
        for e in graph.get("edges", []):
            trip = (e.get("source", ""), e.get("target", ""), e.get("relation", "relates to"))
            if all(trip[:2]) and trip not in self.graph_edges and trip[0] in self.graph_nodes and trip[1] in self.graph_nodes:
                self.graph_edges.add(trip)
                new_edges.append({"source": trip[0], "target": trip[1], "relation": trip[2]})
        if new_nodes or new_edges:
            events.append({"type": "graph", "nodes": new_nodes, "edges": new_edges})
        return events
