"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain, FileText, Gavel, GraduationCap, ListTodo, MessageCircleQuestion,
  Mic, MicOff, Network, Send, Square, Users,
} from "lucide-react";
import { useMeeting } from "@/lib/useMeeting";
import { TranscriptPanel } from "@/components/panels/TranscriptPanel";
import { UnderstandingPanel } from "@/components/panels/UnderstandingPanel";
import { TutorPanel } from "@/components/panels/TutorPanel";
import { QuestionsPanel } from "@/components/panels/QuestionsPanel";
import { ActionsPanel } from "@/components/panels/ActionsPanel";
import { DecisionsPanel } from "@/components/panels/DecisionsPanel";
import { PeoplePanel } from "@/components/panels/PeoplePanel";
import { GraphPanel } from "@/components/panels/GraphPanel";

const TABS = [
  { key: "tutor", label: "Tutor", icon: GraduationCap },
  { key: "questions", label: "Questions", icon: MessageCircleQuestion },
  { key: "actions", label: "Actions", icon: ListTodo },
  { key: "decisions", label: "Decisions", icon: Gavel },
  { key: "people", label: "People", icon: Users },
  { key: "graph", label: "Graph", icon: Network },
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

function LiveMeeting({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, startDemo, sendUtterance, endMeeting, markAction, toggleMic, micActive } =
    useMeeting(id);
  const [tab, setTab] = useState<TabKey>("tutor");
  const [input, setInput] = useState("");
  const [speaker, setSpeaker] = useState("Me");
  const [ending, setEnding] = useState(false);
  const demoStarted = useRef(false);
  const seen = useRef<Record<TabKey, number>>({ tutor: 0, questions: 0, actions: 0, decisions: 0, people: 0, graph: 0 });

  // Auto-start the demo script once connected (when arriving via "Watch a demo").
  useEffect(() => {
    if (searchParams.get("demo") && state.connected && !demoStarted.current && state.segments.length === 0) {
      demoStarted.current = true;
      startDemo();
    }
  }, [state.connected, state.segments.length, searchParams, startDemo]);

  useEffect(() => {
    if (state.reportReady && ending) {
      router.push(`/meeting/${id}/report`);
    }
  }, [state.reportReady, ending, id, router]);

  const counts: Record<TabKey, number> = {
    tutor: state.concepts.length,
    questions: state.questions.length,
    actions: state.actions.length,
    decisions: state.decisions.length,
    people: state.people.length,
    graph: state.nodes.length,
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
      {/* Header */}
      <header className="panel shrink-0 flex-row items-center gap-3 px-4 py-2.5">
        <button onClick={() => router.push("/")} className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Meeting Copilot</span>
        </button>
        <span className="text-slate-600">/</span>
        <span className="truncate text-sm text-slate-300">live session</span>
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

      {/* Panel grid */}
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
                  className={`relative flex items-center gap-1.5 rounded-t-lg px-2.5 py-2 text-[11px] font-medium transition-colors ${
                    tab === key
                      ? "bg-surface/80 text-white"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {counts[key] > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[9px] ${
                        unseen > 0 && tab !== key
                          ? "bg-accent text-white"
                          : "bg-edge text-slate-400"
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
            {tab === "tutor" && <TutorPanel concepts={state.concepts} />}
            {tab === "questions" && <QuestionsPanel questions={state.questions} />}
            {tab === "actions" && <ActionsPanel actions={state.actions} onToggle={markAction} />}
            {tab === "decisions" && <DecisionsPanel decisions={state.decisions} />}
            {tab === "people" && <PeoplePanel people={state.people} />}
            {tab === "graph" && <GraphPanel nodes={state.nodes} edges={state.edges} />}
          </div>
        </div>
      </div>

      {/* Input bar */}
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
              : "Type what's being said (or use the mic) — the copilot analyzes every utterance…"
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
    </main>
  );
}
