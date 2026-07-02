"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, ChevronDown } from "lucide-react";
import type { HealthState } from "@/lib/types";

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex min-w-24 flex-col gap-1">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-500">
        <span>{label}</span>
        <span className="text-slate-400">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-edge">
        <motion.div
          className={`h-full rounded-full ${color}`}
          animate={{ width: `${Math.round(value * 100)}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </div>
  );
}

export function HealthStrip({ health }: { health: HealthState | null }) {
  const [showChecklist, setShowChecklist] = useState(false);
  if (!health) {
    return (
      <div className="panel shrink-0 flex-row items-center gap-2 px-4 py-2 text-xs text-slate-600">
        <Activity className="h-3.5 w-3.5" />
        Meeting health will appear as the discussion develops…
      </div>
    );
  }
  const agreementLabel =
    health.agreement > 0.25 ? "consensus" : health.agreement < -0.25 ? "tension" : "discussing";
  const agreementColor =
    health.agreement > 0.25 ? "text-emerald-300" : health.agreement < -0.25 ? "text-rose-300" : "text-slate-300";

  return (
    <div className="panel relative shrink-0 px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-accent" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Current topic</div>
            <div className="text-xs font-semibold text-slate-100">
              {health.topic || "—"}
              <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                {Math.round(health.topic_confidence * 100)}%
              </span>
            </div>
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Mood</div>
          <div className={`text-xs font-semibold ${agreementColor}`}>{agreementLabel}</div>
        </div>
        <Meter label="Engagement" value={health.engagement} color="bg-gradient-to-r from-accent to-accent-2" />
        <Meter label="Balance" value={health.balance} color="bg-gradient-to-r from-accent to-accent-2" />
        <button onClick={() => setShowChecklist(!showChecklist)} className="text-left">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-slate-500">
            Completeness <ChevronDown className={`h-2.5 w-2.5 transition-transform ${showChecklist ? "rotate-180" : ""}`} />
          </div>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-edge">
            <div
              className={`h-full rounded-full ${health.completeness < 0.5 ? "bg-amber-400" : "bg-emerald-400"}`}
              style={{ width: `${Math.round(health.completeness * 100)}%` }}
            />
          </div>
        </button>
        <Meter label="Progress" value={health.progress} color="bg-slate-400" />
        {health.counts && (
          <div className="ml-auto flex gap-3 text-[10px] text-slate-500">
            <span>{health.counts.decisions} decisions</span>
            <span>{health.counts.open_actions} open actions</span>
            <span>{health.counts.concepts} concepts</span>
          </div>
        )}
      </div>
      {showChecklist && health.checklist && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-edge pt-2">
          {Object.entries(health.checklist).map(([dim, done]) => (
            <span
              key={dim}
              className={`chip border ${
                done
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : "border-dashed border-amber-400/40 text-amber-300/80"
              }`}
            >
              {done ? "✓" : "…"} {dim}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
