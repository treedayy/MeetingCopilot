import type { MeetingState } from "./useMeeting";
import type { Concept } from "./types";

/**
 * The single-focus resolver: given everything the AI knows, decide the ONE
 * dominant idea the UI should show right now. Priority:
 *
 *   alert     — risk, contradiction, urgent coaching (recent)
 *   coaching  — a decision just landed, or strategic guidance is timely
 *   insight   — a concept is being taught, or the understanding just updated
 *   listening — nothing demands attention; stay out of the way
 */

export type Mode = "listening" | "insight" | "coaching" | "alert";

export interface Focus {
  mode: Mode;
  label: string; // tiny kicker, e.g. "Risk detected"
  body: string; // the one dominant sentence(s)
  detail?: string; // revealed on "why?" expansion
  concept?: Concept; // when the focus is teaching
  t: number;
  confidence?: number;
}

const ALERT_WINDOW = 30; // seconds of meeting time an alert stays dominant
const COACH_WINDOW = 35;
const INSIGHT_WINDOW = 45;

export function resolveFocus(state: MeetingState): Focus {
  const now = state.segments.length ? state.segments[state.segments.length - 1].t : 0;
  const recent = (t: number, window: number) => now - t <= window;

  // --- alert -----------------------------------------------------------
  const contradiction = [...state.memoryItems].reverse().find(
    (m) => m.kind === "contradiction" && recent(m.t, ALERT_WINDOW)
  );
  const urgentTip = [...state.coachTips].reverse().find(
    (c) => c.urgency === "high" && recent(c.t, ALERT_WINDOW)
  );
  const alertInsight = [...state.insights].reverse().find(
    (i) => i.kind === "alert" && recent(i.t, ALERT_WINDOW)
  );
  const alerts = [
    contradiction && {
      t: contradiction.t, label: "Possible contradiction", body: contradiction.text,
      confidence: contradiction.confidence,
    },
    urgentTip && { t: urgentTip.t, label: "Act now", body: urgentTip.text, confidence: urgentTip.confidence },
    alertInsight && { t: alertInsight.t, label: "Risk detected", body: alertInsight.text, confidence: alertInsight.confidence },
  ].filter(Boolean) as { t: number; label: string; body: string; confidence?: number }[];
  if (alerts.length) {
    const top = alerts.sort((a, b) => b.t - a.t)[0];
    return { mode: "alert", ...top };
  }

  // --- coaching ----------------------------------------------------------
  const decision = [...state.decisions].reverse().find((d) => recent(d.t, COACH_WINDOW));
  if (decision) {
    return {
      mode: "coaching",
      label: `Decision forming${decision.approved_by ? ` — ${decision.approved_by}` : ""}`,
      body: decision.decision,
      detail: decision.reason ? `Reason given: ${decision.reason}` : undefined,
      t: decision.t,
      confidence: decision.confidence,
    };
  }
  const tip = [...state.coachTips].reverse().find((c) => recent(c.t, COACH_WINDOW));
  if (tip) {
    return { mode: "coaching", label: "Coach", body: tip.text, t: tip.t, confidence: tip.confidence };
  }

  // --- insight -------------------------------------------------------------
  const concept = [...state.concepts]
    .filter((c) => !c.known && recent(c.first_t, INSIGHT_WINDOW))
    .sort((a, b) => b.first_t - a.first_t)[0];
  const understanding = state.understandings[state.understandings.length - 1];
  if (concept && (!understanding || concept.first_t >= understanding.t - 10)) {
    return {
      mode: "insight",
      label: `New concept — ${concept.term}`,
      body: concept.beginner || concept.what,
      detail: concept.why_now,
      concept,
      t: concept.first_t,
    };
  }
  if (understanding && recent(understanding.t, INSIGHT_WINDOW)) {
    return { mode: "insight", label: "What's happening", body: understanding.text, t: understanding.t };
  }

  // --- listening -------------------------------------------------------------
  return {
    mode: "listening",
    label: "Listening",
    body: understanding?.text ?? "I'll surface what matters as the discussion develops.",
    t: now,
  };
}

/** The one suggested next move: the best unasked question, or an ownership nudge. */
export function resolveSuggestion(state: MeetingState): { text: string; hint: string } | null {
  const unowned = [...state.actions].reverse().find((a) => a.owner === "TBD" && a.status === "open");
  if (unowned) {
    return { text: `Who's taking “${unowned.task.slice(0, 60)}”?`, hint: "nobody owns this yet" };
  }
  const top = [...state.questions].sort((a, b) => b.score - a.score)[0];
  if (top) {
    return { text: top.text, hint: top.rationale || top.category };
  }
  return null;
}
