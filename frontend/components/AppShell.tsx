"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar, GitCommitVertical, ListChecks, Scale, Search, Settings,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Meetings", icon: Calendar },
  { href: "/activity", label: "Activity", icon: GitCommitVertical },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/decisions", label: "Decisions", icon: Scale },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/meeting") : pathname.startsWith(href);

  return (
    <div className="flex h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-edge bg-panel">
        <div className="flex items-center gap-2 px-4 pb-4 pt-4">
          <span className="h-4 w-4 rounded bg-accent" />
          <span className="text-[13px] font-semibold text-neutral-200">Meeting Copilot</span>
        </div>

        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 rounded-md border border-edge bg-surface px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-neutral-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  router.push(`/search?q=${encodeURIComponent(query.trim())}`);
                  setQuery("");
                }
              }}
              placeholder="Search"
              className="w-full bg-transparent text-[13px] text-neutral-300 outline-none placeholder:text-neutral-600"
            />
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                isActive(href)
                  ? "bg-white/[0.06] font-medium text-neutral-100"
                  : "text-neutral-400 hover:bg-white/[0.03] hover:text-neutral-200"
              }`}
            >
              <Icon className="h-4 w-4 text-neutral-500" />
              {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-edge p-2">
          <button
            onClick={() => router.push("/settings")}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              pathname.startsWith("/settings")
                ? "bg-white/[0.06] font-medium text-neutral-100"
                : "text-neutral-400 hover:bg-white/[0.03] hover:text-neutral-200"
            }`}
          >
            <Settings className="h-4 w-4 text-neutral-500" />
            Settings
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

/** Standard page chrome: title row + optional actions, consistent density. */
export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-edge px-6 py-3.5">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-[15px] font-semibold text-neutral-100">{title}</h1>
        {meta && <span className="shrink-0 text-[12px] text-neutral-500">{meta}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
