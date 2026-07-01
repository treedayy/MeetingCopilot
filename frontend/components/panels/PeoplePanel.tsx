"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";
import type { Person } from "@/lib/types";

const SENTIMENT: Record<string, string> = {
  positive: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  concerned: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  neutral: "border-slate-400/20 bg-slate-400/10 text-slate-400",
};

export function PeoplePanel({ people }: { people: Person[] }) {
  const totalWords = Math.max(1, people.reduce((sum, p) => sum + p.words, 0));
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {people.length === 0 && (
          <p className="pt-6 text-center text-xs text-slate-600">
            <Users className="mx-auto mb-2 h-5 w-5" />
            Speakers, roles, expertise and influence show up here.
          </p>
        )}
        {people.map((p) => (
          <motion.div
            key={p.name}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-edge bg-surface/60 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent/60 to-accent-2/60 text-xs font-bold text-white">
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-slate-200">{p.name}</div>
                {p.role && <div className="text-[10px] text-slate-500">{p.role}</div>}
              </div>
              <span className={`chip ml-auto border ${SENTIMENT[p.sentiment] ?? SENTIMENT.neutral}`}>
                {p.sentiment}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
              <span>speaking share</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-edge">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all"
                  style={{ width: `${Math.round((p.words / totalWords) * 100)}%` }}
                />
              </div>
              <span>{Math.round((p.words / totalWords) * 100)}%</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
              <span>{p.segments_count} contributions</span>
              <span>· influence {Math.round(p.influence * 100)}%</span>
            </div>
            {p.expertise?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.expertise.map((e) => (
                  <span key={e} className="chip border border-edge text-slate-400">
                    {e}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
