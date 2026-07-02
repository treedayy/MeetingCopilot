"use client";

import { useEffect, useRef, useState } from "react";
import { Workflow } from "lucide-react";
import { fmtTime, type DiagramVersion } from "@/lib/types";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          primaryColor: "#1a1f2e",
          primaryBorderColor: "#6d8bff",
          primaryTextColor: "#e6e9f2",
          lineColor: "#3b4258",
          fontSize: "13px",
        },
      });
      return m.default;
    });
  }
  return mermaidReady;
}

export function ArchPanel({ diagrams }: { diagrams: DiagramVersion[] }) {
  const [selected, setSelected] = useState<number | null>(null); // null = follow latest
  const containerRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);

  const current =
    selected !== null
      ? diagrams.find((d) => d.version === selected) ?? diagrams[diagrams.length - 1]
      : diagrams[diagrams.length - 1];

  useEffect(() => {
    if (!current || !containerRef.current) return;
    const seq = ++renderSeq.current;
    loadMermaid()
      .then((mermaid) => mermaid.render(`arch-${current.version}-${seq}`, current.mermaid))
      .then(({ svg }) => {
        if (renderSeq.current === seq && containerRef.current) {
          containerRef.current.innerHTML = svg;
          const el = containerRef.current.querySelector("svg");
          if (el) {
            el.style.maxWidth = "100%";
            el.style.height = "auto";
          }
        }
      })
      .catch(() => {
        if (containerRef.current) {
          containerRef.current.innerHTML =
            '<p class="text-xs text-slate-600">Diagram could not be rendered.</p>';
        }
      });
  }, [current]);

  return (
    <div className="flex h-full flex-col">
      {diagrams.length === 0 ? (
        <p className="pt-8 text-center text-xs text-slate-600">
          <Workflow className="mx-auto mb-2 h-5 w-5" />
          When the team describes systems talking to each other, a live architecture diagram builds
          itself here.
        </p>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-edge px-3 py-2 text-[10px] text-slate-500">
            <Workflow className="h-3.5 w-3.5 text-accent-2" />
            <span className="font-semibold text-slate-300">{current?.title}</span>
            <span className="ml-auto flex items-center gap-1">
              version
              <input
                type="range"
                min={diagrams[0].version}
                max={diagrams[diagrams.length - 1].version}
                value={current?.version ?? 1}
                onChange={(e) => setSelected(Number(e.target.value))}
                className="w-20 accent-[#6d8bff]"
              />
              v{current?.version}
              {selected !== null && selected !== diagrams[diagrams.length - 1].version ? (
                <button onClick={() => setSelected(null)} className="ml-1 text-accent hover:underline">
                  latest
                </button>
              ) : (
                <span className="ml-1">· {fmtTime(current?.t ?? 0)}</span>
              )}
            </span>
          </div>
          <div ref={containerRef} className="flex-1 overflow-auto p-4 [&_svg]:mx-auto" />
        </>
      )}
    </div>
  );
}
