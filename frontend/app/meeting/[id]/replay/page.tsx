"use client";

/**
 * Interactive meeting replay: drag the timeline and watch the meeting —
 * transcript, the AI's evolving thoughts, the knowledge graph, and the
 * architecture diagram — rebuild themselves exactly as they happened.
 */

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Brain, FileText, Pause, Play } from "lucide-react";
import { api } from "@/lib/api";
import {
  fmtTime, type ActionItem, type CoachTip, type Concept, type Decision,
  type DiagramVersion, type GraphEdge, type GraphNode, type HealthState,
  type Insight, type MemoryItem, type TranscriptSegment, type Understanding,
} from "@/lib/types";
import { GraphPanel } from "@/components/panels/GraphPanel";
import { ArchPanel } from "@/components/panels/ArchPanel";
import { HealthStrip } from "@/components/HealthStrip";

interface MeetingData {
  title: string;
  segments: TranscriptSegment[];
  understandings: Understanding[];
  insights: Insight[];
  concepts: Concept[];
  actions: ActionItem[];
  decisions: Decision[];
  coach_tips: CoachTip[];
  memory_items: MemoryItem[];
  diagrams: DiagramVersion[];
  health: HealthState[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}

const SPEAKER_COLORS = ["text-sky-300", "text-emerald-300", "text-amber-300", "text-fuchsia-300", "text-rose-300"];

export default function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<MeetingData | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getMeeting(id).then((d) => {
      const meeting = d as unknown as MeetingData;
      setData(meeting);
      setT(0);
    }).catch(() => undefined);
  }, [id]);

  const maxT = useMemo(
    () => (data?.segments.length ? Math.ceil(data.segments[data.segments.length - 1].t) + 2 : 0),
    [data]
  );

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setT((prev) => {
        if (prev >= maxT) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 350); // ~3x speed
    return () => clearInterval(interval);
  }, [playing, maxT]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [t]);

  const colorMap = useRef(new Map<string, string>());
  const color = (name: string) => {
    if (!colorMap.current.has(name)) {
      colorMap.current.set(name, SPEAKER_COLORS[colorMap.current.size % SPEAKER_COLORS.length]);
    }
    return colorMap.current.get(name)!;
  };

  if (!data) {
    return (
      <main className="flex h-screen items-center justify-center text-sm text-slate-400">
        <Brain className="mr-2 h-5 w-5 animate-pulse text-accent" /> Loading replay…
      </main>
    );
  }

  const visibleSegments = data.segments.filter((s) => s.t <= t);
  const feed = [
    ...data.understandings.map((x) => ({ t: x.t, label: "understanding", text: x.text, style: "text-slate-300" })),
    ...data.insights.map((x) => ({ t: x.t, label: x.kind, text: x.text, style: "text-sky-300" })),
    ...data.coach_tips.map((x) => ({ t: x.t, label: `coach · ${x.kind}`, text: x.text, style: "text-accent-2" })),
    ...data.memory_items.map((x) => ({ t: x.t, label: `memory · ${x.kind.replace("_", " ")}`, text: x.text, style: "text-amber-300" })),
    ...data.decisions.map((x) => ({ t: x.t, label: "decision", text: x.decision, style: "text-emerald-300" })),
    ...data.actions.map((x) => ({ t: x.t, label: "action item", text: `${x.task} — ${x.owner}`, style: "text-yellow-300" })),
    ...data.concepts.map((x) => ({ t: x.first_t, label: "concept", text: `Explained: ${x.term}`, style: "text-fuchsia-300" })),
  ]
    .filter((x) => x.t <= t)
    .sort((a, b) => a.t - b.t);

  const visibleNodes = data.graph.nodes.filter((n) => (n as GraphNode & { t?: number }).t === undefined || (n as GraphNode & { t: number }).t <= t);
  const visibleKeys = new Set(visibleNodes.map((n) => n.key));
  const visibleEdges = data.graph.edges.filter(
    (e) => visibleKeys.has(e.source) && visibleKeys.has(e.target) && ((e as GraphEdge & { t?: number }).t ?? 0) <= t
  );
  const visibleDiagrams = data.diagrams.filter((d) => d.t <= t);
  const currentHealth = [...data.health].reverse().find((h) => h.t <= t) ?? null;

  return (
    <main className="flex h-screen flex-col gap-3 p-3">
      <header className="panel shrink-0 flex-row items-center gap-3 px-4 py-2.5">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent/50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{data.title}</div>
          <div className="text-[10px] text-slate-500">Replay — watch the meeting understanding evolve</div>
        </div>
        <button
          onClick={() => router.push(`/meeting/${id}/report`)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent/50"
        >
          <FileText className="h-3.5 w-3.5" /> Report
        </button>
      </header>

      {/* Timeline */}
      <div className="panel shrink-0 flex-row items-center gap-3 px-4 py-2.5">
        <button
          onClick={() => {
            if (t >= maxT) setT(0);
            setPlaying(!playing);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <span className="w-12 font-mono text-xs text-slate-400">{fmtTime(t)}</span>
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={maxT}
            value={t}
            onChange={(e) => {
              setPlaying(false);
              setT(Number(e.target.value));
            }}
            className="w-full accent-[#6d8bff]"
          />
          {/* Decision markers on the timeline */}
          {data.decisions.map((d, i) => (
            <span
              key={i}
              title={d.decision.slice(0, 80)}
              className="pointer-events-none absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-400"
              style={{ left: `${(d.t / maxT) * 100}%` }}
            />
          ))}
        </div>
        <span className="w-12 text-right font-mono text-xs text-slate-500">{fmtTime(maxT)}</span>
      </div>

      <HealthStrip health={currentHealth} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="panel h-full">
          <div className="panel-title">Transcript · {visibleSegments.length} lines</div>
          <div ref={transcriptRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {visibleSegments.map((s, i) => (
              <p key={s.id ?? i} className="text-[13px] leading-relaxed">
                <span className="mr-2 font-mono text-[10px] text-slate-600">{fmtTime(s.t)}</span>
                <span className={`font-semibold ${color(s.speaker)}`}>{s.speaker}</span>
                <span className="text-slate-300"> — {s.text}</span>
              </p>
            ))}
            {visibleSegments.length === 0 && (
              <p className="pt-6 text-center text-xs text-slate-600">Press play or drag the timeline.</p>
            )}
          </div>
        </div>

        <div className="panel h-full">
          <div className="panel-title">The AI&apos;s mind over time · {feed.length} events</div>
          <div ref={feedRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {feed.map((item, i) => (
              <div key={i} className="text-xs leading-relaxed">
                <span className="mr-2 font-mono text-[10px] text-slate-600">{fmtTime(item.t)}</span>
                <span className={`chip mr-1.5 border border-edge ${item.style}`}>{item.label}</span>
                <span className="text-slate-400">{item.text}</span>
              </div>
            ))}
            {feed.length === 0 && (
              <p className="pt-6 text-center text-xs text-slate-600">The copilot&apos;s reasoning appears as time advances.</p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="panel min-h-0 flex-1">
            <div className="panel-title">Knowledge graph · {visibleNodes.length} nodes</div>
            <GraphPanel nodes={visibleNodes} edges={visibleEdges} />
          </div>
          <div className="panel min-h-0 flex-1">
            <div className="panel-title">Architecture · {visibleDiagrams.length ? `v${visibleDiagrams[visibleDiagrams.length - 1].version}` : "—"}</div>
            <ArchPanel diagrams={visibleDiagrams} />
          </div>
        </div>
      </div>
    </main>
  );
}
