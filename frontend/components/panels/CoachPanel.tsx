"use client";

import { motion } from "framer-motion";
import { AlarmClock, Compass, Hand, MessageSquareWarning, Target, UserCheck } from "lucide-react";
import { ConfidenceChip } from "@/components/ConfidenceChip";
import { fmtTime, type CoachTip } from "@/lib/types";

const KIND_META: Record<string, { icon: React.ReactNode; label: string; style: string }> = {
  timing: { icon: <Target className="h-3.5 w-3.5" />, label: "timing", style: "border-accent/40 bg-accent/10 text-accent" },
  gap: { icon: <MessageSquareWarning className="h-3.5 w-3.5" />, label: "not discussed", style: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  participation: { icon: <Hand className="h-3.5 w-3.5" />, label: "participation", style: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300" },
  ownership: { icon: <UserCheck className="h-3.5 w-3.5" />, label: "ownership", style: "border-rose-400/40 bg-rose-400/10 text-rose-300" },
  reminder: { icon: <AlarmClock className="h-3.5 w-3.5" />, label: "reminder", style: "border-sky-400/40 bg-sky-400/10 text-sky-300" },
  guidance: { icon: <Compass className="h-3.5 w-3.5" />, label: "guidance", style: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" },
};

export function CoachPanel({ tips }: { tips: CoachTip[] }) {
  const ordered = [...tips].reverse();
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {tips.length === 0 && (
          <p className="pt-6 text-center text-xs text-slate-600">
            <Compass className="mx-auto mb-2 h-5 w-5" />
            Strategic guidance appears here: when to speak, what&apos;s missing, who to nudge.
          </p>
        )}
        {ordered.map((tip, i) => {
          const meta = KIND_META[tip.kind] ?? KIND_META.guidance;
          return (
            <motion.div
              key={`${tip.t}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl border px-3 py-2.5 ${
                tip.urgency === "high"
                  ? "border-rose-400/40 bg-rose-400/[0.07]"
                  : "border-edge bg-surface/60"
              }`}
            >
              <p className="text-[13px] leading-relaxed text-slate-200">{tip.text}</p>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
                <span className={`chip flex items-center gap-1 border ${meta.style}`}>
                  {meta.icon}
                  {meta.label}
                </span>
                <ConfidenceChip value={tip.confidence} />
                {tip.urgency === "high" && (
                  <span className="chip border border-rose-400/40 bg-rose-400/10 text-rose-300">act now</span>
                )}
                <span className="ml-auto">{fmtTime(tip.t)}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
