"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { AlarmClock, Brain, Lightbulb, TriangleAlert } from "lucide-react";
import { fmtTime, type Insight, type Understanding } from "@/lib/types";

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  thought: <Lightbulb className="h-3.5 w-3.5 shrink-0 text-sky-300" />,
  alert: <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />,
  reminder: <AlarmClock className="h-3.5 w-3.5 shrink-0 text-amber-300" />,
  topic: <Lightbulb className="h-3.5 w-3.5 shrink-0 text-violet-300" />,
};

export function UnderstandingPanel({
  understandings,
  insights,
}: {
  understandings: Understanding[];
  insights: Insight[];
}) {
  const latest = understandings[understandings.length - 1];
  const feedRef = useRef<HTMLDivElement>(null);

  const feed = [
    ...understandings.slice(0, -1).map((u) => ({ t: u.t, kind: "summary" as const, text: u.text })),
    ...insights.map((i) => ({ t: i.t, kind: i.kind, text: i.text })),
  ].sort((a, b) => a.t - b.t);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  return (
    <div className="panel h-full">
      <div className="panel-title">
        <Brain className="h-3.5 w-3.5" />
        Live AI understanding
      </div>

      <div className="shrink-0 border-b border-edge px-4 py-3">
        {latest ? (
          <motion.p
            key={latest.t}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[13px] leading-relaxed text-slate-200"
          >
            <span className="mr-2 font-mono text-[10px] text-slate-600">{fmtTime(latest.t)}</span>
            {latest.text}
          </motion.p>
        ) : (
          <p className="text-xs text-slate-600">Building an understanding of the discussion…</p>
        )}
      </div>

      <div ref={feedRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {feed.length === 0 && (
          <p className="text-xs text-slate-600">My running thoughts will appear here.</p>
        )}
        {feed.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-start gap-2 text-xs leading-relaxed text-slate-400"
          >
            {item.kind === "summary" ? (
              <Brain className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            ) : (
              INSIGHT_ICONS[item.kind] ?? INSIGHT_ICONS.thought
            )}
            <span>
              <span className="mr-1.5 font-mono text-[10px] text-slate-600">{fmtTime(item.t)}</span>
              {item.text}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
