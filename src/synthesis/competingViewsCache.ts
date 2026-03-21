import type { CompetingViewConflictEntry, CompetingViewScreenFeedback } from "./detectCompetingPerspectives";

export const COMPETING_PERSPECTIVES_CACHE_KEY = "competingPerspectivesCache";

export type CompetingPerspectivesThresholds = {
  minEach: number;
  minSplitRatio: number;
};

export type CompetingPerspectivesCache = {
  result: CompetingViewConflictEntry[];
  screenFeedback: CompetingViewScreenFeedback[];
  computedAt: string;
  thresholdsUsed: CompetingPerspectivesThresholds;
};

export const readCompetingPerspectivesCache = (): CompetingPerspectivesCache | null => {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(COMPETING_PERSPECTIVES_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CompetingPerspectivesCache>;
    if (!parsed || typeof parsed !== "object") return null;
    const result =
      Array.isArray(parsed.result)
        ? parsed.result
        : Array.isArray((parsed as { conflicts?: unknown[] }).conflicts)
          ? ((parsed as { conflicts: unknown[] }).conflicts as unknown[])
          : null;
    if (!Array.isArray(result) || !Array.isArray(parsed.screenFeedback) || typeof parsed.computedAt !== "string") return null;
    const thresholdsRaw =
      parsed.thresholdsUsed ??
      (parsed as { thresholdsAtComputation?: Partial<CompetingPerspectivesThresholds> }).thresholdsAtComputation;
    const thresholds = thresholdsRaw as
      | (Partial<CompetingPerspectivesThresholds> & {
          competingMinEach?: number;
          competingMinSplitRatio?: number;
        })
      | undefined;
    const minEach = thresholds?.minEach ?? thresholds?.competingMinEach;
    const minSplitRatio = thresholds?.minSplitRatio ?? thresholds?.competingMinSplitRatio;
    if (
      !thresholds ||
      typeof thresholds !== "object" ||
      typeof minEach !== "number" ||
      typeof minSplitRatio !== "number"
    ) {
      return null;
    }
    return {
      result: result as CompetingViewConflictEntry[],
      screenFeedback: parsed.screenFeedback as CompetingViewScreenFeedback[],
      computedAt: parsed.computedAt,
      thresholdsUsed: {
        minEach,
        minSplitRatio,
      },
    };
  } catch {
    return null;
  }
};

export const writeCompetingPerspectivesCache = (payload: CompetingPerspectivesCache): void => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(COMPETING_PERSPECTIVES_CACHE_KEY, JSON.stringify(payload));
};
