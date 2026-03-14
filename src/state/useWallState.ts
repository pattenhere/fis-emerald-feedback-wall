import { useCallback, useMemo, useState } from "react";
import {
  APP_AREAS,
  CARD_SORT_CONCEPTS,
  FIRST_SCREEN_ID_BY_APP,
  INITIAL_FEATURE_REQUESTS,
  INITIAL_KUDOS,
  SCREEN_COUNT_BY_APP,
  SCREENS_BY_APP,
} from "./seedData";
import type {
  AppArea,
  CardSortConcept,
  CardSortResponse,
  CardSortTier,
  ConflictEntry,
  DrawerTab,
  FeedbackType,
  FeatureRequest,
  KudosQuote,
  KudosRole,
  MacroState,
  ScreenFeedback,
  SessionRole,
  SignalSummary,
  SynthesisMode,
} from "../types/domain";
import { makeId } from "../utils/id";

const DEFAULT_SYNTHESIS_PIN = "2468";
const SYNTHESIS_PIN_LENGTH_RANGE = { min: 4, max: 6 } as const;
const POSITIVE_TYPES = new Set<FeedbackType>(["works-well", "suggestion"]);
const NEGATIVE_TYPES = new Set<FeedbackType>(["pain-point", "confusing"]);

export interface ExportRecord {
  submission_type: "feature" | "screen_feedback" | "kudos" | "card_sort";
  app_section: string;
  screen_name: string;
  feedback_type: string;
  freetext: string;
  role_label: string;
  card_sort_rank: string;
  kudos_consent_flag: string;
  synthesis_p_tier: "P0" | "P1" | "P2";
}

export interface WallState {
  drawerOpen: boolean;
  setDrawerOpen: (next: boolean) => void;
  activeDrawerTab: DrawerTab;
  setActiveDrawerTab: (tab: DrawerTab) => void;
  activeApp: AppArea;
  setActiveApp: (app: AppArea) => void;
  selectedScreenId: string;
  setSelectedScreenId: (screenId: string) => void;
  featureRequests: FeatureRequest[];
  addFeatureRequest: (input: {
    title: string;
    workflowContext?: string;
    app: AppArea;
    screenId: string;
    screenName: string;
    origin?: "kiosk" | "mobile";
  }) => void;
  upvoteFeatureRequest: (featureId: string) => void;
  kudosQuotes: KudosQuote[];
  publicQuotes: KudosQuote[];
  addKudosQuote: (quote: { text: string; role: KudosRole; consentPublic: boolean }) => void;
  screenFeedback: ScreenFeedback[];
  addScreenFeedback: (input: {
    app: AppArea;
    screenId: string;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => string;
  appendFollowUpResponse: (feedbackId: string, question: string, response?: string) => void;
  synthesisMode: SynthesisMode;
  setSynthesisMode: (mode: SynthesisMode) => void;
  synthesisOutput: string;
  setSynthesisOutput: (next: string) => void;
  synthesisUnlocked: boolean;
  unlockSynthesis: (pin: string) => boolean;
  resetSynthesisLock: () => void;
  signalSummary: SignalSummary;
  synthesisCountdownTarget: string;
  synthesisPinLengthRange: { min: number; max: number };
  buildSynthesisPromptBody: (macros?: MacroState) => string;
  clearSynthesisOutput: () => void;
  getNextScreenInActiveApp: () => string | null;
  screenSubmissionCounts: Record<string, number>;
  appHeatmapIntensity: Record<AppArea, number>;
  readinessThreshold: number;
  setReadinessThreshold: (next: number) => void;
  conflicts: ConflictEntry[];
  sessionRole: SessionRole;
  setSessionRole: (next: SessionRole) => void;
  cardSortConcepts: CardSortConcept[];
  cardSortResponses: CardSortResponse[];
  setCardSortTier: (conceptId: string, tier: CardSortTier) => void;
  buildExportRecords: () => ExportRecord[];
  revealNarrative: string;
  setRevealNarrative: (next: string) => void;
}

const nowIso = (): string => new Date().toISOString();
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const pTierByRank = (index: number): "P0" | "P1" | "P2" => {
  if (index < 2) {
    return "P0";
  }
  if (index < 5) {
    return "P1";
  }
  return "P2";
};

export const useWallState = (): WallState => {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>("features");
  const [activeApp, setActiveApp] = useState<AppArea>(APP_AREAS[0].id);
  const [selectedScreenId, setSelectedScreenId] = useState(
    FIRST_SCREEN_ID_BY_APP[APP_AREAS[0].id] ?? "",
  );
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>(INITIAL_FEATURE_REQUESTS);
  const [freshFeatureIds, setFreshFeatureIds] = useState<string[]>([]);
  const [kudosQuotes, setKudosQuotes] = useState<KudosQuote[]>(INITIAL_KUDOS);
  const [screenFeedback, setScreenFeedback] = useState<ScreenFeedback[]>([]);
  const [cardSortResponses, setCardSortResponses] = useState<CardSortResponse[]>([]);
  const [synthesisMode, setSynthesisMode] = useState<SynthesisMode>("roadmap");
  const [synthesisOutput, setSynthesisOutput] = useState("");
  const [synthesisUnlocked, setSynthesisUnlocked] = useState(false);
  const [readinessThreshold, setReadinessThreshold] = useState(30);
  const [sessionRole, setSessionRole] = useState<SessionRole>("unspecified");
  const [revealNarrative, setRevealNarrative] = useState(
    "Yesterday you told us where the workflow broke down. Overnight, we focused on your highest-priority requests and built a working Day 2 prototype.",
  );
  const synthesisPinLengthRange = SYNTHESIS_PIN_LENGTH_RANGE;

  const synthesisCountdownTarget = "2026-03-12T22:00:00-04:00";

  const screenSubmissionCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const item of screenFeedback) {
      counts[item.screenId] = (counts[item.screenId] ?? 0) + 1;
    }
    return counts;
  }, [screenFeedback]);

  const appSubmissionCounts = useMemo<Record<AppArea, number>>(() => {
    const counts = {} as Record<AppArea, number>;
    for (const area of APP_AREAS) {
      counts[area.id] = 0;
    }
    for (const item of screenFeedback) {
      counts[item.app] += 1;
    }
    return counts;
  }, [screenFeedback]);

  const appHeatmapIntensity = useMemo<Record<AppArea, number>>(() => {
    const densities = APP_AREAS.map((area) => {
      const ratio = SCREEN_COUNT_BY_APP[area.id]
        ? appSubmissionCounts[area.id] / SCREEN_COUNT_BY_APP[area.id]
        : 0;
      return { app: area.id, ratio };
    });

    const maxRatio = Math.max(...densities.map((entry) => entry.ratio), 0);
    const result = {} as Record<AppArea, number>;

    for (const entry of densities) {
      const normalized = maxRatio > 0 ? entry.ratio / maxRatio : 0;
      result[entry.app] = clamp(normalized * 0.8, 0, 0.8);
    }

    return result;
  }, [appSubmissionCounts]);

  const conflicts = useMemo<ConflictEntry[]>(() => {
    const grouped = new Map<string, { app: AppArea; screenId: string; screenName: string; positive: number; negative: number }>();

    for (const item of screenFeedback) {
      const key = `${item.app}::${item.screenId}`;
      const current = grouped.get(key) ?? {
        app: item.app,
        screenId: item.screenId,
        screenName: item.screenName,
        positive: 0,
        negative: 0,
      };

      if (POSITIVE_TYPES.has(item.type)) {
        current.positive += 1;
      }
      if (NEGATIVE_TYPES.has(item.type)) {
        current.negative += 1;
      }

      grouped.set(key, current);
    }

    return [...grouped.values()]
      .filter((entry) => entry.positive > 0 && entry.negative > 0)
      .map((entry) => ({
        app: entry.app,
        screenId: entry.screenId,
        screenName: entry.screenName,
        positiveCount: entry.positive,
        negativeCount: entry.negative,
      }))
      .sort((a, b) => b.negativeCount + b.positiveCount - (a.negativeCount + a.positiveCount));
  }, [screenFeedback]);

  const signalSummary = useMemo<SignalSummary>(() => {
    const totalFeatureVotes = featureRequests.reduce((sum, item) => sum + item.votes, 0);
    const screenFeedbackCount = screenFeedback.length;
    const kudosCount = kudosQuotes.length;

    return {
      totalFeatureVotes,
      screenFeedbackCount,
      kudosCount,
      totalResponses: featureRequests.length + screenFeedbackCount + kudosCount,
    };
  }, [featureRequests, screenFeedback, kudosQuotes]);

  const setActiveAppAndResetSelectedScreen = useCallback((app: AppArea): void => {
    setActiveApp(app);
    const firstScreenId = FIRST_SCREEN_ID_BY_APP[app];
    if (firstScreenId) {
      setSelectedScreenId(firstScreenId);
    }
  }, []);

  const addFeatureRequest = useCallback((input: {
    title: string;
    workflowContext?: string;
    app: AppArea;
    screenId: string;
    screenName: string;
    origin?: "kiosk" | "mobile";
  }): void => {
    const trimmedTitle = input.title.trim();
    const trimmedContext = input.workflowContext?.trim();
    if (!trimmedTitle) {
      return;
    }

    const next: FeatureRequest = {
      id: makeId(),
      app: input.app,
      screenId: input.screenId,
      screenName: input.screenName,
      title: trimmedTitle,
      workflowContext: trimmedContext || undefined,
      votes: 1,
      createdAt: nowIso(),
      origin: input.origin ?? "kiosk",
    };

    setFeatureRequests((current) => [next, ...current]);
    setFreshFeatureIds((current) => [next.id, ...current]);
  }, []);

  const upvoteFeatureRequest = useCallback((featureId: string): void => {
    setFeatureRequests((current) =>
      current.map((item) => (item.id === featureId ? { ...item, votes: item.votes + 1 } : item)),
    );
    setFreshFeatureIds((current) => current.filter((id) => id !== featureId));
  }, []);

  const addKudosQuote = useCallback((quote: {
    text: string;
    role: KudosRole;
    consentPublic: boolean;
  }): void => {
    const trimmed = quote.text.trim();
    if (!trimmed) {
      return;
    }

    setKudosQuotes((current) => [
      {
        id: makeId(),
        text: trimmed,
        role: quote.role,
        consentPublic: quote.consentPublic,
        createdAt: nowIso(),
      },
      ...current,
    ]);
  }, []);

  const addScreenFeedback = useCallback((input: {
    app: AppArea;
    screenId: string;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }): string => {
    const id = makeId();
    const next: ScreenFeedback = {
      id,
      app: input.app,
      screenId: input.screenId,
      screenName: input.screenName,
      type: input.type,
      text: input.text?.trim() || undefined,
      createdAt: nowIso(),
    };

    setScreenFeedback((current) => [next, ...current]);
    return id;
  }, []);

  const appendFollowUpResponse = useCallback((feedbackId: string, question: string, response?: string): void => {
    setScreenFeedback((current) =>
      current.map((item) =>
        item.id === feedbackId
          ? {
              ...item,
              followUpQuestion: question,
              followUpResponse: response?.trim() || undefined,
            }
          : item,
      ),
    );
  }, []);

  const unlockSynthesis = useCallback((pin: string): boolean => {
    const digitsOnly = /^\d+$/.test(pin);
    const validLength =
      pin.length >= SYNTHESIS_PIN_LENGTH_RANGE.min && pin.length <= SYNTHESIS_PIN_LENGTH_RANGE.max;
    if (digitsOnly && validLength && pin === DEFAULT_SYNTHESIS_PIN) {
      setSynthesisUnlocked(true);
      return true;
    }

    return false;
  }, []);

  const resetSynthesisLock = useCallback((): void => {
    setSynthesisUnlocked(false);
  }, []);

  const buildSynthesisPromptBody = useCallback((macros?: MacroState): string => {
    const roleLabel = sessionRole === "unspecified" ? "unspecified" : sessionRole;

    const lowSignalThreshold = macros?.excludeLowSignalBelow;
    const filteredFeedback =
      typeof lowSignalThreshold === "number"
        ? screenFeedback.filter(
            (item) => (screenSubmissionCounts[item.screenId] ?? 0) >= lowSignalThreshold,
          )
        : screenFeedback;

    const featureLines = featureRequests
      .map((feature, index) => {
        const macroWeight = macros?.upweightApp === feature.app ? " | weight=2x" : "";
        const origin = feature.origin ?? "kiosk";
        return `${index + 1}. ${feature.title} | votes=${feature.votes} | workflow=${feature.workflowContext ?? "n/a"} | role=${roleLabel} | origin=${origin}${macroWeight}`;
      })
      .join("\n");

    const screenFeedbackLines = filteredFeedback
      .map((item, index) => {
        const followUp = item.followUpResponse
          ? ` | followup_q=${item.followUpQuestion ?? "n/a"} | followup_a=${item.followUpResponse}`
          : "";
        return `${index + 1}. app=${item.app} | screen=${item.screenName} | type=${item.type} | text=${item.text ?? "n/a"} | role=${roleLabel}${followUp}`;
      })
      .join("\n");

    const kudosLines = kudosQuotes
      .map(
        (quote, index) =>
          `${index + 1}. role=${quote.role} | consentPublic=${quote.consentPublic ? "yes" : "no"} | text=${quote.text}`,
      )
      .join("\n");

    const cardSortTotals = CARD_SORT_CONCEPTS.map((concept) => {
      const votes = cardSortResponses.filter((response) => response.conceptId === concept.id);
      const total = Math.max(votes.length, 1);
      const high = votes.filter((vote) => vote.tier === "high").length;
      const med = votes.filter((vote) => vote.tier === "medium").length;
      const low = votes.filter((vote) => vote.tier === "low").length;
      return `${concept.title} | high=${Math.round((high / total) * 100)}% | medium=${Math.round((med / total) * 100)}% | low=${Math.round((low / total) * 100)}%`;
    }).join("\n");

    const conflictLines = conflicts.length
      ? conflicts
          .map(
            (entry, index) =>
              `${index + 1}. app=${entry.app} | screen=${entry.screenName} | positive=${entry.positiveCount} | negative=${entry.negativeCount}`,
          )
          .join("\n")
      : "No competing perspectives detected.";

    const activeMacroLines: string[] = [];
    if (macros?.upweightApp) {
      activeMacroLines.push(`Upweight ${macros.upweightApp} section 2x.`);
    }
    if (macros?.p0Only) {
      activeMacroLines.push("Constrain output to P0 items only. Suppress P1/P2 sections.");
    }
    if (typeof macros?.excludeLowSignalBelow === "number") {
      activeMacroLines.push(`Exclude screens with fewer than ${macros.excludeLowSignalBelow} submissions.`);
    }
    if (macros?.emphasizeMarketingQuotes) {
      activeMacroLines.push("Emphasize consent-approved marketing-safe quotes in output.");
    }

    return [
      "Feature Requests",
      featureLines || "No feature requests yet.",
      "",
      "Screen Feedback",
      screenFeedbackLines || "No screen feedback yet.",
      "",
      "Kudos",
      kudosLines || "No kudos yet.",
      "",
      "Card Sort Rankings",
      cardSortTotals || "No card-sort submissions yet.",
      "",
      "Conflict Log",
      conflictLines,
      "",
      "Prompt Modifiers",
      activeMacroLines.length ? activeMacroLines.map((line, index) => `${index + 1}. ${line}`).join("\n") : "No macros active.",
    ].join("\n");
  }, [cardSortResponses, conflicts, featureRequests, kudosQuotes, screenFeedback, screenSubmissionCounts, sessionRole]);

  const clearSynthesisOutput = useCallback((): void => {
    setSynthesisOutput("");
  }, []);

  const getNextScreenInActiveApp = useCallback((): string | null => {
    const appScreens = SCREENS_BY_APP[activeApp];
    if (appScreens.length < 2) {
      return null;
    }

    const currentIndex = appScreens.findIndex((screen) => screen.id === selectedScreenId);
    if (currentIndex === -1) {
      return appScreens[0].id;
    }

    const nextIndex = (currentIndex + 1) % appScreens.length;
    return appScreens[nextIndex].id;
  }, [activeApp, selectedScreenId]);

  const setCardSortTier = useCallback((conceptId: string, tier: CardSortTier): void => {
    setCardSortResponses((current) => {
      const existing = current.find((item) => item.conceptId === conceptId);
      if (existing) {
        return current.map((item) =>
          item.conceptId === conceptId ? { ...item, tier, updatedAt: nowIso() } : item,
        );
      }
      return [...current, { conceptId, tier, updatedAt: nowIso() }];
    });
  }, []);

  const sortedFeatureRequests = useMemo(() => {
    const freshIds = new Set(freshFeatureIds);
    return [...featureRequests].sort((a, b) => {
      const aFresh = freshIds.has(a.id);
      const bFresh = freshIds.has(b.id);
      if (aFresh !== bFresh) {
        return aFresh ? -1 : 1;
      }
      if (b.votes !== a.votes) {
        return b.votes - a.votes;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [featureRequests, freshFeatureIds]);

  const publicQuotes = useMemo(
    () => kudosQuotes.filter((quote) => quote.consentPublic),
    [kudosQuotes],
  );

  const buildExportRecords = useCallback((): ExportRecord[] => {
    const roleLabel = sessionRole;
    const featureTier = new Map(sortedFeatureRequests.map((item, index) => [item.id, pTierByRank(index)]));

    const featureRows: ExportRecord[] = sortedFeatureRequests.map((feature) => ({
      submission_type: "feature",
      app_section: feature.app,
      screen_name: feature.screenName,
      feedback_type: "request",
      freetext: feature.workflowContext ? `${feature.title} | ${feature.workflowContext}` : feature.title,
      role_label: roleLabel,
      card_sort_rank: "",
      kudos_consent_flag: "",
      synthesis_p_tier: featureTier.get(feature.id) ?? "P2",
    }));

    const screenRows: ExportRecord[] = screenFeedback.map((item) => ({
      submission_type: "screen_feedback",
      app_section: item.app,
      screen_name: item.screenName,
      feedback_type: item.type,
      freetext: [item.text, item.followUpResponse].filter(Boolean).join(" | "),
      role_label: roleLabel,
      card_sort_rank: "",
      kudos_consent_flag: "",
      synthesis_p_tier: "P1",
    }));

    const kudosRows: ExportRecord[] = kudosQuotes.map((quote) => ({
      submission_type: "kudos",
      app_section: "",
      screen_name: "",
      feedback_type: "quote",
      freetext: quote.text,
      role_label: quote.role,
      card_sort_rank: "",
      kudos_consent_flag: quote.consentPublic ? "yes" : "no",
      synthesis_p_tier: "P2",
    }));

    const cardSortRows: ExportRecord[] = cardSortResponses.map((response) => {
      const concept = CARD_SORT_CONCEPTS.find((item) => item.id === response.conceptId);
      return {
        submission_type: "card_sort",
        app_section: "ai-concepts",
        screen_name: concept?.title ?? response.conceptId,
        feedback_type: "tier",
        freetext: concept?.description ?? "",
        role_label: roleLabel,
        card_sort_rank: response.tier,
        kudos_consent_flag: "",
        synthesis_p_tier: "P1",
      };
    });

    return [...featureRows, ...screenRows, ...kudosRows, ...cardSortRows];
  }, [cardSortResponses, kudosQuotes, screenFeedback, sessionRole, sortedFeatureRequests]);

  return {
    drawerOpen,
    setDrawerOpen,
    activeDrawerTab,
    setActiveDrawerTab,
    activeApp,
    setActiveApp: setActiveAppAndResetSelectedScreen,
    selectedScreenId,
    setSelectedScreenId,
    featureRequests: sortedFeatureRequests,
    addFeatureRequest,
    upvoteFeatureRequest,
    kudosQuotes,
    publicQuotes,
    addKudosQuote,
    screenFeedback,
    addScreenFeedback,
    appendFollowUpResponse,
    synthesisMode,
    setSynthesisMode,
    synthesisOutput,
    setSynthesisOutput,
    synthesisUnlocked,
    unlockSynthesis,
    resetSynthesisLock,
    signalSummary,
    synthesisCountdownTarget,
    synthesisPinLengthRange,
    buildSynthesisPromptBody,
    clearSynthesisOutput,
    getNextScreenInActiveApp,
    screenSubmissionCounts,
    appHeatmapIntensity,
    readinessThreshold,
    setReadinessThreshold,
    conflicts,
    sessionRole,
    setSessionRole,
    cardSortConcepts: CARD_SORT_CONCEPTS,
    cardSortResponses,
    setCardSortTier,
    buildExportRecords,
    revealNarrative,
    setRevealNarrative,
  };
};
