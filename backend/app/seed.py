"""Seed historical meetings so the memory timeline has something to remember.

Runs once, when a demo meeting is created and no ended meetings exist yet.
The seeded decisions are deliberately in tension with what the demo meeting
decides, so contradiction detection can be demonstrated offline.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Concept, Decision, Meeting, Segment

PAST_MEETINGS = [
    {
        "title": "PartnerHub API design review",
        "days_ago": 13,  # reads as "Jun 18" relative to a Jul 1 demo
        "segments": [
            ("Dev", "For PartnerHub v1 the simplest path is our existing homegrown session auth — partners log in through the portal and we keep server-side sessions."),
            ("Maya", "Agreed for now. We decided to keep the homegrown session auth for PartnerHub and revisit OAuth in Q4 when enterprise deals demand it."),
            ("Tom", "Fine, but let's at least keep the session service stateless-friendly. Redis for the session store so we can scale horizontally later."),
            ("Priya", "Northwind hinted at SSO on the last call, so Q4 might arrive sooner than we think."),
            ("Dev", "Noted. I'll document the session flow and the Redis session store setup in the architecture doc."),
        ],
        "decisions": [
            ("We decided to keep the homegrown session auth for PartnerHub and revisit OAuth in Q4.", "Maya"),
        ],
        "concepts": ["Redis", "SSO (Single Sign-On)"],
        "report": "# PartnerHub API design review\n\nDecided to keep homegrown session auth for PartnerHub; revisit OAuth in Q4. Redis chosen for the session store. Northwind may push SSO timelines earlier.",
    },
    {
        "title": "Platform sync — event pipeline & audit",
        "days_ago": 7,
        "segments": [
            ("Tom", "The audit pipeline now consumes session events from Kafka; compliance reads the daily rollups."),
            ("Dev", "Kafka topics are partitioned by tenant id, which keeps per-partner ordering intact."),
            ("Maya", "Let's use the same Kafka event schema for any future auth changes so downstream consumers don't break."),
            ("Tom", "Also the staging Kubernetes cluster needs its ingress controller upgraded — filing a ticket with platform."),
        ],
        "decisions": [
            ("Let's use the same Kafka event schema for any future auth changes so downstream consumers don't break.", "Maya"),
        ],
        "concepts": ["Apache Kafka", "Kubernetes"],
        "report": "# Platform sync — event pipeline & audit\n\nAudit pipeline consumes session events from Kafka partitioned by tenant. Agreed to keep one event schema for auth changes. Staging ingress upgrade ticket filed.",
    },
]


def seed_demo_history(db: Session) -> bool:
    """Create the historical meetings if none exist. Returns True if seeded."""
    existing = db.scalars(select(Meeting).where(Meeting.status == "ended").limit(1)).first()
    if existing is not None:
        return False
    now = datetime.now(timezone.utc)
    for spec in PAST_MEETINGS:
        started = now - timedelta(days=spec["days_ago"])
        meeting = Meeting(
            title=spec["title"], mode="demo", status="ended",
            started_at=started, ended_at=started + timedelta(minutes=30),
            report_md=spec["report"],
        )
        db.add(meeting)
        db.flush()
        for i, (speaker, text) in enumerate(spec["segments"]):
            db.add(Segment(meeting_id=meeting.id, t=float(i * 20), speaker=speaker, text=text))
        for text, approver in spec["decisions"]:
            db.add(Decision(meeting_id=meeting.id, t=60.0, decision=text, approved_by=approver, confidence=0.9))
        for term in spec["concepts"]:
            db.add(Concept(meeting_id=meeting.id, term=term, first_t=30.0))
    db.commit()
    return True
