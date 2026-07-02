"use client";

/**
 * Compact always-on-top overlay: the distilled copilot for use while the
 * meeting app (Zoom/Meet/Teams/anything) has the screen. Hosted inside a
 * Document Picture-in-Picture window or a small popup — platform-agnostic,
 * no meeting bots required.
 */

import { use, useEffect, useRef } from "react";
import { Brain, Compass, MessageCircleQuestion } from "lucide-react";
import { useMeeting } from "@/lib/useMeeting";

const SPEAKER_COLORS = ["text-sky-300", "text-emerald-300", "text-amber-300", "text-fuchsia-300", "text-rose-300"];

export default function OverlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state } = useMeeting(id);
  const colorMap = useRef(new Map<string, string>());

  const color = (name: string) => {
    if (!colorMap.current.has(name)) {
      colorMap.current.set(name, SPEAKER_COLORS[colorMap.current.size % SPEAKER_COLORS.length]);
    }
    return colorMap.current.get(name)!;
  };

  const latestUnderstanding = state.understandings[state.understandings.length - 1];
  const latestTip = state.coachTips[state.coachTips.length - 1];
  const topQuestion = [...state.questions].sort((a, b) => b.score - a.score)[0];
  const lastLines = state.segments.slice(-3);

  useEffect(() => {
    document.title = "Copilot overlay";
  }, []);

  return (
    <main className="flex h-screen flex-col gap-2 overflow-hidden bg-surface p-2.5 text-[12px]">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent-2">
          <Brain className="h-3 w-3 text-white" />
        </div>
        <span className="text-[11px] font-semibold text-white">Copilot</span>
        {state.health?.topic && (
          <span className="chip ml-auto border border-edge text-slate-400">{state.health.topic}</span>
        )}
        <span className={`h-1.5 w-1.5 rounded-full ${state.connected ? "live-dot bg-emerald-400" : "bg-amber-400"}`} />
      </div>

      <div className="rounded-lg border border-edge bg-panel/80 px-2.5 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Right now</div>
        <p className="mt-0.5 leading-snug text-slate-200">
          {latestUnderstanding?.text ?? "Listening — understanding will appear here."}
        </p>
      </div>

      {latestTip && (
        <div
          className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-2 ${
            latestTip.urgency === "high"
              ? "border-rose-400/40 bg-rose-400/[0.08]"
              : "border-edge bg-panel/80"
          }`}
        >
          <Compass className="mt-0.5 h-3 w-3 shrink-0 text-accent-2" />
          <p className="leading-snug text-slate-300">{latestTip.text}</p>
        </div>
      )}

      {topQuestion && (
        <div className="flex items-start gap-1.5 rounded-lg border border-edge bg-panel/80 px-2.5 py-2">
          <MessageCircleQuestion className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
          <p className="leading-snug text-slate-300">
            <span className="text-slate-500">Worth asking: </span>
            {topQuestion.text}
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border border-edge bg-panel/80 px-2.5 py-2">
        {lastLines.length === 0 && <p className="text-slate-600">Waiting for speech…</p>}
        {lastLines.map((s, i) => (
          <p key={s.id ?? i} className="leading-snug text-slate-400">
            <span className={`font-semibold ${color(s.speaker)}`}>{s.speaker}</span> — {s.text}
          </p>
        ))}
      </div>
    </main>
  );
}
