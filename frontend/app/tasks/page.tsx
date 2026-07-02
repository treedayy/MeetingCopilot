"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Square } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { api, type WorkTask } from "@/lib/api";

const PRIORITY_STYLE: Record<string, string> = {
  high: "text-red-400",
  medium: "text-neutral-400",
  low: "text-neutral-600",
};

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");

  useEffect(() => {
    api.tasks().then(setTasks).catch(() => undefined);
  }, []);

  const toggle = async (task: WorkTask) => {
    const status = task.status === "done" ? "open" : "done";
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, status } : x)));
    await api.updateAction(task.meeting_id, task.id, status).catch(() => undefined);
  };

  const visible = filter === "open" ? tasks.filter((t) => t.status === "open") : tasks;
  const openCount = tasks.filter((t) => t.status === "open").length;

  return (
    <AppShell>
      <PageHeader
        title="Tasks"
        meta={`${openCount} open`}
        actions={
          <div className="flex rounded-md border border-edge p-0.5">
            {(["open", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2.5 py-1 text-[12px] capitalize transition-colors ${
                  filter === f ? "bg-white/[0.07] text-neutral-200" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-6 py-4">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8" />
              <th>Task</th>
              <th className="w-28">Assignee</th>
              <th className="w-28">Due</th>
              <th className="w-20">Priority</th>
              <th className="w-56">Meeting</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id} className={t.status === "done" ? "opacity-50" : ""}>
                <td>
                  <button onClick={() => toggle(t)} className="text-neutral-500 hover:text-neutral-200" title="Toggle status">
                    {t.status === "done" ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </td>
                <td className={t.status === "done" ? "line-through" : ""}>
                  {t.task}
                  {t.needs_review && <span className="tag ml-2 text-amber-400">Needs review</span>}
                </td>
                <td className={t.owner === "TBD" ? "text-amber-400" : "text-neutral-400"}>
                  {t.owner === "TBD" ? "Unassigned" : t.owner}
                </td>
                <td className="text-neutral-500">{t.deadline || "—"}</td>
                <td className={PRIORITY_STYLE[t.priority] ?? "text-neutral-400"}>{t.priority}</td>
                <td>
                  <button
                    onClick={() => router.push(`/meeting/${t.meeting_id}?tab=tasks`)}
                    className="truncate text-neutral-500 hover:text-neutral-300 hover:underline"
                  >
                    {t.meeting_title}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="py-10 text-center text-[13px] text-neutral-500">
            {filter === "open" ? "No open tasks." : "No tasks recorded yet."}
          </p>
        )}
      </div>
    </AppShell>
  );
}
