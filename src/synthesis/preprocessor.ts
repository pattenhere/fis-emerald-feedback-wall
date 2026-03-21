import type { AppArea, FeatureRequest, KudosQuote, ScreenFeedback } from "../types/domain";
import { detectCompetingPerspectives as baseDetectCompetingPerspectives } from "./detectCompetingPerspectives";
import type {
  CompetingPerspectiveDetectionResult,
  CompetingPerspectiveThresholds,
  RankedFeatureRequest,
  SynthesisAggregates,
  SynthesisKudosPartitions,
  SynthesisMacroInput,
  SynthesisMacroState,
  SynthesisScreenFeedback,
} from "./types";

const DEFAULT_COMPETING_THRESHOLDS: Required<CompetingPerspectiveThresholds> = {
  minEach: 3,
  minSplitRatio: 0.4,
};

const DEFAULT_UPWEIGHT_MULTIPLIER = 2;
const MAX_ACTIVE_MACROS = 2;

const KNOWN_APP_AREAS = new Set<AppArea>([
  "digital-experience",
  "origination",
  "credit-risk",
  "servicing",
  "monitoring-controls",
  "syndication-complex-lending",
  "analytics-inquiry",
  "platform-services",
]);


const normalizeText = (value: unknown): string => String(value ?? "").trim();

const getAppSection = (item: Pick<SynthesisScreenFeedback, "app" | "appSection">): string =>
  normalizeText(item.appSection ?? item.app);

const getScreenKey = (item: Pick<SynthesisScreenFeedback, "app" | "appSection" | "screenName">): string =>
  `${getAppSection(item)}::${normalizeText(item.screenName)}`;

const normalizePositiveInteger = (value: unknown, fieldName: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SynthesisValidationError(`${fieldName} must be a positive integer.`);
  }
  return Math.max(1, Math.floor(parsed));
};

const normalizeAppArea = (value: unknown): AppArea | undefined => {
  const candidate = normalizeText(value) as AppArea;
  return KNOWN_APP_AREAS.has(candidate) ? candidate : undefined;
};

const sortFeatureRequests = (featureRequests: readonly RankedFeatureRequest[]): RankedFeatureRequest[] => {
  return [...featureRequests].sort((a, b) => {
    const compositeDelta = b.compositeScore - a.compositeScore;
    if (compositeDelta !== 0) return compositeDelta;
    const votesDelta = Number(b.votes ?? 0) - Number(a.votes ?? 0);
    if (votesDelta !== 0) return votesDelta;
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
};

export class SynthesisValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "SynthesisValidationError";
    this.issues = issues;
  }
}

export const validateMacros = (macros: SynthesisMacroInput = {}): SynthesisMacroState => {
  const upweightApp = macros.upweightApp == null ? undefined : normalizeAppArea(macros.upweightApp);
  if (macros.upweightApp != null && upweightApp == null) {
    throw new SynthesisValidationError("upweightApp must be a valid app section.");
  }

  const normalized: SynthesisMacroState = {
    upweightApp,
    p0Only: Boolean(macros.p0Only),
    excludeLowSignalBelow:
      macros.excludeLowSignalBelow == null ? undefined : normalizePositiveInteger(macros.excludeLowSignalBelow, "excludeLowSignalBelow"),
    emphasizeMarketingQuotes: Boolean(macros.emphasizeMarketingQuotes),
  };

  const activeCount = [
    normalized.upweightApp != null,
    normalized.p0Only,
    normalized.excludeLowSignalBelow != null,
    normalized.emphasizeMarketingQuotes,
  ].filter(Boolean).length;

  if (activeCount > MAX_ACTIVE_MACROS) {
    throw new SynthesisValidationError(`At most ${MAX_ACTIVE_MACROS} macros can be active at once.`);
  }

  return normalized;
};

export const applyExclusionFilter = <T extends SynthesisScreenFeedback>(
  screenFeedback: readonly T[],
  minSubmissions?: number,
): T[] => {
  if (minSubmissions == null) {
    return [...screenFeedback];
  }

  const threshold = normalizePositiveInteger(minSubmissions, "excludeLowSignalBelow");
  const counts = new Map<string, number>();
  for (const item of screenFeedback) {
    const key = getScreenKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return screenFeedback.filter((item) => (counts.get(getScreenKey(item)) ?? 0) >= threshold);
};

export const applyUpweighting = <T extends SynthesisScreenFeedback>(
  screenFeedback: readonly T[],
  multiplier = DEFAULT_UPWEIGHT_MULTIPLIER,
): T[] => {
  const safeMultiplier = normalizePositiveInteger(multiplier, "upweightMultiplier");
  if (safeMultiplier <= 1) {
    return [...screenFeedback];
  }

  const weighted: T[] = [];
  for (const item of screenFeedback) {
    weighted.push(item);
    if (item.upweighted === true) {
      for (let index = 1; index < safeMultiplier; index += 1) {
        weighted.push({ ...item, upweighted: true });
      }
    }
  }
  return weighted;
};

const mapToDetectorInput = (item: SynthesisScreenFeedback): ScreenFeedback => ({
  id: item.id,
  productId: item.productId,
  featureId: item.featureId,
  screenId: item.screenId,
  app: getAppSection(item) as AppArea,
  screenName: normalizeText(item.screenName),
  type: item.type,
  text: normalizeText(item.freetext ?? item.text) || undefined,
  followUpQuestion: item.followUpQuestion,
  followUpResponse: item.followUpResponse,
  createdAt: item.createdAt,
});

export const detectCompetingPerspectives = (
  screenFeedback: readonly SynthesisScreenFeedback[],
  thresholds: CompetingPerspectiveThresholds = DEFAULT_COMPETING_THRESHOLDS,
): CompetingPerspectiveDetectionResult => {
  const minEach = Number.isFinite(Number(thresholds.minEach)) ? Number(thresholds.minEach) : DEFAULT_COMPETING_THRESHOLDS.minEach;
  const minSplitRatio = Number.isFinite(Number(thresholds.minSplitRatio))
    ? Number(thresholds.minSplitRatio)
    : DEFAULT_COMPETING_THRESHOLDS.minSplitRatio;

  const detectorInput = screenFeedback.map(mapToDetectorInput);
  const detected = baseDetectCompetingPerspectives(detectorInput, { minEach, minSplitRatio });
  const conflicts = [...detected.conflicts].sort((a, b) => {
    const countDelta = b.totalCount - a.totalCount;
    if (countDelta !== 0) return countDelta;
    const splitDelta = b.splitRatio - a.splitRatio;
    if (splitDelta !== 0) return splitDelta;
    const appDelta = a.appSection.localeCompare(b.appSection);
    if (appDelta !== 0) return appDelta;
    return a.screenName.localeCompare(b.screenName);
  });

  return {
    conflicts,
    normalizedFeedback: detected.normalizedFeedback,
  };
};

export const computeAggregates = (
  featureRequests: readonly FeatureRequest[],
  screenFeedback: readonly SynthesisScreenFeedback[],
  kudos: readonly KudosQuote[],
): SynthesisAggregates => {
  const rankedFeatureRequests: RankedFeatureRequest[] = sortFeatureRequests(
    featureRequests.map((item) => ({
      ...item,
      compositeScore: Number(item.votes ?? 0) * (Number.isFinite(Number(item.impactScore)) ? Number(item.impactScore ?? 3) : 3),
    })),
  );
  const topFeatureRequests = rankedFeatureRequests.slice(0, 20);
  const totalFeatureVotes = featureRequests.reduce((sum, item) => sum + Math.max(0, Number(item.votes ?? 0)), 0);
  const totalScreenFeedback = screenFeedback.length;
  const totalKudos = kudos.length;
  const totalResponses = featureRequests.length + totalScreenFeedback + totalKudos;
  const compositeFeatureScore = rankedFeatureRequests.reduce((sum, item) => sum + item.compositeScore, 0);

  const screenFeedbackBySection: Record<string, number> = {};
  const screenFeedbackByScreen = new Map<string, { appSection: string; screenName: string; count: number }>();
  for (const item of screenFeedback) {
    const appSection = getAppSection(item);
    const screenName = normalizeText(item.screenName);
    const sectionKey = appSection || "unspecified";
    screenFeedbackBySection[sectionKey] = (screenFeedbackBySection[sectionKey] ?? 0) + 1;

    const screenKey = `${sectionKey}::${screenName}`;
    const current = screenFeedbackByScreen.get(screenKey) ?? { appSection: sectionKey, screenName, count: 0 };
    current.count += 1;
    screenFeedbackByScreen.set(screenKey, current);
  }

  return {
    signalSummary: {
      totalFeatureVotes,
      screenFeedbackCount: totalScreenFeedback,
      kudosCount: totalKudos,
      totalResponses,
    },
    compositeFeatureScore,
    totalFeatureVotes,
    totalScreenFeedback,
    totalKudos,
    totalResponses,
    topFeatureRequests,
    rankedFeatureRequests,
    screenFeedbackBySection,
    screenFeedbackByScreen: [...screenFeedbackByScreen.values()].sort((a, b) => {
      const countDelta = b.count - a.count;
      if (countDelta !== 0) return countDelta;
      const appDelta = a.appSection.localeCompare(b.appSection);
      if (appDelta !== 0) return appDelta;
      return a.screenName.localeCompare(b.screenName);
    }),
  };
};

export const partitionKudos = (kudos: readonly KudosQuote[]): SynthesisKudosPartitions => {
  const publicSafe = kudos.filter((item) => item.consentPublic && item.isPublicSafe !== false);
  const privatePool = kudos.filter((item) => !item.consentPublic || item.isPublicSafe === false);
  const privateIds = new Set(privatePool.map((item) => String(item.id)));
  const leaked = publicSafe.some((item) => privateIds.has(String(item.id)));

  if (leaked) {
    throw new SynthesisValidationError("Private kudos leak detected in publicSafe partition.");
  }

  return {
    publicSafe: [...publicSafe],
    privatePool: [...privatePool],
  };
};
