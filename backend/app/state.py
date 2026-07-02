"""MeetingState: the single evolving model of the meeting.

Every agent reads from and writes to this state on each reasoning tick,
instead of treating utterances independently. The state carries everything
needed to answer: what is happening, what changed, who agrees, what's missing.
"""

import re
from dataclasses import dataclass, field

STOPWORDS = {
    "the", "and", "for", "that", "this", "with", "have", "will", "from", "what",
    "about", "just", "like", "them", "then", "were", "been", "they", "there",
    "would", "could", "should", "going", "think", "know", "need", "want", "make",
    "sure", "yeah", "okay", "right", "really", "actually", "into", "over", "also",
    "when", "where", "which", "than", "because", "let's", "we're", "it's", "don't",
    "that's", "some", "more", "here", "your", "before", "after", "week", "today",
    "still", "last", "next", "thing", "everyone", "anything", "does",
}

AGREEMENT_MARKERS = ("agree", "sounds good", "makes sense", "i like", "good idea", "perfect", "exactly", "great", "works for me", "let's do it", "do it", "+1")
DISAGREEMENT_MARKERS = ("disagree", "i'm not sure", "not convinced", "pushback", "but ", "however", "won't work", "problem with", "concern", "worried", "risky", "hold on", "wait,")

# Discussion-completeness checklist: dimension -> keywords that mark it discussed.
CHECKLIST = {
    "owner assignment": ("i'll", "i will", "owns", "owner", "assigned", "takes this", "let me"),
    "timeline": ("deadline", "by friday", "by monday", "by wednesday", "by end of", "next week", "q1", "q2", "q3", "q4", "timeline", "target date", "this sprint"),
    "rollback plan": ("rollback", "roll back", "revert", "flip the flag back", "fall back"),
    "testing strategy": ("test", "qa", "staging", "verify", "validation"),
    "monitoring / observability": ("monitor", "observab", "dashboard", "alert", "traces", "metrics", "telemetry"),
    "security": ("security", "secure", "auth", "token", "encrypt", "soc 2", "compliance", "vulnerab"),
    "customer impact": ("customer", "partner", "user impact", "downtime", "migration path", "communicat"),
    "success metrics": ("success metric", "kpi", "measure", "error rate", "latency", "slo", "how will we know"),
    "risk mitigation": ("risk", "mitigat", "worst case", "contingency", "blocker"),
}


@dataclass
class SpeakerStats:
    name: str
    role: str = ""
    segments: int = 0
    words: int = 0
    negative: int = 0
    positive: int = 0
    decisions: int = 0
    topics: set = field(default_factory=set)
    last_t: float = 0.0


@dataclass
class MeetingState:
    meeting_id: str
    mode: str = "live"
    my_name: str = "Me"
    profile: dict = field(default_factory=dict)

    # Raw stream
    segments: list = field(default_factory=list)  # {t, speaker, text}
    processed_upto: int = 0  # index agents have consumed
    tick: int = 0

    # Evolving understanding
    topic: str = ""
    topic_confidence: float = 0.0
    topic_history: list = field(default_factory=list)  # [(t, topic)]
    agreement: float = 0.0  # -1..1 rolling
    checklist: dict = field(default_factory=lambda: {k: False for k in CHECKLIST})
    expected_total_segments: int = 40  # progress estimate basis

    # Extracted artifacts (agents own their sections but share visibility)
    concepts: dict = field(default_factory=dict)  # lower(term) -> payload
    actions: list = field(default_factory=list)
    decisions: list = field(default_factory=list)
    questions: list = field(default_factory=list)
    insight_texts: set = field(default_factory=set)
    speakers: dict = field(default_factory=dict)  # name -> SpeakerStats
    graph_nodes: dict = field(default_factory=dict)  # key -> node
    graph_edges: set = field(default_factory=set)  # (src, dst, rel)

    # Architecture model
    arch_nodes: dict = field(default_factory=dict)  # key -> label
    arch_edges: set = field(default_factory=set)  # (src, dst, verb)
    diagram_version: int = 0

    # Cross-meeting memory / retrieval / coaching bookkeeping
    memory_checked: set = field(default_factory=set)
    retrieval_checked: set = field(default_factory=set)
    coach_sent: set = field(default_factory=set)
    gaps_flagged: set = field(default_factory=set)

    # ------------------------------------------------------------------ #

    def new_segments(self) -> list:
        return self.segments[self.processed_upto:]

    def last_t(self) -> float:
        return self.segments[-1]["t"] if self.segments else 0.0

    def window(self, n: int = 10) -> list:
        return self.segments[-n:]

    def keywords(self, segments: list, n: int = 6) -> list[str]:
        counts: dict[str, int] = {}
        for seg in segments:
            for w in re.findall(r"[a-zA-Z']{4,}", seg["text"].lower()):
                if w not in STOPWORDS:
                    counts[w] = counts.get(w, 0) + 1
        return [w for w, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:n]]

    def update_speaker(self, t: float, speaker: str, text: str, roles: dict) -> None:
        stats = self.speakers.setdefault(speaker, SpeakerStats(name=speaker, role=roles.get(speaker, "")))
        stats.segments += 1
        stats.words += len(text.split())
        stats.last_t = t
        lower = text.lower()
        stats.positive += sum(1 for m in AGREEMENT_MARKERS if m in lower)
        stats.negative += sum(1 for m in DISAGREEMENT_MARKERS if m in lower)

    def update_agreement(self) -> None:
        window = self.window(10)
        if not window:
            return
        score = 0
        for seg in window:
            lower = seg["text"].lower()
            score += sum(1 for m in AGREEMENT_MARKERS if m in lower)
            score -= sum(1 for m in DISAGREEMENT_MARKERS if m in lower)
        self.agreement = max(-1.0, min(1.0, score / max(4, len(window))))

    def update_checklist(self) -> None:
        for seg in self.new_segments():
            lower = seg["text"].lower()
            for dim, keywords in CHECKLIST.items():
                if not self.checklist[dim] and any(k in lower for k in keywords):
                    self.checklist[dim] = True

    def completeness(self) -> float:
        if not self.segments:
            return 0.0
        return sum(1 for v in self.checklist.values() if v) / len(self.checklist)

    def participation_balance(self) -> float:
        """1.0 = perfectly even speaking distribution, 0 = one voice only."""
        words = [s.words for s in self.speakers.values() if s.words > 0]
        if len(words) < 2:
            return 1.0 if len(words) < 2 else 0.0
        total = sum(words)
        # Normalized inverse Herfindahl index.
        hhi = sum((w / total) ** 2 for w in words)
        n = len(words)
        return round((1 / hhi - 1) / (n - 1), 2) if n > 1 else 1.0

    def engagement(self) -> float:
        """Utterance density over the last two minutes, capped at 1."""
        if not self.segments:
            return 0.0
        now = self.last_t()
        recent = [s for s in self.segments if s["t"] > now - 120]
        return min(1.0, len(recent) / 24)  # 12/min ≈ lively discussion

    def progress(self) -> float:
        if self.mode == "demo":
            return min(1.0, len(self.segments) / self.expected_total_segments)
        return min(1.0, self.last_t() / (30 * 60))  # assume a 30-minute meeting

    def health_payload(self) -> dict:
        return {
            "type": "state_update",
            "t": self.last_t(),
            "topic": self.topic,
            "topic_confidence": round(self.topic_confidence, 2),
            "agreement": round(self.agreement, 2),
            "engagement": round(self.engagement(), 2),
            "balance": self.participation_balance(),
            "completeness": round(self.completeness(), 2),
            "progress": round(self.progress(), 2),
            "checklist": dict(self.checklist),
            "counts": {
                "concepts": len(self.concepts),
                "decisions": len(self.decisions),
                "actions": len(self.actions),
                "questions": len(self.questions),
                "open_actions": sum(1 for a in self.actions if a.get("status") == "open"),
            },
        }
