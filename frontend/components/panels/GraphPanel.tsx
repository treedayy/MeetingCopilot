"use client";

import { useEffect, useRef, useState } from "react";
import { Network } from "lucide-react";
import type { GraphEdge, GraphNode } from "@/lib/types";

const KIND_COLORS: Record<string, string> = {
  person: "#6d8bff",
  technology: "#37d0c4",
  project: "#f0b35c",
  service: "#c084fc",
  topic: "#94a3b8",
  decision: "#4ade80",
};

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Tiny force simulation: repulsion between all nodes, springs along edges,
 *  gentle pull to center. Runs a few dozen ticks per new node, then settles. */
export function GraphPanel({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Map<string, SimNode>>(new Map());
  const [, forceRender] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const ticksRef = useRef(0);

  useEffect(() => {
    const sim = simRef.current;
    const w = containerRef.current?.clientWidth ?? 400;
    const h = containerRef.current?.clientHeight ?? 400;
    let added = false;
    nodes.forEach((n, i) => {
      if (!sim.has(n.key)) {
        const angle = (i * 2.4) % (Math.PI * 2);
        sim.set(n.key, {
          ...n,
          x: w / 2 + Math.cos(angle) * (60 + (i % 5) * 22),
          y: h / 2 + Math.sin(angle) * (60 + (i % 5) * 22),
          vx: 0,
          vy: 0,
        });
        added = true;
      }
    });
    if (added) ticksRef.current = 160;

    const tick = () => {
      if (ticksRef.current <= 0) {
        rafRef.current = null;
        return;
      }
      ticksRef.current -= 1;
      const list = [...sim.values()];
      const cw = containerRef.current?.clientWidth ?? 400;
      const ch = containerRef.current?.clientHeight ?? 400;

      for (const a of list) {
        let fx = (cw / 2 - a.x) * 0.002;
        let fy = (ch / 2 - a.y) * 0.002;
        for (const b of list) {
          if (a === b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = Math.max(80, dx * dx + dy * dy);
          const f = 900 / d2;
          const d = Math.sqrt(d2);
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }
        a.vx = (a.vx + fx) * 0.85;
        a.vy = (a.vy + fy) * 0.85;
      }
      for (const e of edges) {
        const a = sim.get(e.source);
        const b = sim.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const f = (d - 90) * 0.004;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      for (const n of list) {
        n.x = Math.max(24, Math.min(cw - 24, n.x + n.vx));
        n.y = Math.max(20, Math.min(ch - 20, n.y + n.vy));
      }
      forceRender((v) => v + 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    if (rafRef.current === null && ticksRef.current > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [nodes, edges]);

  const sim = simRef.current;
  const neighborKeys = hovered
    ? new Set(
        edges
          .filter((e) => e.source === hovered || e.target === hovered)
          .flatMap((e) => [e.source, e.target])
      )
    : null;

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        {nodes.length === 0 && (
          <p className="pt-8 text-center text-xs text-slate-600">
            <Network className="mx-auto mb-2 h-5 w-5" />
            People, technologies and projects connect here as the meeting unfolds.
          </p>
        )}
        <svg className="h-full w-full">
          {edges.map((e, i) => {
            const a = sim.get(e.source);
            const b = sim.get(e.target);
            if (!a || !b) return null;
            const dim = neighborKeys && !(e.source === hovered || e.target === hovered);
            return (
              <g key={i} opacity={dim ? 0.12 : 0.5}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3b4258" strokeWidth={1} />
                {(e.source === hovered || e.target === hovered) && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 4}
                    fill="#8b93ab"
                    fontSize={9}
                    textAnchor="middle"
                  >
                    {e.relation}
                  </text>
                )}
              </g>
            );
          })}
          {[...sim.values()]
            .filter((n) => nodes.some((x) => x.key === n.key))
            .map((n) => {
              const color = KIND_COLORS[n.kind] ?? KIND_COLORS.topic;
              const dim = neighborKeys && !neighborKeys.has(n.key) && n.key !== hovered;
              return (
                <g
                  key={n.key}
                  opacity={dim ? 0.2 : 1}
                  onMouseEnter={() => setHovered(n.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={n.x} cy={n.y} r={n.kind === "person" ? 9 : 7} fill={color} fillOpacity={0.9} />
                  <circle cx={n.x} cy={n.y} r={n.kind === "person" ? 13 : 11} fill={color} fillOpacity={0.12} />
                  <text x={n.x} y={n.y + 22} fill="#c6ccdd" fontSize={10} textAnchor="middle">
                    {n.label}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>
      <div className="flex shrink-0 flex-wrap gap-3 border-t border-edge px-3 py-2">
        {Object.entries(KIND_COLORS).map(([kind, color]) => (
          <span key={kind} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {kind}
          </span>
        ))}
      </div>
    </div>
  );
}
