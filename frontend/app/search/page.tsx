"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { api } from "@/lib/api";
import { fmtTime, type SearchResult } from "@/lib/types";

export default function SearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  );
}

function SearchResults() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!q) return;
    api.search(q).then((r) => {
      setResults(r.results);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [q]);

  return (
    <AppShell>
      <PageHeader title={`Search`} meta={q ? `“${q}” · ${results.length} results` : undefined} />
      <div className="max-w-4xl px-6 py-4">
        <div className="rounded-md border border-edge">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => router.push(`/meeting/${r.meeting_id}?tab=notes`)}
              className={`flex w-full items-start gap-3 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-white/[0.02] ${
                i > 0 ? "border-t border-edge" : ""
              }`}
            >
              <span className="tag w-20 shrink-0 justify-center capitalize">{r.kind}</span>
              <div className="min-w-0 flex-1">
                <p className="text-neutral-300">{r.text}</p>
                <p className="mt-0.5 text-[12px] text-neutral-500">
                  {r.meeting_title} · {fmtTime(r.t)}
                </p>
              </div>
            </button>
          ))}
          {loaded && results.length === 0 && (
            <p className="px-4 py-10 text-center text-[13px] text-neutral-500">No results for “{q}”.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
