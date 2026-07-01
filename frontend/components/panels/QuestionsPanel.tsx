"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, MessageCircleQuestion } from "lucide-react";
import type { Question } from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  risk: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  architecture: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  strategic: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300",
  timeline: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  clarifying: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  product: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  engineering: "border-violet-400/30 bg-violet-400/10 text-violet-300",
};

function QuestionCard({ q }: { q: Question }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-edge bg-surface/60 px-3 py-2.5"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-[13px] leading-relaxed text-slate-200">{q.text}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`chip border ${CATEGORY_COLORS[q.category] ?? "border-edge text-slate-400"}`}>
              {q.category}
            </span>
            <div className="h-1 w-16 overflow-hidden rounded-full bg-edge">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                style={{ width: `${Math.round(q.score * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500">{Math.round(q.score * 100)}% useful</span>
          </div>
          {q.rationale && <p className="mt-1.5 text-[11px] text-slate-500">{q.rationale}</p>}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(q.text).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          title="Copy question"
          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-300"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </motion.div>
  );
}

export function QuestionsPanel({ questions }: { questions: Question[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {questions.length === 0 && (
          <p className="pt-6 text-center text-xs text-slate-600">
            <MessageCircleQuestion className="mx-auto mb-2 h-5 w-5" />
            Smart questions you could ask will appear here, ranked by usefulness.
          </p>
        )}
        {questions.map((q, i) => (
          <QuestionCard key={q.id ?? `${q.t}-${i}`} q={q} />
        ))}
      </div>
    </div>
  );
}
