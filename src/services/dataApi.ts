import type { CardSortConcept, FeatureRequest, KudosQuote, ScreenFeedback } from "../types/domain";
import type { SeedTableDefinition } from "../state/adminSeedData";
import type { DbSeedPayload } from "../state/dbSeedPayload";
import type { AppArea } from "../types/domain";

interface BootstrapResponse {
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

const jsonHeaders = { "content-type": "application/json" };

const readJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`API error (${response.status})`);
  }
  return (await response.json()) as T;
};

export const dataApi = {
  getBootstrap: async (): Promise<BootstrapResponse> => {
    const response = await fetch("/api/bootstrap");
    return readJson<BootstrapResponse>(response);
  },

  getAdminTables: async (): Promise<SeedTableDefinition[]> => {
    const response = await fetch("/api/admin/tables");
    const payload = await readJson<AdminTablesResponse>(response);
    return Array.isArray(payload.tables) ? payload.tables : [];
  },

  reseed: async (payload: DbSeedPayload): Promise<void> => {
    const response = await fetch("/api/admin/reseed", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
    await readJson<{ ok: boolean }>(response);
  },

  addFeatureRequest: async (feature: FeatureRequest): Promise<void> => {
    const response = await fetch("/api/feature-requests", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ ...feature, sessionId: "web" }),
    });
    await readJson<{ ok: boolean }>(response);
  },

  upvoteFeatureRequest: async (featureId: number): Promise<void> => {
    const response = await fetch(`/api/feature-requests/${featureId}/upvote`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ sessionId: "web" }),
    });
    await readJson<{ ok: boolean }>(response);
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
