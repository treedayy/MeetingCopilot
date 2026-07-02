# Meeting Copilot

An AI teammate that exists alongside you throughout every meeting: it understands everything being discussed, remembers every past meeting, teaches you the concepts you don't know, coaches your participation in real time, and produces executive-quality documentation the moment the meeting ends.

Not a transcription app — an elite staff engineer, TPM, researcher and mentor working quietly beside you, with the goal of making you significantly smarter **during** the meeting, not afterward.

## The live experience

A **continuous reasoning engine** re-evaluates the whole meeting every 2.5 seconds against an evolving meeting state — topic, agreement level, assumptions, imminent decisions, missing information — instead of treating utterances independently. Eight specialized agents contribute on every tick:

| Agent | What it gives you live |
|---|---|
| **Coach** | Strategic participation guidance: "nobody owns that action item — ask who's taking it", "the topic just shifted, good moment to jump in", "you haven't spoken yet; here's an easy entry", "possible disagreement between Tom and Dev". High-urgency tips surface as toasts. |
| **Teacher** | Concept Tutor 2.0: beginner / intermediate / advanced / interview-answer explanations, analogies, pitfalls, why it matters *in this meeting*, links to previous meetings that discussed it — and it knows what you've already learned, so familiar concepts collapse into "you know this". |
| **Memory** | The AI memory timeline: "Redis has come up in 3 previous meetings, most recently Jun 18", "⚠️ this may contradict a decision from the API design review", plus automatic retrieval from the knowledge base and past meeting reports. |
| **Architect** | A live **Mermaid architecture diagram** built from how the team describes systems talking to each other, with a version slider showing how it evolved. |
| **PM** | Action items (owner, deadline, priority) and structured decisions — every one with a **confidence score** that visually distinguishes facts from inferences. |
| **Risk** | Emerging blockers and risks, plus the **missing-information detector**: no rollback plan, no owner, no security discussion, no success metrics → proactive recommendations. |
| **Question** | Ranked strategic questions that make you sound informed, one click to copy. |
| **Documentarian** | The running "what is happening and why it matters" narrative, topic-shift detection, and (with an API key) periodic Claude enrichment of the whole state. |

A **meeting health strip** stays pinned above the panels: current topic + confidence, room mood (consensus / discussing / tension), engagement, participation balance, discussion completeness (expandable checklist), and estimated progress.

## After the meeting

- **Interactive replay** — drag a timeline slider and watch the transcript, the AI's reasoning, the knowledge graph and the architecture diagram rebuild themselves exactly as they happened. Decision markers dot the timeline.
- **Executive Report 2.0** — summary, timeline, decisions & actions (with confidence), historical context, architecture diagram, risks, meeting health metrics, coaching recap, confidence analysis ("verify these inferences"), technologies explained, ranked learning plan, recommended reading, drafted follow-up email and Slack update.
- **Meeting memory** — search everything ever discussed across all meetings from the home page.

## Overlay mode

Click **Overlay** (or `Ctrl+Shift+O`) during a meeting to pop a compact copilot — latest understanding, coach tip, top question, live transcript — into an **always-on-top Document Picture-in-Picture window** (Chrome/Edge). It floats over Zoom, Meet, Teams, Discord, anything: platform-agnostic, no meeting bots required. Falls back to a small popup in other browsers.

## Personalization

The settings page stores your name, role, experience, preferred explanation depth, known technologies and learning goals. The Teacher marks known concepts, tracks everything it has taught you across meetings, and the Coach uses your name to monitor your participation.

## Architecture

```
frontend/  Next.js 15 · React 19 · TypeScript · Tailwind 4 · Framer Motion · Mermaid
           └── WebSocket client → health strip + 9 live panels, replay, PiP overlay
backend/   FastAPI · SQLAlchemy (SQLite by default, Postgres-ready) · WebSockets
           ├── state.py        MeetingState — the single evolving model of the meeting
           ├── agents/         Coach · Teacher · Memory · Architect · PM · Risk ·
           │                   Question · Documentarian, run by a Coordinator
           ├── live.py         session hub + the 2.5s continuous reasoning loop
           ├── retrieval.py    pluggable providers (local knowledge docs + past reports;
           │                   GitHub/Jira/Confluence slot in as new Provider classes)
           ├── seed.py         seeded meeting history so memory/contradictions demo offline
           └── report.py       Executive Report 2.0
```

Everything is event-driven: agents emit typed events (`concept`, `coach`, `memory`, `diagram`, `state_update`, …) that are persisted and streamed over one WebSocket. Adding a capability = adding an agent; adding a data source = adding a retrieval provider.

Two brains behind one interface: with `ANTHROPIC_API_KEY` set, Claude enriches understanding, concepts and questions; without it, a fully offline heuristic engine (pattern extraction + a curated concept library) runs the entire product — which is what the demo uses.

## Quick start

```bash
# backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** → **“Watch a demo meeting.”** The first demo also seeds two historical meetings so the memory timeline, contradiction detection and prior-meeting links all fire.

### Tests

```bash
cd backend
python test_pipeline.py   # offline: full multi-agent pipeline + report, asserts contradictions/coach/diagrams
python test_e2e.py        # against a running server: real WebSocket session, all V2 event types
```

## Configuration (`backend/.env`)

The model layer is provider-agnostic and tiered — see [ARCHITECTURE.md](ARCHITECTURE.md)
for the full production architecture (intelligence gateway, model router, memory,
connectors, scaling plan).

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `auto` | `anthropic`, `openai` (any /chat/completions endpoint incl. vLLM/Ollama), or `none` |
| `ANTHROPIC_API_KEY` | *(empty)* | Enables the Anthropic provider |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | *(empty)* / api.openai.com | OpenAI-compatible provider, including local models |
| `MODEL_SMALL` / `MODEL_MEDIUM` / `MODEL_LARGE` | per-provider defaults | Per-tier model overrides |
| `DATABASE_URL` | `sqlite:///./meetingcopilot.db` | Any SQLAlchemy URL |
| `DEEPGRAM_API_KEY` | *(empty)* | Reserved for server-side streaming STT with diarization |

With no provider configured the deterministic pipeline runs the entire product offline;
model usage is metered per tier at `/api/usage`.

Live-mic mode uses the browser Web Speech API (Chrome/Edge) — free, no keys. Knowledge base = markdown files in `backend/knowledge/`.

## Roadmap

- Real retrieval connectors (GitHub, Jira, Confluence, Notion, Drive) behind the existing Provider interface
- Server-side streaming STT with true diarization; system-audio capture for the overlay
- Embedding-based semantic memory (pgvector) on top of keyword search
- A packaged desktop overlay (Tauri) with click-through and edge docking
- Question prediction and cross-meeting organizational knowledge graph
