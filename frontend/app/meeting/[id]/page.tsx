"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Mic, MicOff, PictureInPicture2, Send, Square } from "lucide-react";
import { useMeeting } from "@/lib/useMeeting";
import { resolveFocus, resolveSuggestion } from "@/lib/focus";
import { FocusCard } from "@/components/FocusCard";
import { Drawer } from "@/components/Drawer";
import { TranscriptPanel } from "@/components/panels/TranscriptPanel";
import { UnderstandingPanel } from "@/components/panels/UnderstandingPanel";
import { TutorPanel } from "@/components/panels/TutorPanel";
import { CoachPanel } from "@/components/panels/CoachPanel";
import { QuestionsPanel } from "@/components/panels/QuestionsPanel";
import { ActionsPanel } from "@/components/panels/ActionsPanel";
import { DecisionsPanel } from "@/components/panels/DecisionsPanel";
import { PeoplePanel } from "@/components/panels/PeoplePanel";
import { GraphPanel } from "@/components/panels/GraphPanel";
import { MemoryPanel } from "@/components/panels/MemoryPanel";
import { ArchPanel } from "@/components/panels/ArchPanel";

type DrawerKey =
  | "actions" | "decisions" | "concepts" | "people"
  | "transcript" | "reasoning" | "questions" | "memory" | "arch" | "graph" | "coach"
  | null;

const DRAWER_TITLES: Record<Exclude<DrawerKey, null>, string> = {
  actions: "Action items",
  decisions: "Decisions",
  concepts: "Concepts explained",
  people: "People",
  transcript: "Transcript",
  reasoning: "AI reasoning",
  questions: "Questions worth asking",
  memory: "Memory & context",
  arch: "Architecture",
  graph: "Knowledge graph",
  coach: "Coaching log",
};

export default function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <LiveMeeting id={id} />
    </Suspense>
  );
}

function LiveMeeting({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, startDemo, sendUtterance, endMeeting, markAction, toggleMic, micActive } =
    useMeeting(id);
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [input, setInput] = useState("");
  const [speaker, setSpeaker] = useState("Me");
  const [ending, setEnding] = useState(false);
  const [copied, setCopied] = useState(false);
  const demoStarted = useRef(false);
  const pipWindow = useRef<Window | null>(null);

  useEffect(() => {
    if (searchParams.get("demo") && state.connected && !demoStarted.current && state.segments.length === 0) {
      demoStarted.current = true;
      startDemo();
    }
  }, [state.connected, state.segments.length, searchParams, startDemo]);

  useEffect(() => {
    if (state.reportReady && ending) {
      pipWindow.current?.close();
      router.push(`/meeting/${id}/report`);
    }
  }, [state.reportReady, ending, id, router]);

  const toggleOverlay = useCallback(async () => {
    if (pipWindow.current && !pipWindow.current.closed) {
      pipWindow.current.close();
      pipWindow.current = null;
      return;
    }
    const overlayUrl = `${window.location.origin}/meeting/${id}/overlay`;
    const docPiP = (window as unknown as {
      documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> };
    }).documentPictureInPicture;
    if (docPiP) {
      try {
        const pip = await docPiP.requestWindow({ width: 360, height: 200 });
        pip.document.body.style.margin = "0";
        pip.document.body.style.background = "#0b0d13";
        const frame = pip.document.createElement("iframe");
        frame.src = overlayUrl;
        frame.style.cssText = "width:100%;height:100vh;border:none;";
        pip.document.body.appendChild(frame);
        pipWindow.current = pip;
        return;
      } catch {
        /* fall through to popup */
      }
    }
    pipWindow.current = window.open(overlayUrl, "copilot-overlay", "width=360,height=240,popup=yes");
  }, [id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        toggleOverlay();
      }
      if (e.key === "Escape") setDrawer(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleOverlay]);

  const focus = resolveFocus(state);
  const suggestion = resolveSuggestion(state);
  const lastLine = state.segments[state.segments.length - 1];

  const submit = () => {
    if (input.trim()) {
      sendUtterance(speaker.trim() || "Me", input.trim());
      setInput("");
    }
  };

  const secondary: { key: Exclude<DrawerKey, null>; label: string; count: number }[] = [
    { key: "actions", label: "Actions", count: state.actions.length },
    { key: "decisions", label: "Decisions", count: state.decisions.length },
    { key: "concepts", label: "Concepts", count: state.concepts.length },
    { key: "people", label: "People", count: state.people.length },
  ];
  const tertiary: { key: Exclude<DrawerKey, null>; label: string }[] = [
    { key: "transcript", label: "Transcript" },
    { key: "reasoning", label: "Reasoning" },
    { key: "memory", label: "Memory" },
    { key: "arch", label: "Architecture" },
    { key: "graph", label: "Graph" },
    { key: "coach", label: "Coach log" },
  ];

  return (
    <main className="flex h-screen flex-col">
      {/* One-line header: identity, status, topic — actions on the right. */}
      <header className="flex shrink-0 items-center gap-2.5 px-5 py-3 text-xs">
        <button onClick={() => router.push("/")} className="flex items-center gap-2 text-slate-300 hover:text-white">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-accent" />
          <span className="font-semibold">Copilot</span>
        </button>
        <span className={`h-1.5 w-1.5 rounded-full ${state.connected ? "live-dot bg-emerald-400" : "bg-amber-400"}`} />
        {state.health?.topic && (
          <span className="truncate text-slate-500">{state.health.topic}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={toggleOverlay}
            title="Always-on-top overlay (Ctrl+Shift+O)"
            className="rounded-lg px-2.5 py-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => toggleMic(speaker)}
            title={micActive ? "Stop microphone" : "Use microphone"}
            className={`rounded-lg px-2.5 py-1.5 transition-colors ${
              micActive ? "text-red-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {micActive ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => {
              setEnding(true);
              endMeeting(speaker);
            }}
            disabled={ending}
            className="ml-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-rose-300 disabled:opacity-50"
          >
            <Square className="h-3 w-3" />
            {ending ? "Generating report…" : "End"}
          </button>
        </div>
      </header>

      {/* The intelligence stream: one focus, one suggestion. Centered, calm. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5">
        <div className="w-full max-w-xl space-y-4">
          <FocusCard focus={focus} onOpenConcept={() => setDrawer("concepts")} />

          {suggestion && (
            <motion.div
              layout
              className={`flex items-start gap-3 px-2 transition-opacity duration-300 ${
                focus.mode === "alert" ? "opacity-40" : "opacity-100"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Worth asking · </span>
                  {suggestion.text}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-600">{suggestion.hint}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(suggestion.text).catch(() => undefined);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                title="Copy"
                className="mt-0.5 shrink-0 rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-300"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setDrawer("questions")}
                className="mt-1 shrink-0 text-[11px] text-slate-600 transition-colors hover:text-slate-400"
              >
                more
              </button>
            </motion.div>
          )}

          {/* Everything else: quiet typography, one click each. */}
          <div className="space-y-1.5 px-2 pt-4">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              {secondary.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setDrawer(s.key)}
                  className="text-slate-400 transition-colors hover:text-white"
                >
                  {s.label}
                  {s.count > 0 && <span className="ml-1 text-slate-600">{s.count}</span>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              {tertiary.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setDrawer(s.key)}
                  className="text-slate-600 transition-colors hover:text-slate-400"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Passive transcript: one faint line, then input. */}
      <div className="shrink-0 px-5 pb-4">
        <div className="mx-auto w-full max-w-xl">
          <AnimatePresence mode="wait">
            {lastLine && (
              <motion.p
                key={lastLine.id ?? lastLine.t}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mb-2 truncate px-2 text-xs text-slate-600"
              >
                <span className="text-slate-500">{lastLine.speaker}</span> — {lastLine.text}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2">
            <input
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              className="w-20 rounded-xl border border-edge bg-panel px-2.5 py-2 text-xs text-slate-400 outline-none focus:border-accent/50"
              title="Your name"
            />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={micActive ? "Mic is listening…" : "Type what's being said…"}
              className="flex-1 rounded-xl border border-edge bg-panel px-3.5 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent/50"
            />
            <button
              onClick={submit}
              className="rounded-xl bg-accent px-3 py-2 text-white transition-opacity hover:opacity-90"
              title="Send"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <Drawer
        title={drawer ? DRAWER_TITLES[drawer] : ""}
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        wide={drawer === "transcript" || drawer === "graph" || drawer === "arch"}
      >
        {drawer === "actions" && <ActionsPanel actions={state.actions} onToggle={markAction} />}
        {drawer === "decisions" && <DecisionsPanel decisions={state.decisions} />}
        {drawer === "concepts" && <TutorPanel concepts={state.concepts} />}
        {drawer === "people" && <PeoplePanel people={state.people} />}
        {drawer === "transcript" && <TranscriptPanel segments={state.segments} />}
        {drawer === "reasoning" && (
          <UnderstandingPanel understandings={state.understandings} insights={state.insights} />
        )}
        {drawer === "questions" && <QuestionsPanel questions={state.questions} />}
        {drawer === "memory" && <MemoryPanel memoryItems={state.memoryItems} retrievals={state.retrievals} />}
        {drawer === "arch" && <ArchPanel diagrams={state.diagrams} />}
        {drawer === "graph" && <GraphPanel nodes={state.nodes} edges={state.edges} />}
        {drawer === "coach" && <CoachPanel tips={state.coachTips} />}
      </Drawer>
    </main>
  );
}
