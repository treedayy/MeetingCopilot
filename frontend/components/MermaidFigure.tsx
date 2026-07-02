"use client";

import { useEffect, useRef } from "react";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          primaryColor: "#1b1c20",
          primaryBorderColor: "#3a3b42",
          primaryTextColor: "#d4d6dd",
          lineColor: "#3a3b42",
          fontSize: "13px",
        },
      });
      return m.default;
    });
  }
  return mermaidReady;
}

/** A static diagram figure — renders once, no controls, no motion. */
export function MermaidFigure({ code, id }: { code: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!ref.current) return;
    const current = ++seq.current;
    loadMermaid()
      .then((mermaid) => mermaid.render(`fig-${id}-${current}`, code))
      .then(({ svg }) => {
        if (seq.current === current && ref.current) {
          ref.current.innerHTML = svg;
          const el = ref.current.querySelector("svg");
          if (el) {
            el.style.maxWidth = "100%";
            el.style.height = "auto";
          }
        }
      })
      .catch(() => {
        if (ref.current) ref.current.textContent = "Diagram unavailable.";
      });
  }, [code, id]);

  return <div ref={ref} className="overflow-x-auto rounded-md border border-edge bg-panel p-4" />;
}
