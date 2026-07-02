"use client";

import { motion } from "framer-motion";
import { BookOpen, FileText, History, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfidenceChip } from "@/components/ConfidenceChip";
import { fmtTime, type MemoryItem, type RetrievalItem } from "@/lib/types";

export function MemoryPanel({
  memoryItems,
  retrievals,
}: {
  memoryItems: MemoryItem[];
  retrievals: RetrievalItem[];
}) {
  const router = useRouter();
  const feed = [
    ...memoryItems.map((m) => ({ t: m.t, kind: "memory" as const, memory: m, retrieval: null as RetrievalItem | null })),
    ...retrievals.map((r) => ({ t: r.t, kind: "retrieval" as const, memory: null as MemoryItem | null, retrieval: r })),
  ].sort((a, b) => b.t - a.t);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {feed.length === 0 && (
          <p className="pt-6 text-center text-xs text-slate-600">
            <History className="mx-auto mb-2 h-5 w-5" />
            Historical context from past meetings and your knowledge base shows up here automatically.
          </p>
        )}
        {feed.map((item, i) =>
          item.memory ? (
            <motion.div
              key={`m-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl border px-3 py-2.5 ${
                item.memory.kind === "contradiction"
                  ? "border-amber-400/40 bg-amber-400/[0.07]"
                  : "border-edge bg-surface/60"
              }`}
            >
              <div className="flex items-start gap-2">
                {item.memory.kind === "contradiction" ? (
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                ) : (
                  <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <p className="text-[13px] leading-relaxed text-slate-200">{item.memory.text}</p>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
                <span className="chip border border-edge text-slate-400">
                  {item.memory.kind.replace("_", " ")}
                </span>
                <ConfidenceChip value={item.memory.confidence} />
                {item.memory.ref_meeting_id && (
                  <button
                    onClick={() => router.push(`/meeting/${item.memory!.ref_meeting_id}/report`)}
                    className="text-accent hover:underline"
                  >
                    open that meeting →
                  </button>
                )}
                <span className="ml-auto">{fmtTime(item.t)}</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`r-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-edge bg-surface/60 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                {item.retrieval!.source === "docs" ? (
                  <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-2" />
                ) : (
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <div>
                  <div className="text-[13px] font-semibold text-slate-200">{item.retrieval!.title}</div>
                  {item.retrieval!.summary && (
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{item.retrieval!.summary}</p>
                  )}
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
                <span className="chip border border-edge text-slate-400">{item.retrieval!.source}</span>
                {item.retrieval!.source === "meetings" && item.retrieval!.ref && (
                  <button
                    onClick={() => router.push(`/meeting/${item.retrieval!.ref}/report`)}
                    className="text-accent hover:underline"
                  >
                    open report →
                  </button>
                )}
                <span className="ml-auto">{fmtTime(item.t)}</span>
              </div>
            </motion.div>
          )
        )}
      </div>
    </div>
  );
}
