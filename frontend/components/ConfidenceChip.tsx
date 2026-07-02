"use client";

/** Visually distinguishes facts from inferences: solid green ≥85%,
 *  solid blue ≥70%, dashed amber below (an inference to verify). */
export function ConfidenceChip({ value }: { value?: number }) {
  if (value === undefined || value === null) return null;
  const pct = Math.round(value * 100);
  const style =
    pct >= 85
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : pct >= 70
        ? "border-sky-400/40 bg-sky-400/10 text-sky-300"
        : "border-dashed border-amber-400/50 bg-amber-400/10 text-amber-300";
  return (
    <span
      className={`chip border ${style}`}
      title={pct >= 70 ? "High-confidence extraction" : "Inference — worth verifying"}
    >
      {pct}%
    </span>
  );
}
