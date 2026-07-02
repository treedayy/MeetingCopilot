"""End-of-meeting report generation.

Builds an executive-quality markdown document from everything captured live.
With an LLM key, the executive summary, risks, follow-up email, Slack update
and learning path are written by Claude; otherwise they are assembled from the
structured data so the report is always complete.
"""

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import gateway, llm
from .llm import Tier
from .models import (
    ActionItem, CoachTip, Concept, Decision, Diagram, HealthSnapshot, Insight,
    Meeting, MemoryItem, Person, RetrievalItem, Segment, SuggestedQuestion,
    Understanding,
)

logger = logging.getLogger(__name__)


def _ts(seconds: float) -> str:
    return str(timedelta(seconds=int(seconds)))[2:]  # mm:ss for meetings < 1h


def _collect(db: Session, meeting: Meeting) -> dict:
    mid = meeting.id
    return {
        "segments": db.scalars(select(Segment).where(Segment.meeting_id == mid).order_by(Segment.t)).all(),
        "understandings": db.scalars(select(Understanding).where(Understanding.meeting_id == mid).order_by(Understanding.t)).all(),
        "concepts": db.scalars(select(Concept).where(Concept.meeting_id == mid).order_by(Concept.first_t)).all(),
        "questions": db.scalars(select(SuggestedQuestion).where(SuggestedQuestion.meeting_id == mid).order_by(SuggestedQuestion.score.desc())).all(),
        "actions": db.scalars(select(ActionItem).where(ActionItem.meeting_id == mid).order_by(ActionItem.t)).all(),
        "decisions": db.scalars(select(Decision).where(Decision.meeting_id == mid).order_by(Decision.t)).all(),
        "people": db.scalars(select(Person).where(Person.meeting_id == mid).order_by(Person.words.desc())).all(),
        "insights": db.scalars(select(Insight).where(Insight.meeting_id == mid).order_by(Insight.t)).all(),
        "coach_tips": db.scalars(select(CoachTip).where(CoachTip.meeting_id == mid).order_by(CoachTip.t)).all(),
        "memory_items": db.scalars(select(MemoryItem).where(MemoryItem.meeting_id == mid).order_by(MemoryItem.t)).all(),
        "retrievals": db.scalars(select(RetrievalItem).where(RetrievalItem.meeting_id == mid).order_by(RetrievalItem.t)).all(),
        "diagram": db.scalars(select(Diagram).where(Diagram.meeting_id == mid).order_by(Diagram.version.desc())).first(),
        "health": db.scalars(select(HealthSnapshot).where(HealthSnapshot.meeting_id == mid).order_by(HealthSnapshot.t)).all(),
    }


async def generate_report(db: Session, meeting: Meeting, my_name: str = "") -> str:
    data = _collect(db, meeting)
    llm_sections = await _llm_sections(meeting, data) if gateway.should_invoke("report_generation") else {}
    return _assemble(meeting, data, llm_sections, my_name)


async def _llm_sections(meeting: Meeting, data: dict) -> dict:
    transcript = "\n".join(f"[{_ts(s.t)}] {s.speaker}: {s.text}" for s in data["segments"])[:24000]
    decisions = "\n".join(f"- {d.decision} (by {d.approved_by})" for d in data["decisions"])
    actions = "\n".join(f"- {a.task} — {a.owner} {a.deadline}" for a in data["actions"])
    system = (
        "You write executive-quality meeting documentation. Respond ONLY with JSON: "
        '{"executive_summary": "3 short paragraphs: purpose, overview, outcome", '
        '"risks": [{"kind": "technical|business|schedule|architecture", "risk": "...", "mitigation": "..."}], '
        '"followup_email": "complete professional email body", '
        '"slack_update": "concise slack message with bullets", '
        '"jira_tickets": [{"title": "...", "description": "...", "priority": "..."}], '
        '"learning_path": [{"concept": "...", "why": "...", "minutes": 10}], '
        '"missed_opportunities": ["moments the attendee could have contributed"]}'
    )
    user = f"MEETING: {meeting.title}\n\nTRANSCRIPT:\n{transcript}\n\nDECISIONS:\n{decisions}\n\nACTIONS:\n{actions}"
    return await llm.complete_json(Tier.LARGE, system, user, max_tokens=8000) or {}


def _assemble(meeting: Meeting, data: dict, ai: dict, my_name: str) -> str:
    segs, concepts = data["segments"], data["concepts"]
    decisions, actions, people = data["decisions"], data["actions"], data["people"]
    duration = _ts(segs[-1].t) if segs else "0:00"
    lines: list[str] = []
    add = lines.append

    add(f"# {meeting.title}")
    add("")
    add(f"**Date:** {meeting.started_at:%Y-%m-%d} · **Duration:** {duration} · "
        f"**Participants:** {', '.join(p.name for p in people) or 'Unknown'} · "
        f"**Decisions:** {len(decisions)} · **Action items:** {len(actions)}")
    add("")

    add("## Executive Summary")
    if ai.get("executive_summary"):
        add(ai["executive_summary"])
    else:
        topics = ", ".join(c.term for c in concepts[:5]) or "project matters"
        add(f"The team met to discuss {topics}. "
            f"{len(decisions)} decision(s) were made and {len(actions)} action item(s) were assigned. "
            + (f"Key outcome: {decisions[0].decision[:200]}" if decisions else "No formal decisions were recorded."))
    add("")

    add("## Timeline")
    highlights = [(d.t, f"🟢 Decision: {d.decision[:120]}") for d in decisions]
    highlights += [(a.t, f"📌 Action: {a.task[:120]} — {a.owner}") for a in actions]
    highlights += [(c.first_t, f"💡 First mention of {c.term}") for c in concepts]
    for t, text in sorted(highlights):
        add(f"- **{_ts(t)}** — {text}")
    add("")

    add("## Major Topics")
    for u in data["understandings"]:
        add(f"- **{_ts(u.t)}** — {u.text}")
    add("")

    add("## Decisions")
    add("| Time | Decision | Reason | Approved by | Confidence |")
    add("|---|---|---|---|---|")
    for d in decisions:
        add(f"| {_ts(d.t)} | {d.decision[:160]} | {d.reason or '—'} | {d.approved_by or '—'} | {d.confidence:.0%} |")
    add("")

    add("## Action Items")
    add("| Task | Owner | Deadline | Priority | Status | Confidence |")
    add("|---|---|---|---|---|---|")
    for a in actions:
        add(f"| {a.task[:160]} | {a.owner} | {a.deadline or '—'} | {a.priority} | {a.status} | {a.confidence:.0%} |")
    add("")

    if data["memory_items"]:
        add("## Historical Context")
        for m2 in data["memory_items"]:
            icon = "⚠️" if m2.kind == "contradiction" else "🕰️"
            add(f"- {icon} {m2.text}")
        add("")

    if data["diagram"]:
        add("## Architecture (as discussed)")
        add(f"*Version {data['diagram'].version}, last updated {_ts(data['diagram'].t)} into the meeting.*")
        add("")
        add("```mermaid")
        add(data["diagram"].mermaid)
        add("```")
        add("")

    add("## Risks")
    if ai.get("risks"):
        for r in ai["risks"]:
            add(f"- **{r.get('kind', 'technical').title()}:** {r.get('risk', '')} — *Mitigation:* {r.get('mitigation', 'TBD')}")
    else:
        alerts = [i for i in data["insights"] if i.kind in ("alert", "reminder")]
        for i in alerts or []:
            add(f"- {i.text}")
        if not alerts:
            add("- No explicit risks were flagged during the meeting.")
    add("")

    add("## Questions Worth Raising")
    for q in data["questions"][:10]:
        add(f"- **[{q.category}]** {q.text}  \n  *Why:* {q.rationale}")
    add("")

    add("## Technologies & Vocabulary")
    for c in concepts:
        add(f"### {c.term}")
        add(f"{c.what}")
        add(f"- **Why it matters:** {c.why_matters}")
        add(f"- **Why it came up:** {c.why_now}")
        add(f"- **Mentions in this meeting:** {c.mentions}")
        add("")

    add("## Learn This Afterwards")
    if ai.get("learning_path"):
        for i, item in enumerate(ai["learning_path"], 1):
            add(f"{i}. **{item.get('concept')}** (~{item.get('minutes', 10)} min) — {item.get('why', '')}")
    else:
        ranked = sorted(concepts, key=lambda c: -c.mentions)[:5]
        for i, c in enumerate(ranked, 1):
            add(f"{i}. **{c.term}** (~10 min) — mentioned {c.mentions}× — start with: {c.beginner[:180]}")
    add("")

    add("## People")
    add("| Name | Role | Contributions | Words | Sentiment | Influence |")
    add("|---|---|---|---|---|---|")
    for p in people:
        add(f"| {p.name} | {p.role or '—'} | {p.segments_count} | {p.words} | {p.sentiment} | {p.influence:.0%} |")
    add("")

    if my_name:
        me = next((p for p in people if p.name.lower() == my_name.lower()), None)
        add("## My Participation")
        if me:
            total = max(1, sum(p.words for p in people))
            add(f"You spoke {me.segments_count} time(s) — {me.words / total:.0%} of the meeting by word count.")
        else:
            add("You didn't speak during this meeting.")
        for m in ai.get("missed_opportunities", [])[:5]:
            add(f"- Missed opportunity: {m}")
        add("")

    add("## Suggested Follow-up Email")
    add("```")
    if ai.get("followup_email"):
        add(ai["followup_email"])
    else:
        add(f"Subject: Recap — {meeting.title}")
        add("")
        add("Hi all,")
        add("")
        add("Thanks for the discussion today. Summary of where we landed:")
        for d in decisions:
            add(f"  • {d.decision[:140]}")
        add("")
        add("Action items:")
        for a in actions:
            add(f"  • {a.task[:120]} — {a.owner}" + (f" (by {a.deadline})" if a.deadline else ""))
        add("")
        add("Please flag anything I've captured incorrectly.")
    add("```")
    add("")

    add("## Suggested Slack Update")
    add("```")
    if ai.get("slack_update"):
        add(ai["slack_update"])
    else:
        add(f"*{meeting.title}* — recap :memo:")
        for d in decisions[:4]:
            add(f"• ✅ {d.decision[:120]}")
        for a in actions[:5]:
            add(f"• 📌 {a.task[:100]} → *{a.owner}*")
    add("```")
    add("")

    if ai.get("jira_tickets"):
        add("## Suggested Jira Tickets")
        for tkt in ai["jira_tickets"]:
            add(f"- **{tkt.get('title')}** ({tkt.get('priority', 'Medium')}): {tkt.get('description', '')}")
        add("")

    if data["health"]:
        add("## Meeting Health")
        last = data["health"][-1]
        avg_agreement = sum(h.agreement for h in data["health"]) / len(data["health"])
        add(f"- **Discussion completeness:** {last.completeness:.0%} of the standard checklist "
            f"(owner, timeline, rollback, testing, monitoring, security, customer impact, metrics, risk)")
        add(f"- **Participation balance:** {last.balance:.0%} (100% = perfectly even)")
        add(f"- **Average agreement level:** {avg_agreement:+.2f} on a −1 (tension) to +1 (consensus) scale")
        add(f"- **Topics covered:** {len({h.topic for h in data['health'] if h.topic})}")
        add("")

    if data["coach_tips"]:
        add("## Coaching Recap")
        for tip in data["coach_tips"]:
            add(f"- **[{tip.kind}]** {_ts(tip.t)} — {tip.text}")
        add("")

    if data["retrievals"]:
        add("## Recommended Reading")
        for r in data["retrievals"]:
            add(f"- **{r.title}** ({r.source}) — {r.summary[:180]}")
        add("")

    add("## Confidence Analysis")
    add("Items below 70% are inferences worth double-checking, not established facts.")
    uncertain = [("Decision", d.decision, d.confidence) for d in decisions if d.confidence < 0.7]
    uncertain += [("Action item", a.task, a.confidence) for a in actions if a.confidence < 0.7]
    uncertain += [("Observation", i.text, i.confidence) for i in data["insights"] if i.confidence < 0.6]
    if uncertain:
        for kind, text, conf in uncertain:
            add(f"- **{kind}** ({conf:.0%}): {text[:140]}")
    else:
        add("- All extracted decisions and action items met the confidence threshold.")
    add("")

    add("## AI Observations During the Meeting")
    for i in data["insights"]:
        icon = {"alert": "🚨", "reminder": "⏰", "topic": "🔀"}.get(i.kind, "💭")
        add(f"- {icon} **{_ts(i.t)}** — {i.text} *({i.confidence:.0%})*")
    add("")

    add("---")
    add("*Generated by Meeting Copilot.*")
    return "\n".join(lines)
