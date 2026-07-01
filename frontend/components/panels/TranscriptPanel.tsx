"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Search } from "lucide-react";
import { fmtTime, type TranscriptSegment } from "@/lib/types";

const SPEAKER_COLORS = [
  "text-sky-300", "text-emerald-300", "text-amber-300", "text-fuchsia-300",
  "text-rose-300", "text-cyan-300", "text-lime-300", "text-violet-300",
];

const IMPORTANT = /\b(decide|decision|blocker|blocked|deadline|risk|agreed|critical|launch|by friday|by monday|by wednesday)\b/i;

export function TranscriptPanel({ segments }: { segments: TranscriptSegment[] }) {
  const [filter, setFilter] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const speakerColor = useMemo(() => {
    const map = new Map<string, string>();
    return (name: string) => {
      if (!map.has(name)) map.set(name, SPEAKER_COLORS[map.size % SPEAKER_COLORS.length]);
      return map.get(name)!;
    };
  }, []);

  const visible = filter
    ? segments.filter(
        (s) =>
          s.text.toLowerCase().includes(filter.toLowerCase()) ||
          s.speaker.toLowerCase().includes(filter.toLowerCase())
      )
    : segments;

  useEffect(() => {
    if (stickToBottom.current && !filter) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments.length, filter]);

  return (
    <div className="panel h-full">
      <div className="panel-title">
        <AudioLines className="h-3.5 w-3.5" />
        Live transcript
        <span className="ml-auto flex items-center gap-1 font-normal normal-case tracking-normal">
          <Search className="h-3 w-3 text-slate-500" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="search…"
            className="w-24 bg-transparent text-[11px] text-slate-300 outline-none placeholder:text-slate-600 focus:w-32 transition-all"
          />
        </span>
      </div>
      <div
        ref={scrollerRef}
        onScroll={() => {
          const el = scrollerRef.current;
          if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3"
      >
        {visible.length === 0 && (
          <p className="pt-6 text-center text-xs text-slate-600">
            {filter ? "No matching lines." : "Waiting for speech…"}
          </p>
        )}
        {visible.map((s, i) => {
          const important = IMPORTANT.test(s.text);
          return (
            <div
              key={s.id ?? i}
              className={`rounded-lg px-2.5 py-1.5 text-[13px] leading-relaxed ${
                important ? "border border-amber-400/25 bg-amber-400/[0.06]" : ""
              }`}
            >
              <span className="mr-2 font-mono text-[10px] text-slate-600">{fmtTime(s.t)}</span>
              <span className={`font-semibold ${speakerColor(s.speaker)}`}>{s.speaker}</span>
              <span className="text-slate-300"> — {s.text}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
