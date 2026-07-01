import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String, default="Untitled meeting")
    mode: Mapped[str] = mapped_column(String, default="demo")  # demo | live
    status: Mapped[str] = mapped_column(String, default="live")  # live | ended
    started_at: Mapped[datetime] = mapped_column(default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)
    report_md: Mapped[str | None] = mapped_column(Text, nullable=True)

    segments: Mapped[list["Segment"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    t: Mapped[float] = mapped_column(Float, default=0.0)  # seconds since meeting start
    speaker: Mapped[str] = mapped_column(String, default="Unknown")
    text: Mapped[str] = mapped_column(Text)
    important: Mapped[bool] = mapped_column(Boolean, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="segments")


class Understanding(Base):
    __tablename__ = "understandings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    t: Mapped[float] = mapped_column(Float, default=0.0)
    text: Mapped[str] = mapped_column(Text)


class Insight(Base):
    __tablename__ = "insights"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    t: Mapped[float] = mapped_column(Float, default=0.0)
    kind: Mapped[str] = mapped_column(String, default="thought")  # thought | alert | reminder
    text: Mapped[str] = mapped_column(Text)


class Concept(Base):
    __tablename__ = "concepts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    term: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String, default="technology")
    what: Mapped[str] = mapped_column(Text, default="")
    why_matters: Mapped[str] = mapped_column(Text, default="")
    why_now: Mapped[str] = mapped_column(Text, default="")
    beginner: Mapped[str] = mapped_column(Text, default="")
    advanced: Mapped[str] = mapped_column(Text, default="")
    analogy: Mapped[str] = mapped_column(Text, default="")
    pitfalls: Mapped[str] = mapped_column(Text, default="")
    related: Mapped[list] = mapped_column(JSON, default=list)
    mentions: Mapped[int] = mapped_column(Integer, default=1)
    first_t: Mapped[float] = mapped_column(Float, default=0.0)


class SuggestedQuestion(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    t: Mapped[float] = mapped_column(Float, default=0.0)
    text: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String, default="clarifying")
    score: Mapped[float] = mapped_column(Float, default=0.5)  # 0..1 usefulness
    rationale: Mapped[str] = mapped_column(Text, default="")


class ActionItem(Base):
    __tablename__ = "action_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    t: Mapped[float] = mapped_column(Float, default=0.0)
    task: Mapped[str] = mapped_column(Text)
    owner: Mapped[str] = mapped_column(String, default="Unassigned")
    deadline: Mapped[str] = mapped_column(String, default="")
    priority: Mapped[str] = mapped_column(String, default="medium")  # low | medium | high
    status: Mapped[str] = mapped_column(String, default="open")  # open | done
    dependencies: Mapped[list] = mapped_column(JSON, default=list)


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    t: Mapped[float] = mapped_column(Float, default=0.0)
    decision: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text, default="")
    alternatives: Mapped[list] = mapped_column(JSON, default=list)
    tradeoffs: Mapped[str] = mapped_column(Text, default="")
    approved_by: Mapped[str] = mapped_column(String, default="")


class Person(Base):
    __tablename__ = "people"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    name: Mapped[str] = mapped_column(String, index=True)
    role: Mapped[str] = mapped_column(String, default="")
    expertise: Mapped[list] = mapped_column(JSON, default=list)
    segments_count: Mapped[int] = mapped_column(Integer, default=0)
    words: Mapped[int] = mapped_column(Integer, default=0)
    sentiment: Mapped[str] = mapped_column(String, default="neutral")
    influence: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1


class GraphNode(Base):
    __tablename__ = "graph_nodes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    key: Mapped[str] = mapped_column(String, index=True)  # stable key within meeting
    label: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String, default="topic")  # person|technology|project|service|topic|decision


class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id"), index=True)
    source: Mapped[str] = mapped_column(String)  # node key
    target: Mapped[str] = mapped_column(String)  # node key
    relation: Mapped[str] = mapped_column(String, default="relates to")
