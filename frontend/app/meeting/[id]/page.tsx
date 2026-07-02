"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckSquare, ExternalLink, FileText, Mic, MicOff, Square } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { MermaidFigure } from "@/components/MermaidFigure";
import { useMeeting, type MeetingState } from "@/lib/useMeeting";
import { fmtTime, type TranscriptSegment } from "@/lib/types";

const TABS = ["notes", "tasks", "decisions", "transcript", "glossary", "activity"] as const;
type Tab = (typeof TABS)[number];

export default function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <MeetingWorkspace id={id} />
    </Suspense>
  );
}

function MeetingWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, startDemo, sendUtterance, endMeeting, markAction, toggleMic, micActive } =
    useMeeting(id);
  const initialTab = (searchParams.get("tab") as Tab) || "notes";
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab) ? initialTab : "notes");
  const [ending, setEnding] = useState(false);
  const demoStarted = useRef(false);
  const popout = useRef<Window | null>(null);

  const isLive = state.meetingStatus === "live";

  useEffect(() => {
    if (searchParams.get("demo") && state.connected && !demoStarted.current && state.segments.length === 0) {
      demoStarted.current = true;
      startDemo();
    }
  }, [state.connected, state.segments.length, searchParams, startDemo]);

  useEffect(() => {
    if (state.reportReady && ending) {
      popout.current?.close();
      router.push(`/meeting/${id}/report`);
    }
  }, [state.reportReady, ending, id, router]);

  const openPopout = async () => {
    if (popout.current && !popout.current.closed) {
      popout.current.close();
      popout.current = null;
      return;
    }
    const url = `${window.location.origin}/meeting/${id}/overlay`;
    const docPiP = (window as unknown as {
      documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> };
    }).documentPictureInPicture;
    if (docPiP) {
      try {
        const pip = await docPiP.requestWindow({ width: 380, height: 300 });
        pip.document.body.style.margin = "0";
        pip.document.body.style.background = "#0e0f10";
        const frame = pip.document.createElement("iframe");
        frame.src = url;
        frame.style.cssText = "width:100%;height:100vh;border:none;";
        pip.document.body.appendChild(frame);
        popout.current = pip;
        return;
      } catch {
        /* fall back to popup */
      }
    }
    popout.current = window.open(url, "copilot-popout", "width=380,height=320,popup=yes");
  };

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <PageHeader
          title={state.meetingTitle || "Meeting"}
          meta={
            isLive ? (
              <span className="tag border-emerald-900 bg-emerald-950/60 text-emerald-400">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                In progress
              </span>
            ) : (
              <span className="tag">Completed</span>
            )
          }
          actions={
            isLive ? (
              <>
                <button
                  onClick={openPopout}
                  className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.04]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Pop out
                </button>
                <button
                  onClick={() => toggleMic("Me")}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                    micActive
                      ? "border-red-900 bg-red-950/40 text-red-300"
                      : "border-edge text-neutral-300 hover:bg-white/[0.04]"
                  }`}
                >
                  {micActive ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {micActive ? "Stop capture" : "Capture audio"}
                </button>
                <button
                  onClick={() => {
                    setEnding(true);
                    endMeeting();
                  }}
                  disabled={ending}
                  className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Square className="h-3 w-3" />
                  {ending ? "Publishing notes…" : "End meeting"}
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push(`/meeting/${id}/report`)}
                className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.04]"
              >
                <FileText className="h-3.5 w-3.5" />
                Full summary
              </button>
            )
          }
        />

        {/* Tab bar */}
        <div className="flex shrink-0 gap-1 border-b border-edge px-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-[13px] capitalize transition-colors ${
                tab === t
                  ? "border-accent font-medium text-neutral-100"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "notes" && <NotesTab state={state} />}
          {tab === "tasks" && <TasksTab state={state} onToggle={markAction} />}
          {tab === "decisions" && <DecisionsTab state={state} />}
          {tab === "transcript" && <TranscriptTab segments={state.segments} />}
          {tab === "glossary" && <GlossaryTab state={state} />}
          {tab === "activity" && <ActivityTab state={state} />}
        </div>

        {isLive && <Composer onSubmit={sendUtterance} micActive={micActive} />}
      </div>
    </AppShell>
  );
}

/* ---------------------------------------------------------------- Notes */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-8 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 first:mt-0">
      {children}
    </h2>
  );
}

function NotesTab({ state }: { state: MeetingState }) {
  const latestNote = state.understandings[state.understandings.length - 1];
  const earlier = state.understandings.slice(0, -1);
  const questions = [...state.questions].sort((a, b) => b.score - a.score).slice(0, 5);
  const references = [...state.retrievals, ...state.memoryItems.map((m) => ({
    source: "meetings", title: m.ref_meeting_title || "Previous meeting",
    summary: m.text, ref: m.ref_meeting_id, t: m.t,
  }))];
  const diagram = state.diagrams[state.diagrams.length - 1];
  const router = useRouter();

  return (
    <div className="max-w-3xl px-6 py-5 text-[14px] leading-relaxed">
      <SectionHeading>Summary</SectionHeading>
      {latestNote ? (
        <p className="text-neutral-300">{latestNote.text}</p>
      ) : (
        <p className="text-neutral-500">Notes are added as the meeting progresses.</p>
      )}

      {earlier.length > 0 && (
        <>
          <SectionHeading>Notes</SectionHeading>
          <ul className="space-y-1.5">
            {earlier.map((u, i) => (
              <li key={i} className="flex gap-3 text-neutral-400">
                <span className="w-10 shrink-0 pt-0.5 font-mono text-[11px] text-neutral-600">{fmtTime(u.t)}</span>
                <span>{u.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {questions.length > 0 && (
        <>
          <SectionHeading>Open questions</SectionHeading>
          <ul className="list-disc space-y-1 pl-5 text-neutral-400 marker:text-neutral-600">
            {questions.map((q, i) => (
              <li key={i}>{q.text}</li>
            ))}
          </ul>
        </>
      )}

      {references.length > 0 && (
        <>
          <SectionHeading>References</SectionHeading>
          <div className="space-y-1.5">
            {references.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-neutral-400">
                <span className="tag mt-0.5 shrink-0">{r.source === "docs" ? "Doc" : "Meeting"}</span>
                <div className="min-w-0">
                  {r.source === "meetings" && r.ref ? (
                    <button
                      onClick={() => router.push(`/meeting/${r.ref}?tab=notes`)}
                      className="text-neutral-300 hover:underline"
                    >
                      {r.title}
                    </button>
                  ) : (
                    <span className="text-neutral-300">{r.title}</span>
                  )}
                  {r.summary && <p className="text-[13px] text-neutral-500">{r.summary}</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {diagram && (
        <>
          <SectionHeading>Architecture</SectionHeading>
          <MermaidFigure code={diagram.mermaid} id={`notes-${diagram.version}`} />
          <p className="mt-1.5 text-[12px] text-neutral-600">
            Figure 1 — systems referenced in this meeting (revision {diagram.version}).
          </p>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Tasks */

function TasksTab({
  state,
  onToggle,
}: {
  state: MeetingState;
  onToggle: (id: string, status: "open" | "done") => void;
}) {
  return (
    <div className="px-6 py-4">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-8" />
            <th>Task</th>
            <th className="w-28">Assignee</th>
            <th className="w-28">Due</th>
            <th className="w-20">Priority</th>
            <th className="w-16">Added</th>
          </tr>
        </thead>
        <tbody>
          {state.actions.map((a, i) => (
            <tr key={a.id ?? i} className={a.status === "done" ? "opacity-50" : ""}>
              <td>
                <button
                  onClick={() => a.id && onToggle(a.id, a.status === "done" ? "open" : "done")}
                  className="text-neutral-500 hover:text-neutral-200"
                  title="Toggle status"
                >
                  {a.status === "done" ? (
                    <CheckSquare className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
              </td>
              <td className={a.status === "done" ? "line-through" : ""}>
                {a.task}
                {(a.confidence ?? 1) < 0.7 && <span className="tag ml-2 text-amber-400">Needs review</span>}
              </td>
              <td className={a.owner === "TBD" ? "text-amber-400" : "text-neutral-400"}>
                {a.owner === "TBD" ? "Unassigned" : a.owner}
              </td>
              <td className="text-neutral-500">{a.deadline || "—"}</td>
              <td className="text-neutral-500">{a.priority}</td>
              <td className="font-mono text-[11px] text-neutral-600">{fmtTime(a.t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.actions.length === 0 && (
        <p className="py-10 text-center text-[13px] text-neutral-500">No tasks recorded in this meeting yet.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Decisions */

function DecisionsTab({ state }: { state: MeetingState }) {
  return (
    <div className="px-6 py-4">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-16">Time</th>
            <th>Decision</th>
            <th className="w-52">Rationale</th>
            <th className="w-24">Owner</th>
          </tr>
        </thead>
        <tbody>
          {state.decisions.map((d, i) => (
            <tr key={d.id ?? i}>
              <td className="font-mono text-[11px] text-neutral-600">{fmtTime(d.t)}</td>
              <td>
                {d.decision}
                {(d.confidence ?? 1) < 0.7 && <span className="tag ml-2 text-amber-400">Needs review</span>}
              </td>
              <td className="text-neutral-500">{d.reason || "—"}</td>
              <td className="text-neutral-400">{d.approved_by || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.decisions.length === 0 && (
        <p className="py-10 text-center text-[13px] text-neutral-500">No decisions recorded in this meeting yet.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Transcript */

function TranscriptTab({ segments }: { segments: TranscriptSegment[] }) {
  // Plain text in collapsible ~2 minute sections. No highlighting.
  const sections = useMemo(() => {
    const out: { from: number; to: number; lines: TranscriptSegment[] }[] = [];
    for (const seg of segments) {
      const block = Math.floor(seg.t / 120);
      if (!out.length || Math.floor(out[out.length - 1].from / 120) !== block) {
        out.push({ from: block * 120, to: block * 120 + 120, lines: [] });
      }
      out[out.length - 1].lines.push(seg);
    }
    return out;
  }, [segments]);

  return (
    <div className="max-w-3xl px-6 py-4">
      {sections.map((section, i) => (
        <details key={i} open={i >= sections.length - 2} className="group mb-1">
          <summary className="cursor-pointer list-none rounded px-2 py-1.5 text-[12px] font-medium text-neutral-500 hover:bg-white/[0.02]">
            <span className="mr-2 inline-block w-3 text-neutral-600 transition-transform group-open:rotate-90">›</span>
            {fmtTime(section.from)} – {fmtTime(Math.min(section.to, segments[segments.length - 1]?.t ?? section.to))}
            <span className="ml-2 font-normal text-neutral-600">{section.lines.length} entries</span>
          </summary>
          <div className="space-y-1.5 py-2 pl-7">
            {section.lines.map((s, j) => (
              <p key={s.id ?? j} className="text-[13px] leading-relaxed text-neutral-400">
                <span className="mr-2 font-mono text-[11px] text-neutral-600">{fmtTime(s.t)}</span>
                <span className="font-medium text-neutral-300">{s.speaker}:</span> {s.text}
              </p>
            ))}
          </div>
        </details>
      ))}
      {segments.length === 0 && (
        <p className="py-10 text-center text-[13px] text-neutral-500">The transcript appears here as people speak.</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Glossary */

function GlossaryTab({ state }: { state: MeetingState }) {
  const terms = [...state.concepts].sort((a, b) => a.term.localeCompare(b.term));
  return (
    <div className="max-w-3xl px-6 py-4">
      {terms.map((c) => (
        <details key={c.term} className="group border-b border-edge py-2.5 last:border-0">
          <summary className="cursor-pointer list-none">
            <div className="flex items-baseline gap-3">
              <span className="text-[14px] font-medium text-neutral-200">{c.term}</span>
              <span className="tag">{c.category}</span>
              <span className="ml-auto text-[11px] text-neutral-600">
                {c.mentions} mention{c.mentions !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">{c.what}</p>
          </summary>
          <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-neutral-500">
            <p>
              <span className="font-medium text-neutral-400">Relevance: </span>
              {c.why_matters}
            </p>
            {c.pitfalls && (
              <p>
                <span className="font-medium text-neutral-400">Common issues: </span>
                {c.pitfalls}
              </p>
            )}
            {(c.prior_meetings?.length ?? 0) > 0 && (
              <p className="text-neutral-600">
                Previously discussed: {c.prior_meetings!.map((m) => `${m.title} (${m.date})`).join("; ")}
              </p>
            )}
          </div>
        </details>
      ))}
      {terms.length === 0 && (
        <p className="py-10 text-center text-[13px] text-neutral-500">
          Terms referenced in the meeting are defined here.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Activity */

function ActivityTab({ state }: { state: MeetingState }) {
  const events = [
    ...state.decisions.map((d) => ({ t: d.t, label: "Decision", text: d.decision })),
    ...state.actions.map((a) => ({ t: a.t, label: "Task", text: `${a.task} — ${a.owner}` })),
    ...state.concepts.map((c) => ({ t: c.first_t, label: "Glossary", text: `Term added: ${c.term}` })),
    ...state.retrievals.map((r) => ({ t: r.t, label: "Reference", text: `Linked: ${r.title}` })),
    ...state.memoryItems.map((m) => ({
      t: m.t,
      label: m.kind === "contradiction" ? "Conflict" : "Reference",
      text: m.text,
    })),
  ].sort((a, b) => a.t - b.t);

  return (
    <div className="max-w-4xl px-6 py-4">
      <div className="rounded-md border border-edge">
        {events.map((e, i) => (
          <div key={i} className={`flex items-start gap-3 px-4 py-2 text-[13px] ${i > 0 ? "border-t border-edge" : ""}`}>
            <span className="w-12 shrink-0 pt-px font-mono text-[11px] text-neutral-600">{fmtTime(e.t)}</span>
            <span className={`tag w-20 shrink-0 justify-center ${e.label === "Conflict" ? "text-amber-400" : ""}`}>
              {e.label}
            </span>
            <p className="min-w-0 flex-1 text-neutral-400">{e.text}</p>
          </div>
        ))}
        {events.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] text-neutral-500">
            Meeting events are logged here as they are recorded.
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Composer */

function Composer({
  onSubmit,
  micActive,
}: {
  onSubmit: (speaker: string, text: string) => void;
  micActive: boolean;
}) {
  const [speaker, setSpeaker] = useState("Me");
  const [text, setText] = useState("");
  const submit = () => {
    if (text.trim()) {
      onSubmit(speaker.trim() || "Me", text.trim());
      setText("");
    }
  };
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-edge px-6 py-3">
      <input
        value={speaker}
        onChange={(e) => setSpeaker(e.target.value)}
        className="w-24 rounded-md border border-edge bg-panel px-2.5 py-1.5 text-[13px] text-neutral-400 outline-none focus:border-neutral-600"
        title="Speaker name"
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={micActive ? "Audio capture is on — entries are added automatically" : "Add transcript entry…"}
        className="flex-1 rounded-md border border-edge bg-panel px-3 py-1.5 text-[13px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-600"
      />
      <button
        onClick={submit}
        className="rounded-md border border-edge px-3 py-1.5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.04]"
      >
        Add
      </button>
    </div>
  );
}
