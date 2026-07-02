"use client";

/**
 * Pop-out window: a compact, read-only status card for keeping meeting
 * records in view next to any meeting app. Plain lists, no motion.
 */

import { use, useEffect } from "react";
import { useMeeting } from "@/lib/useMeeting";

export default function PopoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state } = useMeeting(id);

  useEffect(() => {
    document.title = "Meeting Copilot";
  }, []);

  const latestNote = state.understandings[state.understandings.length - 1];
  const openTasks = state.actions.filter((a) => a.status === "open");
  const lastDecision = state.decisions[state.decisions.length - 1];
  const lastLine = state.segments[state.segments.length - 1];

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-surface px-3.5 py-3 text-[12px]">
      <div className="flex items-center gap-2 pb-2">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
        <span className="truncate font-medium text-neutral-300">{state.meetingTitle || "Meeting"}</span>
        <span className="ml-auto shrink-0 text-[11px] text-neutral-600">
          {state.connected ? (state.meetingStatus === "live" ? "Recording" : "Completed") : "Reconnecting…"}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <section>
          <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            Latest note
          </h2>
          <p className="leading-snug text-neutral-400">
            {latestNote?.text ?? "Notes are added as the meeting progresses."}
          </p>
        </section>

        {lastDecision && (
          <section>
            <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
              Last decision
            </h2>
            <p className="leading-snug text-neutral-400">{lastDecision.decision.slice(0, 160)}</p>
          </section>
        )}

        {openTasks.length > 0 && (
          <section>
            <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
              Open tasks ({openTasks.length})
            </h2>
            <ul className="space-y-1">
              {openTasks.slice(-4).map((a, i) => (
                <li key={a.id ?? i} className="truncate leading-snug text-neutral-400">
                  {a.task} <span className="text-neutral-600">— {a.owner === "TBD" ? "unassigned" : a.owner}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {lastLine && (
        <p className="shrink-0 truncate border-t border-edge pt-2 text-[11px] text-neutral-600">
          {lastLine.speaker}: {lastLine.text}
        </p>
      )}
    </main>
  );
}
