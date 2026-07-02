"use client";

import { motion } from "framer-motion";
import { CalendarClock, CheckSquare, Square, ListTodo, User } from "lucide-react";
import { ConfidenceChip } from "@/components/ConfidenceChip";
import { fmtTime, type ActionItem } from "@/lib/types";

const PRIORITY: Record<string, string> = {
  high: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  low: "border-slate-400/30 bg-slate-400/10 text-slate-400",
};

export function ActionsPanel({
  actions,
  onToggle,
}: {
  actions: ActionItem[];
  onToggle: (id: string, status: "open" | "done") => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {actions.length === 0 && (
          <p className="pt-6 text-center text-xs text-slate-600">
            <ListTodo className="mx-auto mb-2 h-5 w-5" />
            TODOs, owners and deadlines get captured automatically.
          </p>
        )}
        {actions.map((a, i) => (
          <motion.div
            key={a.id ?? i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-2.5 rounded-xl border border-edge bg-surface/60 px-3 py-2.5 ${
              a.status === "done" ? "opacity-50" : ""
            }`}
          >
            <button
              onClick={() => a.id && onToggle(a.id, a.status === "done" ? "open" : "done")}
              className="mt-0.5 text-slate-500 transition-colors hover:text-accent"
              title="Toggle done"
            >
              {a.status === "done" ? (
                <CheckSquare className="h-4 w-4 text-emerald-400" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
            <div className="flex-1">
              <p className={`text-[13px] leading-relaxed text-slate-200 ${a.status === "done" ? "line-through" : ""}`}>
                {a.task}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                <span className="chip border border-edge text-slate-300">
                  <User className="mr-1 h-2.5 w-2.5" />
                  {a.owner}
                </span>
                {a.deadline && (
                  <span className="chip border border-sky-400/30 bg-sky-400/10 text-sky-300">
                    <CalendarClock className="mr-1 h-2.5 w-2.5" />
                    {a.deadline}
                  </span>
                )}
                <span className={`chip border ${PRIORITY[a.priority]}`}>{a.priority}</span>
                <ConfidenceChip value={a.confidence} />
                <span>captured {fmtTime(a.t)}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
