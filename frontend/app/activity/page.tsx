"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { api, type ActivityEvent } from "@/lib/api";

const TYPE_LABEL: Record<ActivityEvent["type"], string> = {
  meeting_started: "Meeting",
  meeting_ended: "Meeting",
  decision: "Decision",
  task: "Task",
};

function groupByDay(events: ActivityEvent[]): [string, ActivityEvent[]][] {
  const groups = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const day = new Date(e.at).toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric",
    });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  }
  return [...groups.entries()];
}

export default function ActivityPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    api.activity().then(setEvents).catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <PageHeader title="Activity" meta={events.length ? `${events.length} events` : undefined} />
      <div className="max-w-4xl px-6 py-4">
        {groupByDay(events).map(([day, dayEvents]) => (
          <section key={day} className="mb-6">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {day}
            </h2>
            <div className="rounded-md border border-edge">
              {dayEvents.map((e, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-4 py-2.5 text-[13px] ${
                    i > 0 ? "border-t border-edge" : ""
                  }`}
                >
                  <span className="w-14 shrink-0 pt-px font-mono text-[11px] text-neutral-600">
                    {new Date(e.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="tag w-20 shrink-0 justify-center">{TYPE_LABEL[e.type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-neutral-300">{e.text}</p>
                    <button
                      onClick={() => router.push(`/meeting/${e.meeting_id}?tab=notes`)}
                      className="mt-0.5 text-[12px] text-neutral-500 hover:text-neutral-300 hover:underline"
                    >
                      {e.meeting_title}
                    </button>
                  </div>
                  {e.needs_review && <span className="tag shrink-0 text-amber-400">Needs review</span>}
                </div>
              ))}
            </div>
          </section>
        ))}
        {events.length === 0 && (
          <p className="py-10 text-center text-[13px] text-neutral-500">
            No activity yet. Events appear here as meetings produce decisions and tasks.
          </p>
        )}
      </div>
    </AppShell>
  );
}
