# Meeting Copilot — Production Architecture

**Philosophy: AI is the exception, not the default.** The deterministic pipeline runs the
product; frontier models are invoked only where they materially improve the outcome. In the
current implementation, a full meeting produces roughly 150 structured events — with a model
configured, at most ~12 model calls occur (periodic enrichment + one report batch), and with
none configured the product still works end to end. That is the 80–95% target, measured.

Legend: **[live]** = implemented in this repository today. **[target]** = deployment design
this codebase is structured to grow into without rework.

---

## 1. Architecture diagram

```
┌────────────────────────── CLIENT (browser / desktop) ──────────────────────────┐
│ L1 CAPTURE [live: Web Speech API + typed]  [target: native capture agent]      │
│   mic / system audio → VAD → diarization → timestamped utterances              │
│   (audio never leaves the device; only text events go upstream)                │
└───────────────┬─────────────────────────────────────────────────────────────────┘
                │ WebSocket: utterance events
┌───────────────▼─────────────────────────────────────────────────────────────────┐
│ SESSION SERVICE (FastAPI)  [live]                                               │
│   one LiveSession per meeting · 2.5s reasoning tick · channel gate              │
│                                                                                  │
│  L2 EVENT PROCESSING (deterministic)          L3 MEETING STATE ENGINE            │
│   action/decision/deadline patterns    ──►    MeetingState (source of truth)     │
│   concept library · entity lexicon            topic · agreement · checklist      │
│   topic keywords · flow verbs                 speakers · artifacts · confidence  │
│   graph co-occurrence rules                   (LLMs consume STATE, not audio)    │
│                                                                                  │
│  L4 INTELLIGENCE GATEWAY [live: gateway.py]                                      │
│   every stage → NONE | SMALL | MEDIUM | LARGE | POST-MEETING (policy table)      │
│                     │                                                            │
│  L5 MODEL ROUTER [live: llm.py] ── provider-agnostic (Anthropic / any            │
│   /chat/completions endpoint incl. vLLM & Ollama) · per-tier models ·            │
│   metering → /api/usage                                                          │
└──────┬──────────────────────────────┬───────────────────────────────────────────┘
       │                              │
┌──────▼───────────────┐   ┌──────────▼──────────────────────────────────────────┐
│ L6 MEMORY            │   │ L7 CONNECTOR ENGINE [live: retrieval.py providers]  │
│  working (in-proc)   │   │  trigger-only: fires on entity mention, never polls │
│  meeting (DB)        │   │  local docs + past reports today; GitHub/Jira/      │
│  user profile (DB)   │   │  Notion/Slack/Drive = Provider classes [target:MCP] │
│  org/historical (DB) │   └─────────────────────────────────────────────────────┘
└──────────────────────┘
       │ meeting end
┌──────▼──────────────────────────────────────────────────────────────────────────┐
│ L8 REPORT ENGINE [live] — one batched LARGE call + deterministic assembly       │
│   summary · decisions · actions · glossary · timeline · references · exports    │
│   normalized /records API (event|action|decision|risk|note) → export layers     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Service-by-service breakdown

| Service | Responsibility | Scaling unit | Replaceable via |
|---|---|---|---|
| **Capture agent** [target] | VAD, diarization, timestamps, audio cleanup, local STT (whisper.cpp) | per device | STT engine behind one interface (`stt.py` slot exists) |
| **Session service** [live: `live.py`] | WS fan-out, reasoning tick, channel gate (event/action/risk live; decision/note silent) | per meeting (stateless apart from MeetingState) | any WS host; state snapshot enables handoff |
| **Event processors** [live: `agents/`] | deterministic extraction: PM (actions/decisions), Risk (alerts/gaps), Teacher (concept library), Architect (flow lexicon), Memory (SQL lookups), Documentarian (topic/narrative) | in-process per session; CPU-bound, no I/O except Memory | each agent is one class behind `Agent.tick()` |
| **State engine** [live: `state.py`] | the continuously updated MeetingState — the only thing models ever read | per meeting, in-memory + periodic snapshot | dataclass; serializable |
| **Intelligence gateway** [live: `gateway.py`] | explicit stage→tier policy; default NO | shared policy table | edit one table |
| **Model router** [live: `llm.py`] | provider abstraction, per-tier model resolution, metering, JSON coercion | stateless | add a `Provider` subclass |
| **Memory store** [live: SQLite/SQLAlchemy] | meetings, records, profile, org history | Postgres + read replicas [target] | `DATABASE_URL` |
| **Connector engine** [live: `retrieval.py`] | trigger-only context fetch | stateless workers | add a `Provider` subclass / MCP server |
| **Report engine** [live: `report.py`] | post-meeting document + comms drafts | async job [target: queue] | template + one LARGE call |

---

## 3. Event flow (one utterance, live meeting)

```
utterance ──► persist Segment ──► broadcast {channel:event}          (< 10 ms)
   │
   └─(next 2.5s tick, batched with peers)
        ├─ L2 deterministic extractors over new segments             (< 5 ms, CPU)
        │    action? ──► persist ──► broadcast {channel:action}
        │    decision? ──► persist ──► SILENT (post-meeting)
        │    concept/topic/graph/checklist ──► state update ──► SILENT
        ├─ risk promotion rule (contradiction | high-conf alert)
        │    ──► broadcast {channel:risk}  (the only interrupt)
        ├─ L4 gate: tick%3 ∧ provider? ──► L5 MEDIUM enrichment over STATE WINDOW
        │    (never per-utterance; results persist as notes, stay silent)
        └─ health snapshot ──► persist ──► SILENT

meeting end ──► final tick ──► L8 report: ONE batched LARGE call + assembly
            ──► /records exposes {events, actions, decisions, risks, notes}
```

Everything on the live path is deterministic → the <500 ms budget is met with ~10 ms to
spare; model calls are structurally off the live path (enrichment lands as silent notes).

## 4. Model routing strategy

The gateway (`gateway.py`) is a single policy table; the router (`llm.py`) resolves tiers to
providers/models from env (`LLM_PROVIDER`, `MODEL_SMALL/MEDIUM/LARGE`).

| Stage | Tier | Why |
|---|---|---|
| transcript, actions, decisions, concepts, topics, checklist, graph, architecture flows, memory lookups, retrieval, risk promotion | **NONE** | patterns, dictionaries, counters and SQL are accurate enough and free; they also define the product's floor when offline |
| entity disambiguation, utterance classification [target] | **SMALL** | cheap, high-volume, latency-tolerant (≤1s); local-model friendly |
| live enrichment (narrative, novel concepts, questions) — every ~3 ticks over the state window | **MEDIUM** | genuine synthesis; batched so cost is O(minutes), not O(utterances) |
| contradiction verification before an interrupt [policy slot exists] | **MEDIUM** | a false interrupt is the most expensive UX failure; worth one verification call |
| report generation | **LARGE** | one batched call per meeting; quality matters, latency doesn't |

Provider-agnostic by construction: `AnthropicProvider` (SDK) and `OpenAICompatProvider`
(plain HTTP — OpenAI, Azure, vLLM, Ollama, llama.cpp). Adding a provider is one subclass;
no call site names a vendor.

## 5. Cost optimization

- **Structural**: models read the compact MeetingState window, never raw transcripts; live
  enrichment is time-batched (~12 MEDIUM calls per 30-min meeting); the report is one LARGE
  call. Worst case ≈ 40–60k tokens/meeting; typical freemium meeting with no key = $0.00.
- **Tiering**: the cheapest model that survives the task, per stage; overridable per tier.
- **Metering** [live: `/api/usage`]: calls, tokens, latency, errors per tier — cost is
  observable per meeting, alertable per org, and budgetable (per-plan tier caps [target]).
- **Freemium shape**: free = deterministic pipeline + SMALL-tier on shared local models;
  paid = MEDIUM enrichment + LARGE reports; enterprise = BYO endpoint (vLLM in their VPC).

## 6. Latency optimization

- Live path is model-free (see §3); transcript echo is a single DB insert + fan-out.
- The 2.5 s tick batches extractor work; each tick is a few ms of CPU.
- Enrichment runs concurrently with the loop and lands silently — it can take 5 s without
  anyone noticing, because nothing on screen waits for it.
- [target] Local capture does STT on-device (whisper.cpp streaming), removing the
  largest latency+cost item entirely; per-region session placement; Redis pub/sub fan-out
  when a meeting has many viewers.

## 7. Failure recovery

- **Model outage**: router errors are caught per call; gateway returns NONE when no provider
  answers — the meeting continues on the deterministic floor (this is tested: the entire
  E2E suite runs with no provider). Enrichment failure logs and "heuristic output stands."
- **Session crash**: every event is persisted before broadcast; the client hydrates full
  state over REST on reconnect (exists today — refresh mid-meeting loses nothing).
  [target] MeetingState snapshot per tick → any replica can adopt a meeting.
- **DB unavailability**: [target] session buffers events locally and replays; capture agent
  spools to disk offline and syncs.
- **Report failure**: retried; on repeated failure the deterministic assembly (which needs
  no model) still publishes — a degraded report beats no report.

## 8. Privacy & security

- **Data minimization by layer**: audio never leaves the device (L1 is local); the server
  sees text events; models see distilled state windows, not raw transcripts, and never see
  audio. Offline mode = nothing leaves the machine at all.
- **Boundaries**: memory is partitioned meeting → user → org; user profile is explicitly
  separate from org history; cross-org retrieval is structurally impossible (queries are
  org-scoped [target: row-level security in Postgres]).
- **Enterprise governance** [target]: BYO model endpoint (supported today via
  `OPENAI_BASE_URL`), per-org retention windows, audit log of every model call (the
  metering hook is the attachment point), SSO/SCIM on the workspace, encryption at rest.
- **Connectors** are read-only, trigger-scoped (fetch only the entity mentioned), and
  export is a deliberate act against the normalized `/records` schema — integrations can
  never widen what the live system shows.

## 9. Scalability: 10 → 1,000,000 users

| Stage | Users | Change | Why it's enough |
|---|---|---|---|
| 0 [live] | 10–100 | this repo: 1 process, SQLite | a meeting costs ~ms of CPU per tick; one box runs hundreds of concurrent meetings |
| 1 | 100–5k | Postgres (`DATABASE_URL`), 2+ session replicas behind sticky WS LB, report jobs → task queue | sessions are per-meeting units; nothing shares state |
| 2 | 5k–100k | Redis pub/sub for fan-out + session handoff snapshots; connector workers as a pool; per-tier model quotas | removes the only two couplings (socket locality, burst model spend) |
| 3 | 100k–1M | shard meetings by org across cells; read replicas for memory/search; object storage for reports; regional cells for latency/residency | cell architecture: each cell is just Stage-2, repeated |

The scaling story is credible precisely because the unit of work (a meeting session) is
small, isolated, and mostly deterministic — the expensive dependency (LLM) is already
batched, quota-able, and provider-swappable.

## 10. Technology stack & justification

| Concern | Choice | Why |
|---|---|---|
| Session/API | **FastAPI + uvicorn** [live] | async WS + REST in one process; boring, typed, huge ecosystem |
| Extraction | **Pure Python (regex/dicts/SQL)** [live] | deterministic, testable, zero-latency; the product's floor |
| State | **In-memory dataclass + SQL snapshot** [live] | source of truth is small (KBs); trivially serializable |
| Store | **SQLite → Postgres** via SQLAlchemy [live] | one env var to graduate; Postgres adds RLS, replicas, pgvector later |
| Fan-out | **In-proc → Redis pub/sub** [target] | only needed at Stage 2; standard |
| Queue | **Task queue (e.g. Celery/RQ/pg-based)** [target] | reports/exports are classic background jobs |
| Models | **Tiered router, Anthropic SDK + OpenAI-compatible HTTP** [live] | covers every hosted and local provider that matters with two classes |
| Local STT | **whisper.cpp / Deepgram fallback** [target] | on-device first for privacy and cost; hosted for quality when allowed |
| Connectors | **Provider classes; MCP where servers exist** [live interface] | trigger-only retrieval keeps them stateless and cheap |
| Observability | **/api/usage metering now; OTel traces** [target] | the router hook is where spans and cost records attach |

**What was deliberately not chosen**: microservices at this stage (the session is the natural
service boundary; splitting earlier adds network hops to a CPU-cheap pipeline), Kafka (no
replay consumer exists yet that SQL doesn't serve), vector DBs (keyword + subject-term
retrieval is winning at current scale; pgvector is the upgrade path, not a rewrite).
