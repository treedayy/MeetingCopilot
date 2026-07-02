"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, GraduationCap, History } from "lucide-react";
import { fmtTime, type Concept } from "@/lib/types";

const CATEGORY_STYLES: Record<string, string> = {
  security: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  infrastructure: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  ai: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300",
  architecture: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  api: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  framework: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  observability: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  delivery: "border-lime-400/30 bg-lime-400/10 text-lime-300",
};

const LEVELS = ["beginner", "intermediate", "advanced", "interview"] as const;
type Level = (typeof LEVELS)[number];

function ConceptCard({ concept, defaultOpen }: { concept: Concept; defaultOpen: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen && !concept.known);
  const [level, setLevel] = useState<Level>("beginner");
  const badge = CATEGORY_STYLES[concept.category] ?? "border-slate-400/30 bg-slate-400/10 text-slate-300";

  const levelText: Record<Level, string> = {
    beginner: concept.beginner,
    intermediate: concept.intermediate || concept.what,
    advanced: concept.advanced,
    interview: concept.interview || concept.what,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-surface/60 ${concept.known ? "border-edge/60 opacity-75" : "border-edge"}`}
    >
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <span className="text-sm font-semibold text-slate-100">{concept.term}</span>
        <span className={`chip border ${badge}`}>{concept.category}</span>
        {concept.known && (
          <span className="chip flex items-center gap-1 border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
            <CheckCircle2 className="h-2.5 w-2.5" /> you know this
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
          {concept.mentions}× · first at {fmtTime(concept.first_t)}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-edge px-3 py-3 text-xs leading-relaxed text-slate-300">
          <p>{concept.what}</p>
          <p>
            <span className="font-semibold text-slate-200">Why it matters: </span>
            {concept.why_matters}
          </p>
          {concept.why_now && (
            <p className="rounded-lg border border-accent/20 bg-accent/[0.07] px-2.5 py-2 text-slate-300">
              <span className="font-semibold text-accent">Why they&apos;re discussing it: </span>
              {concept.why_now}
            </p>
          )}
          <div>
            <div className="mb-1.5 flex flex-wrap gap-1">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`chip border transition-colors ${
                    level === l
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-edge text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <p>{levelText[level]}</p>
          </div>
          {concept.analogy && (
            <p className="text-slate-400">
              <span className="font-semibold text-slate-300">Analogy: </span>
              {concept.analogy}
            </p>
          )}
          {concept.pitfalls && (
            <p className="text-slate-400">
              <span className="font-semibold text-rose-300">Common mistakes: </span>
              {concept.pitfalls}
            </p>
          )}
          {(concept.prior_meetings?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-edge px-2.5 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <History className="h-3 w-3" /> Previously discussed in
              </div>
              {concept.prior_meetings!.map((m) => (
                <button
                  key={m.id}
                  onClick={() => router.push(`/meeting/${m.id}/report`)}
                  className="block text-left text-xs text-accent hover:underline"
                >
                  {m.title} · {m.date}
                </button>
              ))}
            </div>
          )}
          {concept.related?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {concept.related.map((r) => (
                <span key={r} className="chip border border-edge text-slate-400">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function TutorPanel({ concepts }: { concepts: Concept[] }) {
  const fresh = concepts.filter((c) => !c.known);
  const known = concepts.filter((c) => c.known);
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {concepts.length === 0 && (
          <p className="pt-6 text-center text-xs text-slate-600">
            <GraduationCap className="mx-auto mb-2 h-5 w-5" />
            When a technical concept comes up, I&apos;ll explain it here — privately.
          </p>
        )}
        {fresh.map((c, i) => (
          <ConceptCard key={c.term} concept={c} defaultOpen={i === 0} />
        ))}
        {known.length > 0 && (
          <>
            <div className="pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Already in your toolkit
            </div>
            {known.map((c) => (
              <ConceptCard key={c.term} concept={c} defaultOpen={false} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
