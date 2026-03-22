import type { SizingResult, TShirtSize } from "./types";

export type TShirtSizingResultsPayload = {
  results: SizingResult[];
  savedAt: string;
};

const T_SHIRT_SIZING_RESULTS_KEY = "tshirtSizingResults";

const VALID_SIZES = new Set<TShirtSize>(["XS", "S", "M", "L"]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const toStringOrEmpty = (value: unknown): string => {
  return typeof value === "string" ? value : "";
};

const parseSize = (value: unknown): TShirtSize | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  return VALID_SIZES.has(value as TShirtSize) ? (value as TShirtSize) : null;
};

const parseAIEstimate = (value: unknown): SizingResult["aiEstimate"] => {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;
  const size = parseSize(value.size);
  if (!size) return null;
  return {
    size,
    hoursEstimate: toStringOrEmpty(value.hoursEstimate),
    rationale: toStringOrEmpty(value.rationale),
    risk: toStringOrEmpty(value.risk),
  };
};

const parseSizingResult = (value: unknown): SizingResult | null => {
  if (!isRecord(value)) return null;
  const p0ItemTitle = toStringOrEmpty(value.p0ItemTitle);
  const notes = toStringOrEmpty(value.notes);
  const savedAt = toStringOrEmpty(value.savedAt);
  const size = parseSize(value.size);
  const aiEstimate = parseAIEstimate(value.aiEstimate);

  if (!p0ItemTitle) return null;

  return {
    p0ItemTitle,
    size,
    notes,
    aiEstimate,
    savedAt,
  };
};

const parsePayload = (value: unknown): TShirtSizingResultsPayload | null => {
  if (Array.isArray(value)) {
    const results = value.map((item) => parseSizingResult(item)).filter((item): item is SizingResult => item != null);
    if (!results.length) return null;
    return {
      results,
      savedAt: "",
    };
  }

  if (!isRecord(value)) return null;

  const parsedResults = Array.isArray(value.results)
    ? value.results.map((item) => parseSizingResult(item)).filter((item): item is SizingResult => item != null)
    : [];
  const savedAt = toStringOrEmpty(value.savedAt);

  if (!parsedResults.length) return null;

  return {
    results: parsedResults,
    savedAt,
  };
};

const readJson = (key: string): unknown => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeJson = (key: string, payload: unknown): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(payload));
};

export const readTShirtSizingResults = (): TShirtSizingResultsPayload | null => {
  return parsePayload(readJson(T_SHIRT_SIZING_RESULTS_KEY));
};

export const writeTShirtSizingResults = (payload: TShirtSizingResultsPayload): void => {
  const parsed = parsePayload(payload);
  if (!parsed) return;
  writeJson(T_SHIRT_SIZING_RESULTS_KEY, parsed);
};
