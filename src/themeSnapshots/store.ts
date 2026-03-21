import type { ThemeSnapshot } from "./types";

declare const process: {
  env: Record<string, string | undefined>;
};

const SNAPSHOTS_KEY = "themeSnapshots";
const PUBLISHED_KEY = "themeSnapshotsPublished";

const toFiniteInt = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
};

export const THEME_SNAPSHOT_MAX = Math.max(1, toFiniteInt(process.env.THEME_SNAPSHOT_MAX, 12));

const parseSnapshot = (value: unknown): ThemeSnapshot | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ThemeSnapshot>;
  if (typeof row.id !== "string" || typeof row.generatedAt !== "string") return null;
  if (!Array.isArray(row.themes) || row.themes.some((theme) => typeof theme !== "string")) return null;
  if (!row.signalCounts || typeof row.signalCounts !== "object") return null;
  if (!row.thresholdsAtGeneration || typeof row.thresholdsAtGeneration !== "object") return null;
  return {
    id: row.id,
    themes: row.themes,
    generatedAt: row.generatedAt,
    publishedAt: row.publishedAt == null ? null : String(row.publishedAt),
    signalCounts: {
      featureRequests: Number((row.signalCounts as ThemeSnapshot["signalCounts"]).featureRequests ?? 0),
      screenFeedback: Number((row.signalCounts as ThemeSnapshot["signalCounts"]).screenFeedback ?? 0),
      comments: Number((row.signalCounts as ThemeSnapshot["signalCounts"]).comments ?? 0),
    },
    thresholdsAtGeneration: {
      minEach: Number((row.thresholdsAtGeneration as ThemeSnapshot["thresholdsAtGeneration"]).minEach ?? 3),
      minSplitRatio: Number((row.thresholdsAtGeneration as ThemeSnapshot["thresholdsAtGeneration"]).minSplitRatio ?? 0.4),
    },
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

export const readThemeSnapshots = (): ThemeSnapshot[] => {
  const parsed = readJson(SNAPSHOTS_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => parseSnapshot(item))
    .filter((item): item is ThemeSnapshot => item != null);
};

export const appendThemeSnapshot = (snapshot: ThemeSnapshot): void => {
  const current = readThemeSnapshots();
  writeJson(SNAPSHOTS_KEY, [...current, snapshot]);
};

export const readPublishedThemeSnapshot = (): ThemeSnapshot | null => {
  const parsed = readJson(PUBLISHED_KEY);
  return parseSnapshot(parsed);
};

export const writePublishedThemeSnapshot = (snapshot: ThemeSnapshot): void => {
  writeJson(PUBLISHED_KEY, snapshot);
};
