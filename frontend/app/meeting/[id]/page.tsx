"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain, Compass, FileText, Gavel, GraduationCap, History, ListTodo,
  MessageCircleQuestion, Mic, MicOff, Network, PictureInPicture2, Send,
  Square, Users, Workflow, X,
} from "lucide-react";
import { useMeeting } from "@/lib/useMeeting";
import type { CoachTip } from "@/lib/types";
import { HealthStrip } from "@/components/HealthStrip";
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

const TABS = [
  { key: "coach", label: "Coach", icon: Compass },
  { key: "tutor", label: "Tutor", icon: GraduationCap },
  { key: "questions", label: "Ask", icon: MessageCircleQuestion },
  { key: "actions", label: "Actions", icon: ListTodo },
  { key: "decisions", label: "Decisions", icon: Gavel },
  { key: "memory", label: "Memory", icon: History },
  { key: "arch", label: "Arch", icon: Workflow },
  { key: "graph", label: "Graph", icon: Network },
  { key: "people", label: "People", icon: Users },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <LiveMeeting id={id} />
    </Suspense>
  );
}

/** High-urgency coach tips surface as a transient toast so they aren't missed
 *  while another tab is open. */
function CoachToast({ tips }: { tips: CoachTip[] }) {
  const [visible, setVisible] = useState<CoachTip | null>(null);
  const seen = useRef(0);
  useEffect(() => {
    const fresh = tips.slice(seen.current);
    seen.current = tips.length;
    const urgent = fresh.find((t) => t.urgency === "high");
    if (urgent) {
      setVisible(urgent);
      const timer = setTimeout(() => setVisible(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [tips]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10 }}
          className="fixed bottom-20 right-4 z-50 max-w-sm rounded-xl border border-rose-400/40 bg-panel/95 p-3.5 shadow-2xl shadow-black/50 backdrop-blur-md"
        >
          <div className="flex items-start gap-2.5">
            <Compass className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-rose-300">
                Coach — act now
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-200">{visible.text}</p>
            </div>
            <button onClick={() => setVisible(null)} className="text-slate-500 hover:text-slate-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LiveMeeting({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, startDemo, sendUtterance, endMeeting, markAction, toggleMic, micActive } =
    useMeeting(id);
  const [tab, setTab] = useState<TabKey>("coach");
  const [input, setInput] = useState("");
  const [speaker, setSpeaker] = useState("Me");
  const [ending, setEnding] = useState(false);
  const demoStarted = useRef(false);
  const pipWindow = useRef<Window | null>(null);
  const seen = useRef<Record<TabKey, number>>({
    coach: 0, tutor: 0, questions: 0, actions: 0, decisions: 0,
    memory: 0, arch: 0, graph: 0, people: 0,
  });

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

  // Overlay: Document Picture-in-Picture (a real always-on-top window in
  // Chrome/Edge) hosting the compact overlay route; popup as fallback.
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
        const pip = await docPiP.requestWindow({ width: 380, height: 420 });
        pip.document.body.style.margin = "0";
        pip.document.body.style.background = "#0b0d13";
        const frame = pip.document.createElement("iframe");
        frame.src = overlayUrl;
        frame.style.cssText = "width:100%;height:100vh;border:none;";
        pip.document.body.appendChild(frame);
        pipWindow.current = pip;
        return;
      } catch {
        /* user denied or unsupported — fall through to popup */
      }
    }
    pipWindow.current = window.open(overlayUrl, "copilot-overlay", "width=380,height=440,popup=yes");
  }, [id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        toggleOverlay();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleOverlay]);

  const counts: Record<TabKey, number> = {
    coach: state.coachTips.length,
    tutor: state.concepts.length,
    questions: state.questions.length,
    actions: state.actions.length,
    decisions: state.decisions.length,
    memory: state.memoryItems.length + state.retrievals.length,
    arch: state.diagrams.length ? state.diagrams[state.diagrams.length - 1].version : 0,
    graph: state.nodes.length,
    people: state.people.length,
  };
  seen.current[tab] = counts[tab];

  const submit = () => {
    if (input.trim()) {
      sendUtterance(speaker.trim() || "Me", input.trim());
      setInput("");
    }
  };

  return (
    <main className="flex h-screen flex-col gap-3 p-3">
      <header className="panel shrink-0 flex-row items-center gap-3 px-4 py-2.5">
        <button onClick={() => router.push("/")} className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Meeting Copilot</span>
        </button>
        <span
          className={`chip border ${
            state.connected
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-amber-400/30 bg-amber-400/10 text-amber-300"
          }`}
        >
          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${state.connected ? "live-dot bg-emerald-400" : "bg-amber-400"}`} />
          {state.status}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleOverlay}
            title="Always-on-top overlay (Ctrl+Shift+O)"
            className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-accent/50"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
            Overlay
          </button>
          <button
            onClick={() => toggleMic(speaker)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              micActive
                ? "border-red-400/50 bg-red-400/15 text-red-300"
                : "border-edge text-slate-300 hover:border-accent/50"
            }`}
          >
            {micActive ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {micActive ? "Stop mic" : "Use mic"}
          </button>
          <button
            onClick={() => {
              setEnding(true);
              endMeeting(speaker);
            }}
            disabled={ending}
            className="flex items-center gap-1.5 rounded-lg border border-edge bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-red-400/50 hover:text-red-300 disabled:opacity-60"
          >
            {ending ? (
              <>
                <FileText className="h-3.5 w-3.5 animate-pulse" /> Generating report…
              </>
            ) : (
              <>
                <Square className="h-3 w-3" /> End meeting
              </>
            )}
          </button>
        </div>
      </header>

      <HealthStrip health={state.health} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <TranscriptPanel segments={state.segments} />
        <UnderstandingPanel understandings={state.understandings} insights={state.insights} />

        <div className="panel h-full">
          <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-edge px-1.5 pt-1.5">
            {TABS.map(({ key, label, icon: Icon }) => {
              const unseen = counts[key] - (seen.current[key] ?? 0);
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`relative flex items-center gap-1 rounded-t-lg px-2 py-2 text-[11px] font-medium transition-colors ${
                    tab === key ? "bg-surface/80 text-white" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {counts[key] > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[9px] ${
                        unseen > 0 && tab !== key ? "bg-accent text-white" : "bg-edge text-slate-400"
                      }`}
                    >
                      {counts[key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1">
            {tab === "coach" && <CoachPanel tips={state.coachTips} />}
            {tab === "tutor" && <TutorPanel concepts={state.concepts} />}
            {tab === "questions" && <QuestionsPanel questions={state.questions} />}
            {tab === "actions" && <ActionsPanel actions={state.actions} onToggle={markAction} />}
            {tab === "decisions" && <DecisionsPanel decisions={state.decisions} />}
            {tab === "memory" && <MemoryPanel memoryItems={state.memoryItems} retrievals={state.retrievals} />}
            {tab === "arch" && <ArchPanel diagrams={state.diagrams} />}
            {tab === "graph" && <GraphPanel nodes={state.nodes} edges={state.edges} />}
            {tab === "people" && <PeoplePanel people={state.people} />}
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel shrink-0 flex-row items-center gap-2 px-3 py-2"
      >
        <input
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          className="w-24 rounded-lg border border-edge bg-surface px-2.5 py-2 text-xs text-slate-300 outline-none focus:border-accent/50"
          title="Your name (used as the speaker label)"
        />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={
            micActive
              ? "Mic is listening — final phrases stream in automatically…"
              : "Type what's being said (or use the mic) — the copilot analyzes continuously…"
          }
          className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent/50"
        />
        <button
          onClick={submit}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </button>
      </motion.div>

      <CoachToast tips={state.coachTips} />
    </main>
  );
}
