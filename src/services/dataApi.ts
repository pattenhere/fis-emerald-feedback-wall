import type { CardSortConcept, FeatureRequest, KudosQuote, ScreenFeedback } from "../types/domain";
import type { SeedTableDefinition } from "../state/adminSeedData";
import type { DbSeedPayload } from "../state/dbSeedPayload";
import type { AppArea } from "../types/domain";
import { buildSynthesisAuthHeaders } from "./synthesisAuth";
import type { TShirtSizingResultsPayload } from "../synthesis/tshirt/sizingResultsStore";
import type { Day2Narrative } from "./synthesisModuleApi";
import { toApiUrl } from "./apiBase";

export interface BootstrapResponse {
  appAreas: Array<{ id: AppArea; label: string; dark?: boolean }>;
  products: Array<{
    id: number;
    name: string;
    status?: string;
    description?: string;
    legacyProductCode?: string;
    category: string;
    subcategory: string;
  }>;
  features: Array<{
    id: number;
    productId: number;
    name: string;
    description?: string;
    status?: string;
    moduleName?: string;
    legacyFeatureCode?: string;
  }>;
  screens: Array<{
    id: number;
    productId: number;
    name: string;
    screenCategory?: string;
    description?: string;
    legacyScreenCode?: string;
    thumbnailAssetPath?: string;
    assets?: string[];
  }>;
  cardSortConcepts: CardSortConcept[];
  featureRequests: FeatureRequest[];
  kudosQuotes: KudosQuote[];
  screenFeedback: ScreenFeedback[];
  adminTables: SeedTableDefinition[];
}

interface AdminTablesResponse {
  tables: SeedTableDefinition[];
}

interface HealthResponse {
  ok: boolean;
  dataSourceMode?: "db" | "flat";
  dbEngine?: "sqlite" | "postgres";
}

export interface AdminBootstrapResponse {
  sessionConfig: Record<string, unknown>;
  synthesisParameters: {
    parameters: Record<string, unknown>;
    updatedAt: string | null;
    usingDefaults: boolean;
  };
  inputsCount: Record<string, unknown>;
  dedupCounts: Record<string, unknown>;
  latestPhase1Analysis?: unknown;
  latestTShirtSizing?: TShirtSizingResultsPayload | null;
  savedNarrative?: Day2Narrative | null;
  moderation: {
    pendingCount: number;
  };
  loadedAt: string;
}

const jsonHeaders = { "content-type": "application/json" };
const SESSION_STORAGE_KEY = "emerald.feedback.session_id";
const API_BASE = import.meta.env.VITE_SYNTHESIS_API_BASE_URL;

let inMemorySessionId: string | null = null;
const getSessionId = (): string => {
  if (inMemorySessionId) return inMemorySessionId;
  const generated = `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  if (typeof window === "undefined") {
    inMemorySessionId = generated;
    return inMemorySessionId;
  }
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && existing.trim().length > 0) {
      inMemorySessionId = existing;
      return inMemorySessionId;
    }
    window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
    inMemorySessionId = generated;
    return inMemorySessionId;
  } catch {
    inMemorySessionId = generated;
    return inMemorySessionId;
  }
};

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let parsedBody: unknown = null;
  if (text) {
    try {
      parsedBody = JSON.parse(text) as unknown;
    } catch {
      parsedBody = text;
    }
  }

  if (!response.ok) {
    if (typeof parsedBody === "object" && parsedBody != null && "error" in parsedBody) {
      const candidate = (parsedBody as { error?: unknown }).error;
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        throw new Error(candidate);
      }
    }
    if (typeof parsedBody === "string" && parsedBody.trim().length > 0) {
      throw new Error(parsedBody.trim().slice(0, 240));
    }
    throw new Error(`API error (${response.status})`);
  }

  if (!text) {
    return {} as T;
  }
  if (typeof parsedBody === "string") {
    throw new Error("Server returned non-JSON success response.");
  }
  return parsedBody as T;
};

export const dataApi = {
  getHealth: async (): Promise<HealthResponse> => {
    const response = await fetch(toApiUrl("/api/health", API_BASE));
    return readJson<HealthResponse>(response);
  },

  getBootstrap: async (): Promise<BootstrapResponse> => {
    const response = await fetch("/api/bootstrap");
    return readJson<BootstrapResponse>(response);
  },

  getAdminBootstrap: async (): Promise<AdminBootstrapResponse> => {
    const response = await fetch("/api/bootstrap-admin");
    return readJson<AdminBootstrapResponse>(response);
  },

  getAdminTables: async (): Promise<SeedTableDefinition[]> => {
    const response = await fetch("/api/admin/tables", { headers: buildSynthesisAuthHeaders() });
    const payload = await readJson<AdminTablesResponse>(response);
    return Array.isArray(payload.tables) ? payload.tables : [];
  },

  reseed: async (payload: DbSeedPayload): Promise<void> => {
    const response = await fetch("/api/admin/reseed", {
      method: "POST",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
      body: JSON.stringify(payload),
    });
    await readJson<{ ok: boolean }>(response);
  },

  addFeatureRequest: async (feature: FeatureRequest): Promise<void> => {
    const response = await fetch("/api/feature-requests", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ ...feature, sessionId: getSessionId() }),
    });
    await readJson<{ ok: boolean }>(response);
  },

  upvoteFeatureRequest: async (featureId: number): Promise<{ votes: number }> => {
    const response = await fetch(`/api/feature-requests/${featureId}/upvote`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ sessionId: getSessionId() }),
    });
    const payload = await readJson<{ ok: boolean; votes?: number }>(response);
    return { votes: Number(payload.votes ?? 0) };
  },

  addKudos: async (kudos: KudosQuote): Promise<void> => {
    const response = await fetch("/api/kudos", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(kudos),
    });
    await readJson<{ ok: boolean }>(response);
  },

  addScreenFeedback: async (feedback: ScreenFeedback): Promise<void> => {
    const response = await fetch("/api/screen-feedback", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(feedback),
    });
    await readJson<{ ok: boolean }>(response);
  },

  setCardSortTier: async (payload: { conceptTitle: string; tier: "high" | "medium" | "low"; role?: string }): Promise<void> => {
    const response = await fetch("/api/card-sort", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
    await readJson<{ ok: boolean }>(response);
  },
};
