export interface TranscriptSegment {
  id?: string;
  t: number;
  speaker: string;
  text: string;
}

export interface Understanding {
  t: number;
  text: string;
}

export interface Insight {
  t: number;
  kind: "thought" | "alert" | "reminder" | "topic";
  text: string;
  confidence?: number;
}

export interface Concept {
  term: string;
  category: string;
  what: string;
  why_matters: string;
  why_now: string;
  beginner: string;
  intermediate: string;
  advanced: string;
  interview: string;
  analogy: string;
  pitfalls: string;
  related: string[];
  mentions: number;
  first_t: number;
  known?: boolean;
  prior_meetings?: { id: string; title: string; date: string }[];
}

export interface CoachTip {
  t: number;
  kind: "timing" | "gap" | "participation" | "ownership" | "reminder" | "guidance";
  text: string;
  urgency: "low" | "normal" | "high";
  confidence: number;
}

export interface MemoryItem {
  t: number;
  kind: "mention" | "related_decision" | "contradiction";
  text: string;
  ref_meeting_id: string;
  ref_meeting_title: string;
  confidence: number;
}

export interface RetrievalItem {
  t: number;
  source: string;
  title: string;
  summary: string;
  ref: string;
}

export interface DiagramVersion {
  t: number;
  version: number;
  title: string;
  mermaid: string;
}

export interface HealthState {
  t: number;
  topic: string;
  topic_confidence: number;
  agreement: number;
  engagement: number;
  balance: number;
  completeness: number;
  progress: number;
  checklist?: Record<string, boolean>;
  counts?: Record<string, number>;
}

export interface Question {
  id?: string;
  t: number;
  text: string;
  category: string;
  score: number;
  rationale: string;
}

export interface ActionItem {
  id?: string;
  t: number;
  task: string;
  owner: string;
  deadline: string;
  priority: "low" | "medium" | "high";
  status: "open" | "done";
  dependencies: string[];
  confidence?: number;
}

export interface Decision {
  id?: string;
  t: number;
  decision: string;
  reason: string;
  alternatives: string[];
  tradeoffs: string;
  approved_by: string;
  confidence?: number;
}

export interface Person {
  name: string;
  role: string;
  expertise: string[];
  segments_count: number;
  words: number;
  sentiment: string;
  influence: number;
}

export interface GraphNode {
  key: string;
  label: string;
  kind: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface MeetingSummary {
  id: string;
  title: string;
  mode: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  has_report: boolean;
}

export interface SearchResult {
  kind: string;
  meeting_id: string;
  meeting_title: string;
  t: number;
  text: string;
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
