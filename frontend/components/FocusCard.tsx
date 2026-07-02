"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Focus } from "@/lib/focus";

const MODE_STYLE: Record<Focus["mode"], { kicker: string; border: string; dot: string }> = {
  listening: { kicker: "text-slate-500", border: "border-edge", dot: "bg-slate-500" },
  insight: { kicker: "text-accent", border: "border-accent/30", dot: "bg-accent" },
  coaching: { kicker: "text-emerald-300", border: "border-emerald-400/30", dot: "bg-emerald-400" },
  alert: { kicker: "text-rose-300", border: "border-rose-400/50", dot: "bg-rose-400" },
};

/** The single dominant idea. Everything else on screen defers to this. */
export function FocusCard({ focus, onOpenConcept }: { focus: Focus; onOpenConcept?: () => void }) {
  const [showDetail, setShowDetail] = useState(false);
  const style = MODE_STYLE[focus.mode];
  const key = `${focus.mode}-${focus.label}-${focus.t}`;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25 }}
        className={`rounded-2xl border bg-panel/60 px-6 py-5 ${style.border} ${
          focus.mode === "alert" ? "shadow-lg shadow-rose-950/40" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${focus.mode !== "listening" ? "live-dot" : ""}`} />
          <span className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${style.kicker}`}>
            {focus.label}
          </span>
          {focus.confidence !== undefined && focus.confidence < 0.7 && (
            <span className="text-[10px] text-slate-500">inference · {Math.round(focus.confidence * 100)}%</span>
          )}
        </div>
        <p className={`mt-2.5 leading-relaxed ${
          focus.mode === "listening" ? "text-[15px] text-slate-400" : "text-[17px] text-slate-100"
        }`}>
          {focus.body}
        </p>
        {(focus.detail || focus.concept) && (
          <div className="mt-3">
            {!showDetail ? (
              <button
                onClick={() => setShowDetail(true)}
                className="text-xs text-slate-500 transition-colors hover:text-slate-300"
              >
                why? ↓
              </button>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 text-sm text-slate-400">
                {focus.detail && <p>{focus.detail}</p>}
                {focus.concept && (
                  <button onClick={onOpenConcept} className="text-xs text-accent hover:underline">
                    full explanation →
                  </button>
                )}
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
