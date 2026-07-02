"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Brain, Check, Copy, Download, Play } from "lucide-react";
import { api } from "@/lib/api";

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [report, setReport] = useState<{ title: string; report_md: string | null } | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const r = await api.getReport(id);
        if (cancelled) return;
        if (!r.report_md && attempt < 20) {
          setTimeout(() => load(attempt + 1), 1500); // report may still be generating
          return;
        }
        setReport(r);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const download = () => {
    if (!report?.report_md) return;
    const blob = new Blob([report.report_md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent/50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => router.push(`/meeting/${id}/replay`)}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent/50"
          >
            <Play className="h-3.5 w-3.5" /> Replay
          </button>
          <button
            onClick={() => {
              if (report?.report_md) {
                navigator.clipboard.writeText(report.report_md).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent/50"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            Copy markdown
          </button>
          <button
            onClick={download}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Download className="h-3.5 w-3.5" /> Download .md
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-300">Couldn&apos;t load the report — is the backend running?</p>}
      {!report && !error && (
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <Brain className="h-5 w-5 animate-pulse text-accent" />
          Generating your executive report…
        </div>
      )}
      {report?.report_md && (
        <article className="report-md panel px-8 py-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.report_md}</ReactMarkdown>
        </article>
      )}
    </main>
  );
}
