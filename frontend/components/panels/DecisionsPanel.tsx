"use client";

import { motion } from "framer-motion";
import { Gavel } from "lucide-react";
import { ConfidenceChip } from "@/components/ConfidenceChip";
import { fmtTime, type Decision } from "@/lib/types";

export function DecisionsPanel({ decisions }: { decisions: Decision[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {decisions.length === 0 && (
          <p className="pt-6 text-center text-xs text-slate-600">
            <Gavel className="mx-auto mb-2 h-5 w-5" />
            Every decision gets structured: what, why, who, tradeoffs.
          </p>
        )}
        {decisions.map((d, i) => (
          <motion.div
            key={d.id ?? i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5"
          >
            <p className="text-[13px] leading-relaxed text-slate-200">{d.decision}</p>
            <div className="mt-2 space-y-1 text-[11px] text-slate-400">
              {d.reason && (
                <p>
                  <span className="font-semibold text-slate-300">Reason: </span>
                  {d.reason}
                </p>
              )}
              {d.alternatives?.length > 0 && (
                <p>
                  <span className="font-semibold text-slate-300">Alternatives: </span>
                  {d.alternatives.join("; ")}
                </p>
              )}
              {d.tradeoffs && (
                <p>
                  <span className="font-semibold text-slate-300">Tradeoffs: </span>
                  {d.tradeoffs}
                </p>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
              {d.approved_by && (
                <span className="chip border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                  ✓ {d.approved_by}
                </span>
              )}
              <ConfidenceChip value={d.confidence} />
              <span>{fmtTime(d.t)}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
