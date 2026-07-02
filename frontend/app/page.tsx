"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  FileText, Mic, PlayCircle, Radio, Search, Sparkles, Trash2, UserCog,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtTime, type MeetingSummary, type SearchResult } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [backendUp, setBackendUp] = useState(true);

  const refresh = () =>
    api.listMeetings().then((m) => {
      setMeetings(m);
      setBackendUp(true);
    }).catch(() => setBackendUp(false));

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const id = setTimeout(() => {
      api.search(query).then((r) => setResults(r.results)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const start = async (mode: "demo" | "live") => {
    setStarting(mode);
    try {
      const m = await api.createMeeting(mode);
      router.push(`/meeting/${m.id}${mode === "demo" ? "?demo=1" : ""}`);
    } catch {
      setBackendUp(false);
      setStarting(null);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-3.5 rounded-md bg-accent" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Meeting Copilot</h1>
            <p className="text-sm text-slate-400">
              An expert teammate, silently working beside you in every meeting.
            </p>
          </div>
          <button
            onClick={() => router.push("/settings")}
            title="Personalization"
            className="ml-auto rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            <UserCog className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      {!backendUp && (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Backend unreachable. Start it with{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5">uvicorn app.main:app --port 8000</code>{" "}
          in <code className="rounded bg-black/30 px-1.5 py-0.5">backend/</code>, then reload.
        </div>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <button
          disabled={starting !== null}
          onClick={() => start("demo")}
          className="panel p-6 text-left transition-colors hover:border-accent/50 disabled:opacity-60"
        >
          <PlayCircle className="h-6 w-6 text-accent" />
          <div className="mt-3 font-semibold text-white">
            {starting === "demo" ? "Starting…" : "Watch a demo meeting"}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            A scripted engineering meeting streams in live. No setup, no API keys.
          </p>
        </button>

        <button
          disabled={starting !== null}
          onClick={() => start("live")}
          className="panel p-6 text-left transition-colors hover:border-accent-2/50 disabled:opacity-60"
        >
          <Mic className="h-6 w-6 text-accent-2" />
          <div className="mt-3 font-semibold text-white">
            {starting === "live" ? "Starting…" : "Start a live meeting"}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Your microphone or typed input. Works alongside any meeting app.
          </p>
        </button>
      </div>

      <div className="mt-12">
        <div className="flex items-center gap-2 text-slate-300">
          <Search className="h-4 w-4" />
          <h2 className="text-sm font-semibold uppercase tracking-widest">Meeting memory</h2>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search everything ever discussed — "authentication", "Redis", "blockers"…'
          className="mt-3 w-full rounded-xl border border-edge bg-panel px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-accent/60"
        />
        {results !== null && (
          <div className="mt-3 space-y-2">
            {results.length === 0 && <p className="text-sm text-slate-500">No matches yet.</p>}
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => router.push(`/meeting/${r.meeting_id}${r.kind === "transcript" ? "" : ""}`)}
                className="panel w-full p-3 text-left text-sm transition-colors hover:border-accent/40"
              >
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="chip border border-edge bg-surface text-slate-300">{r.kind}</span>
                  <span>{r.meeting_title}</span>
                  <span>· {fmtTime(r.t)}</span>
                </div>
                <div className="mt-1 text-slate-300">{r.text}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-12">
        <div className="flex items-center gap-2 text-slate-300">
          <Sparkles className="h-4 w-4" />
          <h2 className="text-sm font-semibold uppercase tracking-widest">Past meetings</h2>
        </div>
        <div className="mt-3 space-y-2">
          {meetings.length === 0 && (
            <p className="text-sm text-slate-500">Nothing yet — start with the demo meeting above.</p>
          )}
          {meetings.map((m) => (
            <div
              key={m.id}
              className="panel flex items-center gap-3 p-4 transition-colors hover:border-accent/40"
            >
              <button
                onClick={() => router.push(m.status === "live" ? `/meeting/${m.id}` : `/meeting/${m.id}/report`)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                {m.status === "live" ? (
                  <Radio className="live-dot h-4 w-4 shrink-0 text-red-400" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-200">{m.title}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(m.started_at).toLocaleString()} · {m.mode}
                    {m.status === "live" ? " · in progress" : m.has_report ? " · report ready" : ""}
                  </div>
                </div>
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await api.deleteMeeting(m.id).catch(() => undefined);
                  refresh();
                }}
                title="Delete meeting"
                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
