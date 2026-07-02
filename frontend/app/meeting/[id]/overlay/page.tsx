"use client";

/**
 * The overlay: not a dashboard — a narrow intelligence stream.
 * Default: one focus line + one suggestion. Expand for the breakdown.
 * Lives in a Document PiP window floating over any meeting app.
 */

import { use, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useMeeting } from "@/lib/useMeeting";
import { resolveFocus, resolveSuggestion } from "@/lib/focus";

const MODE_DOT: Record<string, string> = {
  listening: "bg-slate-500",
  insight: "bg-accent",
  coaching: "bg-emerald-400",
  alert: "bg-rose-400",
};

export default function OverlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state } = useMeeting(id);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    document.title = "Copilot";
  }, []);

  const focus = resolveFocus(state);
  const suggestion = resolveSuggestion(state);
  const lastLine = state.segments[state.segments.length - 1];

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-surface px-3 py-2.5 text-[12px]">
      {/* The stream: focus line first, always. */}
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${MODE_DOT[focus.mode]} ${focus.mode !== "listening" ? "live-dot" : ""}`} />
        <AnimatePresence mode="wait">
          <motion.p
            key={`${focus.label}-${focus.t}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`min-w-0 flex-1 leading-snug ${
              focus.mode === "alert" ? "font-medium text-rose-200" : "text-slate-200"
            }`}
          >
            {focus.mode !== "listening" && (
              <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {focus.label}
              </span>
            )}
            {focus.body}
          </motion.p>
        </AnimatePresence>
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 shrink-0 rounded p-0.5 text-slate-600 hover:text-slate-300"
          title={expanded ? "Collapse" : "Expand"}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {suggestion && (
        <p className="mt-1.5 truncate pl-3.5 text-slate-500">
          <span className="text-slate-600">ask · </span>
          {suggestion.text}
        </p>
      )}

      {/* Expanded: the structured breakdown, still quiet. */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-edge pt-2"
          >
            <div className="flex gap-3 text-[10px] text-slate-500">
              <span>{state.decisions.length} decisions</span>
              <span>{state.actions.filter((a) => a.status === "open").length} open actions</span>
              <span>{state.concepts.length} concepts</span>
              {state.health?.topic && <span className="truncate">topic: {state.health.topic}</span>}
            </div>
            {[...state.decisions].slice(-2).map((d, i) => (
              <p key={`d${i}`} className="leading-snug text-slate-400">
                <span className="text-emerald-400">✓ </span>
                {d.decision.slice(0, 120)}
              </p>
            ))}
            {state.actions.filter((a) => a.status === "open").slice(-3).map((a, i) => (
              <p key={`a${i}`} className="leading-snug text-slate-400">
                <span className="text-amber-300">→ </span>
                {a.task.slice(0, 90)} <span className="text-slate-600">({a.owner})</span>
              </p>
            ))}
            {lastLine && (
              <p className="truncate leading-snug text-slate-600">
                <span className="text-slate-500">{lastLine.speaker}</span> — {lastLine.text}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
