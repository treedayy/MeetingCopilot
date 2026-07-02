"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { WS_URL, api } from "./api";
import type {
  ActionItem, CoachTip, Concept, Decision, DiagramVersion, GraphEdge,
  GraphNode, HealthState, Insight, MemoryItem, Person, Question,
  RetrievalItem, TranscriptSegment, Understanding,
} from "./types";

export interface MeetingState {
  connected: boolean;
  status: string;
  reportReady: boolean;
  meetingTitle: string;
  meetingStatus: string; // live | ended
  meetingMode: string; // demo | live
  segments: TranscriptSegment[];
  understandings: Understanding[];
  insights: Insight[];
  concepts: Concept[];
  questions: Question[];
  actions: ActionItem[];
  decisions: Decision[];
  people: Person[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  coachTips: CoachTip[];
  memoryItems: MemoryItem[];
  retrievals: RetrievalItem[];
  diagrams: DiagramVersion[];
  health: HealthState | null;
}

const initialState: MeetingState = {
  connected: false,
  status: "connecting…",
  reportReady: false,
  meetingTitle: "",
  meetingStatus: "live",
  meetingMode: "demo",
  segments: [],
  understandings: [],
  insights: [],
  concepts: [],
  questions: [],
  actions: [],
  decisions: [],
  people: [],
  nodes: [],
  edges: [],
  coachTips: [],
  memoryItems: [],
  retrievals: [],
  diagrams: [],
  health: null,
};

type Event = { type: string } & Record<string, unknown>;

function reducer(state: MeetingState, e: Event): MeetingState {
  switch (e.type) {
    case "connected":
      return { ...state, connected: true, status: "listening" };
    case "disconnected":
      return { ...state, connected: false, status: "reconnecting…" };
    case "status":
      return { ...state, status: e.text as string };
    case "hydrate":
      return { ...state, ...(e.data as Partial<MeetingState>) };
    case "transcript_segment":
      return { ...state, segments: [...state.segments, e as unknown as TranscriptSegment] };
    case "understanding":
      return { ...state, understandings: [...state.understandings, e as unknown as Understanding] };
    case "insight":
      return { ...state, insights: [...state.insights, e as unknown as Insight] };
    case "concept":
      if (state.concepts.some((c) => c.term === e.term)) return state;
      return { ...state, concepts: [e as unknown as Concept, ...state.concepts] };
    case "concept_mention":
      return {
        ...state,
        concepts: state.concepts.map((c) =>
          c.term === e.term ? { ...c, mentions: e.mentions as number } : c
        ),
      };
    case "question": {
      const questions = [...state.questions, e as unknown as Question];
      questions.sort((a, b) => b.score - a.score);
      return { ...state, questions };
    }
    case "action_item":
      return { ...state, actions: [...state.actions, e as unknown as ActionItem] };
    case "action_updated":
      return {
        ...state,
        actions: state.actions.map((a) =>
          a.id === e.id ? { ...a, status: e.status as "open" | "done" } : a
        ),
      };
    case "decision":
      return { ...state, decisions: [...state.decisions, e as unknown as Decision] };
    case "person": {
      const p = e as unknown as Person;
      const rest = state.people.filter((x) => x.name !== p.name);
      return { ...state, people: [...rest, p].sort((a, b) => b.words - a.words) };
    }
    case "graph": {
      const nodes = [...state.nodes];
      for (const n of (e.nodes as GraphNode[]) ?? []) {
        if (!nodes.some((x) => x.key === n.key)) nodes.push(n);
      }
      const edges = [...state.edges];
      for (const ed of (e.edges as GraphEdge[]) ?? []) {
        if (!edges.some((x) => x.source === ed.source && x.target === ed.target && x.relation === ed.relation)) {
          edges.push(ed);
        }
      }
      return { ...state, nodes, edges };
    }
    case "coach":
      return { ...state, coachTips: [...state.coachTips, e as unknown as CoachTip] };
    case "memory":
      return { ...state, memoryItems: [...state.memoryItems, e as unknown as MemoryItem] };
    case "retrieval":
      return { ...state, retrievals: [...state.retrievals, e as unknown as RetrievalItem] };
    case "diagram":
      return { ...state, diagrams: [...state.diagrams, e as unknown as DiagramVersion] };
    case "state_update":
      return { ...state, health: e as unknown as HealthState };
    case "report_ready":
      return { ...state, reportReady: true, status: "completed", meetingStatus: "ended" };
    default:
      return state;
  }
}

export function useMeeting(meetingId: string) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const [micActive, setMicActive] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const closedRef = useRef(false);

  // Hydrate previously persisted data (page refresh mid-meeting).
  useEffect(() => {
    api.getMeeting(meetingId).then((data) => {
      dispatch({
        type: "hydrate",
        data: {
          meetingTitle: data.title,
          meetingStatus: data.status,
          meetingMode: data.mode,
          segments: data.segments,
          understandings: data.understandings,
          insights: data.insights,
          concepts: (data.concepts as Concept[]).slice().reverse(),
          questions: data.questions,
          actions: data.actions,
          decisions: data.decisions,
          people: data.people,
          nodes: (data.graph as { nodes: GraphNode[] }).nodes,
          edges: (data.graph as { edges: GraphEdge[] }).edges,
          coachTips: data.coach_tips,
          memoryItems: data.memory_items,
          retrievals: data.retrievals,
          diagrams: data.diagrams,
          health: (data.health as HealthState[]).length
            ? (data.health as HealthState[])[(data.health as HealthState[]).length - 1]
            : null,
          reportReady: Boolean(data.has_report),
        },
      });
    }).catch(() => undefined);
  }, [meetingId]);

  useEffect(() => {
    closedRef.current = false;
    let retry = 0;

    const connect = () => {
      if (closedRef.current) return;
      const ws = new WebSocket(`${WS_URL}/ws/meeting/${meetingId}`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        dispatch({ type: "connected" });
      };
      ws.onmessage = (msg) => {
        try {
          dispatch(JSON.parse(msg.data));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        dispatch({ type: "disconnected" });
        if (!closedRef.current) {
          retry += 1;
          setTimeout(connect, Math.min(500 * 2 ** retry, 8000));
        }
      };
    };
    connect();
    return () => {
      closedRef.current = true;
      wsRef.current?.close();
    };
  }, [meetingId]);

  const send = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const startDemo = useCallback(() => send({ type: "start_demo" }), [send]);
  const sendUtterance = useCallback(
    (speaker: string, text: string) => send({ type: "utterance", speaker, text }),
    [send]
  );
  const endMeeting = useCallback((myName = "") => send({ type: "end", my_name: myName }), [send]);

  const markAction = useCallback(
    async (actionId: string, status: "open" | "done") => {
      dispatch({ type: "action_updated", id: actionId, status });
      try {
        await api.updateAction(meetingId, actionId, status);
      } catch {
        dispatch({ type: "action_updated", id: actionId, status: status === "done" ? "open" : "done" });
      }
    },
    [meetingId]
  );

  const toggleMic = useCallback(
    (speakerName: string) => {
      if (micActive) {
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        setMicActive(false);
        return;
      }
      const w = window as unknown as Record<string, unknown>;
      const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
        | (new () => {
            continuous: boolean;
            interimResults: boolean;
            lang: string;
            onresult: (e: unknown) => void;
            onend: () => void;
            start: () => void;
            stop: () => void;
          })
        | undefined;
      if (!Ctor) {
        dispatch({ type: "status", text: "Speech recognition not supported in this browser — use Chrome/Edge, or type below." });
        return;
      }
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onresult = (e) => {
        const ev = e as { resultIndex: number; results: { [i: number]: { isFinal: boolean; 0: { transcript: string } }; length: number } };
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal && r[0].transcript.trim()) {
            sendUtterance(speakerName || "Me", r[0].transcript.trim());
          }
        }
      };
      rec.onend = () => {
        // Chrome stops recognition periodically; restart while mic is on.
        if (recognitionRef.current === rec) {
          try {
            rec.start();
          } catch {
            setMicActive(false);
          }
        }
      };
      recognitionRef.current = rec;
      rec.start();
      setMicActive(true);
    },
    [micActive, sendUtterance]
  );

  return { state, startDemo, sendUtterance, endMeeting, markAction, toggleMic, micActive };
}
