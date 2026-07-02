"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { api } from "@/lib/api";
import type { MeetingSummary } from "@/lib/types";

function StatusTag({ status }: { status: string }) {
  return status === "live" ? (
    <span className="tag border-emerald-900 bg-emerald-950/60 text-emerald-400">
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
      In progress
    </span>
  ) : (
    <span className="tag">Completed</span>
  );
}

export default function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [backendUp, setBackendUp] = useState(true);
  const [starting, setStarting] = useState(false);

  const refresh = () =>
    api.listMeetings()
      .then((m) => {
        setMeetings(m);
        setBackendUp(true);
      })
      .catch(() => setBackendUp(false))
      .finally(() => setLoaded(true));

  useEffect(() => {
    refresh();
  }, []);

  const start = async (mode: "demo" | "live") => {
    setStarting(true);
    try {
      const m = await api.createMeeting(mode);
      router.push(`/meeting/${m.id}${mode === "demo" ? "?demo=1" : ""}`);
    } catch {
      setBackendUp(false);
      setStarting(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Meetings"
        meta={meetings.length ? `${meetings.length} total` : undefined}
        actions={
          <>
            <button
              onClick={() => start("demo")}
              disabled={starting}
              className="rounded-md border border-edge px-3 py-1.5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.04] disabled:opacity-50"
            >
              Sample meeting
            </button>
            <button
              onClick={() => start("live")}
              disabled={starting}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              New meeting
            </button>
          </>
        }
      />

      <div className="px-6 py-4">
        {!backendUp && (
          <div className="mb-4 rounded-md border border-amber-900 bg-amber-950/40 px-4 py-3 text-[13px] text-amber-300">
            Cannot reach the server. Start it with{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">uvicorn app.main:app --port 8000</code>{" "}
            in <code className="rounded bg-black/30 px-1.5 py-0.5">backend/</code>, then reload.
          </div>
        )}

        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="w-32">Status</th>
              <th className="w-44">Date</th>
              <th className="w-24">Source</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id}>
                <td>
                  <button
                    onClick={() =>
                      router.push(m.status === "live" ? `/meeting/${m.id}` : `/meeting/${m.id}?tab=notes`)
                    }
                    className="text-left font-medium text-neutral-200 hover:text-white hover:underline"
                  >
                    {m.title}
                  </button>
                </td>
                <td>
                  <StatusTag status={m.status} />
                </td>
                <td className="whitespace-nowrap text-neutral-500">
                  {new Date(m.started_at).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td className="text-neutral-500">{m.mode === "demo" ? "Sample" : "Live"}</td>
                <td>
                  <button
                    onClick={async () => {
                      await api.deleteMeeting(m.id).catch(() => undefined);
                      refresh();
                    }}
                    title="Delete meeting"
                    className="rounded p-1 text-neutral-600 transition-colors hover:bg-white/[0.04] hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && meetings.length === 0 && backendUp && (
          <div className="rounded-b-md border-x border-b border-edge px-4 py-10 text-center text-[13px] text-neutral-500">
            No meetings yet. Create one with <span className="text-neutral-300">New meeting</span>, or view a{" "}
            <span className="text-neutral-300">Sample meeting</span> with generated data.
          </div>
        )}
      </div>
    </AppShell>
  );
}
