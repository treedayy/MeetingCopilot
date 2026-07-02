export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  createMeeting: (mode: "demo" | "live", title = "") =>
    request<{ id: string; title: string; mode: string }>("/api/meetings", {
      method: "POST",
      body: JSON.stringify({ mode, title }),
    }),
  listMeetings: () => request<import("./types").MeetingSummary[]>("/api/meetings"),
  getMeeting: (id: string) => request<Record<string, unknown>>(`/api/meetings/${id}`),
  getReport: (id: string) =>
    request<{ id: string; title: string; report_md: string | null }>(`/api/meetings/${id}/report`),
  search: (q: string) =>
    request<{ query: string; results: import("./types").SearchResult[] }>(
      `/api/search?q=${encodeURIComponent(q)}`
    ),
  updateAction: (meetingId: string, actionId: string, status: "open" | "done") =>
    request(`/api/meetings/${meetingId}/actions/${actionId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteMeeting: (id: string) => request(`/api/meetings/${id}`, { method: "DELETE" }),
  getProfile: () => request<Profile>("/api/profile"),
  updateProfile: (profile: Partial<Profile>) =>
    request<Profile>("/api/profile", { method: "PUT", body: JSON.stringify(profile) }),
  activity: () => request<ActivityEvent[]>("/api/activity"),
  tasks: () => request<WorkTask[]>("/api/tasks"),
  decisions: () => request<WorkDecision[]>("/api/decisions"),
};

export interface ActivityEvent {
  at: string;
  type: "meeting_started" | "meeting_ended" | "decision" | "task";
  meeting_id: string;
  meeting_title: string;
  text: string;
  needs_review?: boolean;
}

export interface WorkTask {
  id: string;
  meeting_id: string;
  meeting_title: string;
  at: string;
  task: string;
  owner: string;
  deadline: string;
  priority: string;
  status: string;
  needs_review: boolean;
}

export interface WorkDecision {
  id: string;
  meeting_id: string;
  meeting_title: string;
  at: string;
  decision: string;
  reason: string;
  approved_by: string;
  needs_review: boolean;
}

export interface Profile {
  name: string;
  role: string;
  experience: string;
  depth: string;
  known_technologies: string[];
  learning_goals: string[];
  learned: Record<string, { count: number; last_meeting_id?: string }>;
}
