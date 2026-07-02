"""Layer 4 — Intelligence Gateway.

Every pipeline stage that *could* use a model passes through this explicit
policy. The default answer is NO: the deterministic engines (regex extractors,
concept library, keyword topic tracking, checklist coverage, graph builders)
run the product; models are the exception, reserved for stages where they
materially improve the outcome.

To change routing you change this table — not scattered call sites.
"""

from .llm import Tier, llm_available

# stage -> (tier, rationale)
POLICY: dict[str, tuple[Tier, str]] = {
    # Layer 2/3 — structured events and state updates. Deterministic: regex,
    # dictionaries, counters. Zero latency, zero cost, fully offline.
    "transcript_ingest": (Tier.NONE, "raw event; timestamp + persist + broadcast"),
    "action_extraction": (Tier.NONE, "commitment-verb patterns + deadline regex"),
    "decision_extraction": (Tier.NONE, "decision-marker patterns + agreement score"),
    "concept_detection": (Tier.NONE, "curated library lookup, word-boundary matching"),
    "topic_tracking": (Tier.NONE, "keyword dominance over a sliding window"),
    "checklist_coverage": (Tier.NONE, "keyword sets per discussion dimension"),
    "speaker_stats": (Tier.NONE, "counters"),
    "graph_building": (Tier.NONE, "entity co-occurrence rules"),
    "architecture_flows": (Tier.NONE, "entity lexicon + flow-verb patterns"),
    "memory_lookup": (Tier.NONE, "SQL over prior meetings; subject-term overlap"),
    "retrieval": (Tier.NONE, "term-frequency scoring over local docs/reports"),
    "risk_promotion": (Tier.NONE, "rule + confidence threshold on existing findings"),

    # Live enrichment — periodic, batched over the state window, never
    # per-utterance. Improves narrative/questions/novel concepts.
    "live_enrichment": (Tier.MEDIUM, "state-window synthesis every ~3 ticks; skippable"),

    # Verification of high-stakes inferences before they interrupt a meeting.
    "contradiction_verification": (Tier.MEDIUM, "confirm heuristic conflicts before interrupting"),

    # Post-meeting only — batched, latency-insensitive.
    "report_generation": (Tier.LARGE, "executive summary, risks, comms drafts, learning plan"),
}


def decide(stage: str) -> Tier:
    tier, _ = POLICY.get(stage, (Tier.NONE, "unknown stage defaults to deterministic"))
    if tier != Tier.NONE and not llm_available():
        return Tier.NONE  # graceful degradation: the deterministic path always exists
    return tier


def should_invoke(stage: str) -> bool:
    return decide(stage) != Tier.NONE
