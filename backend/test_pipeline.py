"""Offline smoke test: drive the demo meeting through the V2 multi-agent
reasoning engine (manual ticks, no server, no API key) and print what every
agent produced, then generate the report."""

import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")

from app.db import Base, SessionLocal, auto_migrate, engine
from app.live import LiveSession
from app.models import Meeting
from app.report import generate_report
from app.seed import seed_demo_history
from app.simulator import DEMO_SCRIPT, DEMO_TITLE


async def main():
    Base.metadata.create_all(bind=engine)
    auto_migrate()
    db = SessionLocal()
    seeded = seed_demo_history(db)
    print(f"seeded history: {seeded}")
    meeting = Meeting(title=DEMO_TITLE, mode="demo")
    db.add(meeting)
    db.commit()

    session = LiveSession(meeting.id, "demo")
    session.reasoning_task.cancel()  # tick manually for determinism

    events_by_type: dict[str, int] = {}
    t = 0.0
    for i, (speaker, text, delay) in enumerate(DEMO_SCRIPT):
        t += delay
        await session.add_utterance(speaker, text, t=t)
        if i % 2 == 1:  # a reasoning tick every ~2 utterances, like real time
            for e in await session.coordinator.tick(session.state):
                events_by_type[e["type"]] = events_by_type.get(e["type"], 0) + 1
                session_db = SessionLocal()
                try:
                    session._persist_event(session_db, e)
                    session_db.commit()
                finally:
                    session_db.close()
    # Final tick.
    for e in await session.coordinator.tick(session.state):
        events_by_type[e["type"]] = events_by_type.get(e["type"], 0) + 1

    s = session.state
    print(f"\nevents: {events_by_type}")
    print(f"topic history: {[topic for _, topic in s.topic_history]}")
    print(f"concepts:  {len(s.concepts)}")
    print(f"actions:   {len(s.actions)} ({sum(1 for a in s.actions if a['owner'] not in ('TBD',))} owned)")
    print(f"decisions: {len(s.decisions)}")
    for d in s.decisions:
        print(f"  - ({d['confidence']:.0%}) {d['decision'][:75]}")
    print(f"questions: {len(s.questions)}")
    print(f"graph:     {len(s.graph_nodes)} nodes ({sorted({n['kind'] for n in s.graph_nodes.values()})}), {len(s.graph_edges)} edges")
    print(f"arch:      {len(s.arch_nodes)} components, {len(s.arch_edges)} flows, diagram v{s.diagram_version}")
    print(f"checklist: {sum(s.checklist.values())}/{len(s.checklist)} covered -> missing: {[k for k, v in s.checklist.items() if not v]}")
    print(f"agreement: {s.agreement:+.2f} | balance: {s.participation_balance():.0%} | completeness: {s.completeness():.0%}")

    assert events_by_type.get("coach"), "coach produced nothing"
    assert events_by_type.get("memory"), "memory agent found no history"
    assert events_by_type.get("diagram"), "architect produced no diagram"
    assert events_by_type.get("state_update"), "no health updates"
    assert any(k in events_by_type for k in ("topic_shift",)), "no topic shifts detected"

    from sqlalchemy import select
    from app.models import MemoryItem
    rows = db.scalars(select(MemoryItem).where(MemoryItem.meeting_id == meeting.id)).all()
    print(f"\nmemory items: {len(rows)}")
    for r in rows:
        print(f"  - [{r.kind}] ({r.confidence:.0%}) {r.text[:100]}")
    assert any(r.kind == "contradiction" for r in rows), "contradiction with June 18 decision not detected"

    meeting.report_md = await generate_report(db, meeting)
    db.commit()
    print(f"\nreport: {len(meeting.report_md)} chars")
    for line in meeting.report_md.splitlines():
        if line.startswith("## "):
            print(f"  {line}")
    db.close()
    print("\nPIPELINE OK")


if __name__ == "__main__":
    asyncio.run(main())
