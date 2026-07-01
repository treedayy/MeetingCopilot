# Meeting Copilot

An AI teammate that sits silently in your meetings, understands everything being discussed, teaches you the concepts you don't know, suggests intelligent questions, and produces executive-quality documentation the moment the meeting ends.

Not a transcription app — an elite staff engineer, TPM, researcher and tutor working quietly beside you.

## What it does, live

| Panel | What you get |
|---|---|
| **Live transcript** | Speaker-separated, timestamped, searchable; important moments highlighted |
| **Live AI understanding** | A continuously updated "what is happening and why it matters" narrative, plus the copilot's running private thoughts ("they seem worried about scalability", "a blocker was mentioned", "nobody has discussed security yet") |
| **Concept tutor** | The moment someone says *OAuth, Redis, Kafka, RAG, optimistic concurrency…* you privately get: what it is, why it matters, why *they* are discussing it, beginner & advanced explanations, an analogy, common mistakes, and related concepts |
| **Suggested questions** | Ranked questions an experienced engineer would ask right now — clarifying, strategic, architecture, risk, timeline — each with a usefulness score and rationale, one click to copy |
| **Action items** | TODOs auto-detected with owner, deadline, priority, status; toggle done live |
| **Decision log** | Every decision structured: what, reason, alternatives, tradeoffs, who approved, when |
| **People** | Speaking share, inferred role, expertise, sentiment, influence per participant |
| **Knowledge graph** | A live force-directed graph connecting people ↔ technologies ↔ projects as the discussion evolves |

When the meeting ends you get a full markdown report: executive summary, timeline, decisions table, action items table, risks, questions worth raising, every technology explained, a ranked "learn this afterwards" path, people summary, your participation, plus a drafted follow-up email and Slack update — copyable and downloadable.

Everything is persisted: **meeting memory** on the home page searches every transcript line, decision, action item and concept across all past meetings ("when did we discuss authentication?").

## Architecture

```
frontend/  Next.js 15 · React 19 · TypeScript · Tailwind 4 · Framer Motion
           └── WebSocket client → live panels, custom SVG force-graph
backend/   FastAPI · SQLAlchemy (SQLite by default, Postgres-ready) · WebSockets
           ├── live.py       per-meeting session hub: ingest → analyze → persist → broadcast
           ├── analyst.py    the intelligence: two engines behind one interface
           │     ├── LLM engine (Claude) — structured extraction of everything, when a key is set
           │     └── heuristic engine — pattern matching + built-in concept library, zero keys
           ├── report.py     end-of-meeting executive report (LLM-enhanced when available)
           └── simulator.py  a scripted, realistic engineering meeting for demo mode
```

Speech input is pluggable:
- **Demo mode** — a realistic scripted meeting streams in; zero setup.
- **Live mode** — browser Web Speech API (Chrome/Edge) transcribes your microphone for free, or type utterances manually. A `DEEPGRAM_API_KEY` slot exists for production-grade server-side STT with diarization.

## Quick start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

Runs fully offline. To enable Claude-powered analysis and reports:

```bash
cp .env.example .env   # then set ANTHROPIC_API_KEY
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** and click **“Watch a demo meeting.”**

### Tests

```bash
cd backend
python test_pipeline.py   # offline: full pipeline + report, no server needed
python test_e2e.py        # against a running server: real WebSocket session
```

## Configuration (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | Enables Claude for live analysis + reports; otherwise heuristic mode |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Model for analysis passes |
| `DATABASE_URL` | `sqlite:///./meetingcopilot.db` | Any SQLAlchemy URL (Postgres for production) |
| `ANALYSIS_EVERY_SEGMENTS` | `4` | How many utterances trigger a deep analysis pass |
| `DEEPGRAM_API_KEY` | *(empty)* | Reserved for server-side streaming STT |

## How the live pipeline works

1. An utterance arrives (simulator, mic, or typed) → persisted, broadcast to every connected panel.
2. A **fast pass** runs instantly on each utterance: concept detection, action/decision extraction, insight triggers, people stats, graph updates.
3. Every N utterances a **deep pass** runs: the LLM (or heuristics) produces the evolving "what is happening" narrative and freshly ranked suggested questions, deduplicated against everything already extracted.
4. On end: a final pass, then the full report is generated and stored on the meeting.

## Roadmap

- Server-side streaming STT with real diarization (Deepgram/Whisper) and meeting-bot ingestion for Meet/Zoom/Teams
- Company context retrieval: GitHub/Jira/Confluence/Notion/Slack connectors feeding RAG over org knowledge
- Embedding-based semantic meeting memory (pgvector) on top of the existing keyword search
- Cross-meeting knowledge graph and conflicting-decision detection
- Confidence scores on extracted items; personalization by role and learning progress
