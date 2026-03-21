import type { ScreenFeedback } from "../types/domain";

export type CompetingViewConflictEntry = {
  appSection: string;
  screenName: string;
  positiveCount: number;
  negativeCount: number;
  totalCount: number;
  splitRatio: number;
};

export type CompetingViewScreenFeedback = {
  appSection: string;
  screenName: string;
  typeTag: "pain_point" | "confusing" | "missing_element" | "works_well" | "suggestion";
  freetext?: string | null;
};

type DetectConfig = {
  minEach: number;
  minSplitRatio: number;
};

const POSITIVE = new Set(["works_well"]);
const NEGATIVE = new Set(["pain_point", "confusing", "missing_element"]);

const toTypeTag = (type: string): CompetingViewScreenFeedback["typeTag"] => {
  const normalized = String(type ?? "").trim().toLowerCase().replaceAll("-", "_");
  if (normalized === "works_well") return "works_well";
  if (normalized === "missing" || normalized === "missing_element") return "missing_element";
  if (normalized === "issue" || normalized === "pain_point") return "pain_point";
  if (normalized === "confusing") return "confusing";
  return "suggestion";
};

export const normalizeCompetingFeedback = (records: ScreenFeedback[]): CompetingViewScreenFeedback[] => {
  return records.map((item) => ({
    appSection: String(item.app ?? ""),
    screenName: String(item.screenName ?? ""),
    typeTag: toTypeTag(item.type),
    freetext: item.text ?? "",
  }));
};

export const detectCompetingPerspectives = (
  records: ScreenFeedback[],
  config: DetectConfig,
): { conflicts: CompetingViewConflictEntry[]; normalizedFeedback: CompetingViewScreenFeedback[] } => {
  const normalizedFeedback = normalizeCompetingFeedback(records);
  const byScreen = new Map<string, CompetingViewScreenFeedback[]>();
  for (const row of normalizedFeedback) {
    const key = `${row.appSection}::${row.screenName}`;
    const items = byScreen.get(key) ?? [];
    items.push(row);
    byScreen.set(key, items);
  }

  const conflicts: CompetingViewConflictEntry[] = [];
  const minEach = Number(config.minEach);
  const minSplitRatio = Number(config.minSplitRatio);

  for (const [key, rows] of byScreen.entries()) {
    const positiveCount = rows.filter((row) => POSITIVE.has(row.typeTag)).length;
    const negativeCount = rows.filter((row) => NEGATIVE.has(row.typeTag)).length;
    if (positiveCount < minEach || negativeCount < minEach) continue;
    const splitRatio = Math.min(positiveCount, negativeCount) / Math.max(positiveCount, negativeCount);
    if (splitRatio < minSplitRatio) continue;
    const [appSection, screenName] = key.split("::");
    conflicts.push({
      appSection,
      screenName,
      positiveCount,
      negativeCount,
      totalCount: rows.length,
      splitRatio,
    });
  }

  conflicts.sort((a, b) => {
    const scoreA = Math.min(a.positiveCount, a.negativeCount) * a.splitRatio;
    const scoreB = Math.min(b.positiveCount, b.negativeCount) * b.splitRatio;
    return scoreB - scoreA || b.totalCount - a.totalCount;
  });

  return { conflicts, normalizedFeedback };
};
