"""Offline smoke test: run the demo meeting through the full pipeline
(analyst + persistence + report) without a server or any API key."""

import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")

from app.db import Base, SessionLocal, engine
from app.live import LiveSession
from app.models import Meeting
from app.report import generate_report
from app.simulator import DEMO_SCRIPT, DEMO_TITLE


async def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    meeting = Meeting(title=DEMO_TITLE, mode="demo")
    db.add(meeting)
    db.commit()

    session = LiveSession(meeting.id, "demo")
    t = 0.0
    for speaker, text, delay in DEMO_SCRIPT:
        t += delay
        await session.add_utterance(speaker, text, t=t)
    await asyncio.sleep(0.5)  # let scheduled analysis tasks finish
    await session.run_analysis()

    a = session.analyst
    print(f"segments:   {len(a.segments)}")
    print(f"concepts:   {len(a.concepts)} -> {sorted(c['term'] for c in a.concepts.values())}")
    print(f"actions:    {len(a.actions)}")
    for x in a.actions:
        print(f"  - [{x['priority']}] {x['task'][:70]} | owner={x['owner']} | due={x['deadline']}")
    print(f"decisions:  {len(a.decisions)}")
    for d in a.decisions:
        print(f"  - {d['decision'][:80]} (by {d['approved_by']})")
    print(f"questions:  {len(a.questions)}")
    print(f"insights:   {len(a.insight_texts)}")
    print(f"graph:      {len(a.graph_nodes)} nodes, {len(a.graph_edges)} edges")
    print(f"people:     {list(a.speakers)}")

    meeting.report_md = await generate_report(db, meeting)
    db.commit()
    print(f"\nreport:     {len(meeting.report_md)} chars")
    print(meeting.report_md[:600])
    db.close()


if __name__ == "__main__":
    asyncio.run(main())
