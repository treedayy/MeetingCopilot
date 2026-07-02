"""Pluggable retrieval layer.

When entities are mentioned in a meeting, providers are queried for concise
context to surface without interrupting. Ships with two working providers:

- LocalDocsProvider — markdown knowledge base in backend/knowledge/
- MeetingReportsProvider — reports of previous meetings in the database

The Provider interface is the extension point for GitHub, Jira, Confluence,
Notion, Google Drive, etc. — each becomes a class with a `search` method and
a line in `providers()`.
"""

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select

from .db import SessionLocal
from .models import Meeting

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"


@dataclass
class RetrievalResult:
    source: str  # docs | meetings | github | jira ...
    title: str
    summary: str
    ref: str  # path, url, or meeting id
    score: float


class Provider(ABC):
    source = "unknown"

    @abstractmethod
    def search(self, query: str, limit: int = 2) -> list[RetrievalResult]: ...


class LocalDocsProvider(Provider):
    """Searches markdown files in backend/knowledge/ — the stand-in for
    Confluence/Notion/Drive until real connectors are configured."""

    source = "docs"

    def search(self, query: str, limit: int = 2) -> list[RetrievalResult]:
        terms = [t for t in re.findall(r"[a-z0-9]+", query.lower()) if len(t) > 2]
        if not terms or not KNOWLEDGE_DIR.exists():
            return []
        results = []
        for path in KNOWLEDGE_DIR.glob("*.md"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            lower = text.lower()
            score = sum(lower.count(t) for t in terms)
            if score == 0:
                continue
            title = next((line.lstrip("# ").strip() for line in text.splitlines() if line.startswith("#")), path.stem)
            # First paragraph containing a search term, as the summary.
            summary = ""
            for para in text.split("\n\n"):
                if any(t in para.lower() for t in terms) and not para.lstrip().startswith("#"):
                    summary = " ".join(para.split())[:280]
                    break
            results.append(RetrievalResult(self.source, title, summary, str(path.name), float(score)))
        results.sort(key=lambda r: -r.score)
        return results[:limit]


class MeetingReportsProvider(Provider):
    """Surfaces previous meetings whose reports mention the query."""

    source = "meetings"

    def search(self, query: str, limit: int = 2) -> list[RetrievalResult]:
        terms = [t for t in re.findall(r"[a-z0-9]+", query.lower()) if len(t) > 2]
        if not terms:
            return []
        db = SessionLocal()
        try:
            meetings = db.scalars(
                select(Meeting).where(Meeting.report_md.is_not(None)).order_by(Meeting.started_at.desc()).limit(20)
            ).all()
        finally:
            db.close()
        results = []
        for m in meetings:
            lower = (m.report_md or "").lower()
            score = sum(lower.count(t) for t in terms)
            if score == 0:
                continue
            idx = min((lower.find(t) for t in terms if t in lower), default=0)
            snippet = " ".join((m.report_md or "")[max(0, idx - 40): idx + 220].split())
            results.append(RetrievalResult(
                self.source, f"{m.title} ({m.started_at:%b %d})", f"…{snippet}…", m.id, float(score),
            ))
        results.sort(key=lambda r: -r.score)
        return results[:limit]


_providers: list[Provider] | None = None


def providers() -> list[Provider]:
    global _providers
    if _providers is None:
        _providers = [LocalDocsProvider(), MeetingReportsProvider()]
        # Future: GitHubProvider(token), JiraProvider(...), ConfluenceProvider(...)
    return _providers


def search_all(query: str, limit_per_provider: int = 2) -> list[RetrievalResult]:
    results: list[RetrievalResult] = []
    for provider in providers():
        try:
            results += provider.search(query, limit_per_provider)
        except Exception:
            continue
    return results
