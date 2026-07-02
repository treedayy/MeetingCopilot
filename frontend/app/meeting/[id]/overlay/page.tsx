"use client";

/**
 * Pop-out window: the live capture layer in miniature, for keeping next to
 * any meeting app. Same contract as the main live screen — silent by
 * default, quiet task log, interruptive only for risks.
 */

import { use, useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useMeeting } from "@/lib/useMeeting";
import { fmtTime } from "@/lib/types";

export default function PopoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state } = useMeeting(id);
  const [ackCount, setAckCount] = useState(0);
  const [recentAction, setRecentAction] = useState<string | null>(null);
  const seenActions = useRef(0);

  useEffect(() => {
    document.title = "Meeting Copilot";
  }, []);

  useEffect(() => {
    if (state.actions.length > seenActions.current) {
      const latest = state.actions[state.actions.length - 1];
      seenActions.current = state.actions.length;
      setRecentAction(latest.task);
      const timer = setTimeout(() => setRecentAction(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [state.actions]);

  const activeRisk = state.risks.length > ackCount ? state.risks[state.risks.length - 1] : null;
  const lastLine = state.segments[state.segments.length - 1];
  const isLive = state.meetingStatus === "live";

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-surface px-3.5 py-3 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
        <span className="truncate text-neutral-400">{state.meetingTitle || "Meeting"}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-neutral-600">
          {lastLine ? fmtTime(lastLine.t) : "0:00"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {activeRisk ? (
          <div className="w-full rounded-md border border-amber-700/60 bg-amber-950/30 p-3">
            <div className="flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-semibold text-amber-300">{activeRisk.title}</span>
            </div>
            <p className="mt-1.5 leading-snug text-neutral-300">{activeRisk.text}</p>
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => setAckCount(state.risks.length)}
                className="rounded bg-amber-600/90 px-2.5 py-1 text-[11px] font-medium text-white"
              >
                Got it
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center text-neutral-600">
            {isLive ? "Recording" : "Completed"} · {state.actions.length} task
            {state.actions.length !== 1 ? "s" : ""} captured
          </div>
        )}
      </div>

      <p
        className={`shrink-0 truncate text-[11px] transition-opacity duration-500 ${
          recentAction ? "text-neutral-500 opacity-100" : "text-neutral-700 opacity-0"
        }`}
      >
        ✓ {recentAction ?? ""}
      </p>
    </main>
  );
}
