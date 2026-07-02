"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Download, History } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
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

  const buttonStyle =
    "flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.04]";

  return (
    <AppShell>
      <PageHeader
        title={report?.title ? `${report.title} — Summary` : "Meeting summary"}
        actions={
          <>
            <button onClick={() => router.push(`/meeting/${id}/replay`)} className={buttonStyle}>
              <History className="h-3.5 w-3.5" /> History
            </button>
            <button
              onClick={() => {
                if (report?.report_md) {
                  navigator.clipboard.writeText(report.report_md).catch(() => undefined);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
              className={buttonStyle}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </button>
            <button
              onClick={download}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </>
        }
      />
      <div className="max-w-4xl px-6 py-5">
        {error && <p className="text-sm text-red-400">Couldn&apos;t load the summary — is the server running?</p>}
        {!report && !error && <p className="text-[13px] text-neutral-500">Preparing summary…</p>}
        {report?.report_md && (
          <article className="report-md rounded-md border border-edge bg-panel px-8 py-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.report_md}</ReactMarkdown>
          </article>
        )}
      </div>
    </AppShell>
  );
}
