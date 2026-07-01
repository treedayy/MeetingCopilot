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
};
