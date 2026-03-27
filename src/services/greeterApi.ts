import { toApiUrl } from "./apiBase";
import { buildSynthesisAuthHeaders } from "./synthesisAuth";

const API_BASE = import.meta.env.VITE_SYNTHESIS_API_BASE_URL;
const jsonHeaders = { "content-type": "application/json" };

const readJson = async <T,>(response: Response): Promise<T> => {
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    if (typeof payload === "object" && payload != null && "error" in payload && typeof (payload as { error?: unknown }).error === "string") {
      throw new Error((payload as { error: string }).error);
    }
    throw new Error(`Request failed (${response.status}).`);
  }
  return payload as T;
};

export interface GreeterAnswerOption {
  id: number;
  position: number;
  label: string;
  description: string | null;
  icon: string | null;
}

export interface GreeterQuestion {
  id: number;
  position: number;
  text: string;
  answers: GreeterAnswerOption[];
}

export interface GreeterQuestionsResponse {
  event_slug: string;
  event_name: string;
  questions: GreeterQuestion[];
}

export interface GreeterRouteStop {
  category: string | null;
  title: string | null;
  products: string | null;
  description: string | null;
}

export interface GreeterRouteResponse {
  route_id: number;
  route: {
    primary: GreeterRouteStop;
    secondary: GreeterRouteStop;
  };
}

export interface GreeterSessionRecord {
  session_id: number;
  event_slug: string;
  answer_q1: string | null;
  answer_q2: string | null;
  answer_q3: string | null;
  answer_q4: string | null;
  route_id: number | null;
  primary_category: string | null;
  primary_title: string | null;
  secondary_category: string | null;
  secondary_title: string | null;
  feedback_q1: string | null;
  feedback_q2: string | null;
  feedback_q3: string | null;
  completed_at: string;
}

export interface GreeterSessionsResponse {
  sessions: GreeterSessionRecord[];
  total: number;
}

export const greeterApi = {
  getQuestions: async (eventSlug?: string): Promise<GreeterQuestionsResponse> => {
    const query = eventSlug ? `?event_slug=${encodeURIComponent(eventSlug)}` : "";
    const response = await fetch(toApiUrl(`/api/greeter/questions${query}`, API_BASE));
    return readJson<GreeterQuestionsResponse>(response);
  },

  resolveRoute: async (
    payload: { answers: { q1: string; q2: string; q3: string; q4: string }; event_slug?: string },
  ): Promise<GreeterRouteResponse> => {
    const response = await fetch(toApiUrl("/api/greeter/route", API_BASE), {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
    return readJson<GreeterRouteResponse>(response);
  },

  saveSession: async (payload: {
    event_slug: string;
    answer_q1: string;
    answer_q2: string;
    answer_q3: string;
    answer_q4: string;
    route_id: number;
    feedback_q1: string;
    feedback_q2: string;
    feedback_q3: string;
  }): Promise<{ ok: boolean; session_id: number }> => {
    const response = await fetch(toApiUrl("/api/greeter/sessions", API_BASE), {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
    return readJson<{ ok: boolean; session_id: number }>(response);
  },

  getSessions: async (eventSlug?: string): Promise<GreeterSessionsResponse> => {
    const query = eventSlug ? `?event_slug=${encodeURIComponent(eventSlug)}` : "";
    const response = await fetch(toApiUrl(`/api/greeter/sessions${query}`, API_BASE), {
      headers: buildSynthesisAuthHeaders(),
    });
    return readJson<GreeterSessionsResponse>(response);
  },
};
