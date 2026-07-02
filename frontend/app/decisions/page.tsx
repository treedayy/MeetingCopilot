"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { api, type WorkDecision } from "@/lib/api";

export default function DecisionsPage() {
  const router = useRouter();
  const [decisions, setDecisions] = useState<WorkDecision[]>([]);

  useEffect(() => {
    api.decisions().then(setDecisions).catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <PageHeader title="Decision log" meta={decisions.length ? `${decisions.length} records` : undefined} />
      <div className="px-6 py-4">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-40">Date</th>
              <th>Decision</th>
              <th className="w-40">Rationale</th>
              <th className="w-24">Owner</th>
              <th className="w-56">Meeting</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.id}>
                <td className="whitespace-nowrap text-neutral-500">
                  {new Date(d.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </td>
                <td>
                  {d.decision}
                  {d.needs_review && <span className="tag ml-2 text-amber-400">Needs review</span>}
                </td>
                <td className="text-neutral-500">{d.reason || "—"}</td>
                <td className="text-neutral-400">{d.approved_by || "—"}</td>
                <td>
                  <button
                    onClick={() => router.push(`/meeting/${d.meeting_id}?tab=decisions`)}
                    className="truncate text-neutral-500 hover:text-neutral-300 hover:underline"
                  >
                    {d.meeting_title}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {decisions.length === 0 && (
          <p className="py-10 text-center text-[13px] text-neutral-500">No decisions recorded yet.</p>
        )}
      </div>
    </AppShell>
  );
}
