import { useCallback, useEffect, useMemo, useState } from "react";
import { type SeedTableDefinition } from "./adminSeedData";
import {
  APP_AREAS,
  CARD_SORT_CONCEPTS,
  SCREEN_COUNT_BY_APP,
} from "./seedData";
import { ADMIN_SEED_TABLES } from "./adminSeedData";
import { buildDbSeedPayload } from "./dbSeedPayload";
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
  ProductDefinition,
  AppScreen,
} from "../types/domain";
import { dataApi } from "../services/dataApi";
import { useDbDataSource } from "../config/runtimeConfig";

const DEFAULT_SYNTHESIS_PIN = "2468";
const SYNTHESIS_PIN_LENGTH_RANGE = { min: 4, max: 6 } as const;
const DEFAULT_SYNTHESIS_COUNTDOWN_SECONDS = 1800;
const ENV_SYNTHESIS_COUNTDOWN_SECONDS = Number(import.meta.env.VITE_SYNTHESIS_COUNTDOWN_SECONDS ?? DEFAULT_SYNTHESIS_COUNTDOWN_SECONDS);
const SYNTHESIS_COUNTDOWN_SECONDS = Number.isFinite(ENV_SYNTHESIS_COUNTDOWN_SECONDS) && ENV_SYNTHESIS_COUNTDOWN_SECONDS > 0
  ? ENV_SYNTHESIS_COUNTDOWN_SECONDS
  : DEFAULT_SYNTHESIS_COUNTDOWN_SECONDS;
const POSITIVE_TYPES = new Set<FeedbackType>(["works-well", "suggestion"]);
const NEGATIVE_TYPES = new Set<FeedbackType>(["issue", "missing"]);
const SEEDED_KUDOS_MIN = 784;
const APP_AREA_LABEL_BY_ID: Record<AppArea, string> = Object.fromEntries(
  APP_AREAS.map((area) => [area.id, area.label]),
) as Record<AppArea, string>;

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
  selectedScreenId: number;
  setSelectedScreenId: (screenId: number) => void;
  featureRequests: FeatureRequest[];
  addFeatureRequest: (input: {
    title: string;
    workflowContext?: string;
    app: AppArea;
    productId: number;
    featureId?: number;
    screenId?: number;
    screenName: string;
    origin?: "kiosk" | "mobile";
  }) => void;
  upvoteFeatureRequest: (featureId: number) => void;
  kudosQuotes: KudosQuote[];
  publicQuotes: KudosQuote[];
  addKudosQuote: (quote: {
    text: string;
    role: KudosRole;
    consentPublic: boolean;
    productId: number;
    featureId?: number;
    app?: AppArea;
    screenId?: number;
    screenName?: string;
  }) => void;
  screenFeedback: ScreenFeedback[];
  addScreenFeedback: (input: {
    app: AppArea;
    productId: number;
    featureId?: number;
    screenId?: number;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => number;
  appendFollowUpResponse: (feedbackId: number, question: string, response?: string) => void;
  synthesisMode: SynthesisMode;
  setSynthesisMode: (mode: SynthesisMode) => void;
  synthesisOutput: string;
  setSynthesisOutput: (next: string) => void;
  synthesisUnlocked: boolean;
  unlockSynthesis: (pin: string) => boolean;
  resetSynthesisLock: () => void;
  signalSummary: SignalSummary;
  synthesisCountdownTarget: string;
  synthesisCountdownRunning: boolean;
  synthesisCountdownHasStarted: boolean;
  synthesisCountdownInitialSeconds: number;
  startSynthesisCountdown: (durationSeconds?: number) => void;
  stopSynthesisCountdown: () => void;
  synthesisPinLengthRange: { min: number; max: number };
  buildSynthesisPromptBody: (macros?: MacroState) => string;
  clearSynthesisOutput: () => void;
  getNextScreenInActiveApp: () => number | null;
  screenSubmissionCounts: Record<number, number>;
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
  adminTables: SeedTableDefinition[];
  reseeding: boolean;
  reseedData: () => Promise<void>;
  refreshAdminTables: () => Promise<void>;
  products: ProductDefinition[];
  screens: AppScreen[];
  adminDataSource: "db" | "flat";
  adminDbEngine: "sqlite" | "postgres" | null;
  isDataLoaded: boolean;
}

const nowIso = (): string => new Date().toISOString();
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const stripLegacyDuplicateSuffix = (value: string | undefined): string =>
  (value ?? "").replace(/\s*\[\d+\]\s*$/u, "").trim();
const normalizeTextKey = (value: string | undefined): string =>
  stripLegacyDuplicateSuffix(value).toLowerCase();

const dedupeByText = <T,>(items: T[], getText: (item: T) => string | undefined): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = normalizeTextKey(getText(item));
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
};

const dedupeSnapshot = (snapshot: WallSeedSnapshot): WallSeedSnapshot => ({
  ...snapshot,
  featureRequests: dedupeByText(
    snapshot.featureRequests.map((item) => ({ ...item, title: stripLegacyDuplicateSuffix(item.title) })),
    (item) => item.title,
  ),
  kudosQuotes: dedupeByText(
    snapshot.kudosQuotes.map((item) => ({ ...item, text: stripLegacyDuplicateSuffix(item.text) })),
    (item) => item.text,
  ),
  screenFeedback: dedupeByText(
    snapshot.screenFeedback.map((item) => ({ ...item, text: stripLegacyDuplicateSuffix(item.text) })),
    (item) => item.text ?? `__id:${item.id}`,
  ),
});

const pTierByRank = (index: number): "P0" | "P1" | "P2" => {
  if (index < 2) {
    return "P0";
  }
  if (index < 5) {
    return "P1";
  }
  return "P2";
};

interface WallSeedSnapshot {
  featureRequests: FeatureRequest[];
  kudosQuotes: KudosQuote[];
  screenFeedback: ScreenFeedback[];
  products: ProductDefinition[];
  screens: AppScreen[];
  cardSortConcepts: CardSortConcept[];
  adminTables: SeedTableDefinition[];
  selectedScreenId: number;
}

const toNumericId = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const toAppAreaValue = (value: unknown): AppArea => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "digital-experience" ||
    normalized === "origination" ||
    normalized === "credit-risk" ||
    normalized === "servicing" ||
    normalized === "monitoring-controls" ||
    normalized === "syndication-complex-lending" ||
    normalized === "analytics-inquiry" ||
    normalized === "platform-services"
  ) {
    return normalized;
  }
  if (normalized === "digital experience") return "digital-experience";
  if (normalized === "credit & risk" || normalized === "customer risk & credit") return "credit-risk";
  if (normalized === "monitoring & controls") return "monitoring-controls";
  if (normalized === "syndication / complex lending" || normalized === "syndication") return "syndication-complex-lending";
  if (normalized === "analytics & inquiry") return "analytics-inquiry";
  if (normalized === "platform services") return "platform-services";
  return "servicing";
};

const mapBootstrapToSnapshot = (bootstrap: Awaited<ReturnType<typeof dataApi.getBootstrap>>): WallSeedSnapshot => ({
  featureRequests: bootstrap.featureRequests.map((item) => ({
    ...item,
    id: toNumericId(item.id) ?? item.id,
    productId: toNumericId(item.productId),
    featureId: toNumericId(item.featureId),
    screenId: toNumericId(item.screenId) ?? item.screenId,
    app: toAppAreaValue(item.app),
    votes: Number(item.votes ?? 0),
  })),
  kudosQuotes: bootstrap.kudosQuotes.map((item) => ({
    ...item,
    id: toNumericId(item.id) ?? item.id,
    productId: toNumericId(item.productId),
    featureId: toNumericId(item.featureId),
    screenId: toNumericId(item.screenId) ?? item.screenId,
    app: item.app ? toAppAreaValue(item.app) : undefined,
  })),
  screenFeedback: bootstrap.screenFeedback.map((item) => ({
    ...item,
    id: toNumericId(item.id) ?? item.id,
    productId: toNumericId(item.productId),
    featureId: toNumericId(item.featureId),
    screenId: toNumericId(item.screenId) ?? item.screenId,
    app: toAppAreaValue(item.app),
  })),
  products: bootstrap.products.map((item) => ({
    id: toNumericId(item.id) ?? item.id,
    legacyProductCode: item.legacyProductCode,
    category: item.category,
    subcategory: item.subcategory,
    name: item.name,
    app: "servicing",
    icon: "◉",
  })),
  screens: bootstrap.screens.map((screen) => ({
    id: toNumericId(screen.id) ?? screen.id,
    productId: toNumericId(screen.productId),
    legacyScreenCode: screen.legacyScreenCode,
    app: toAppAreaValue(screen.screenCategory),
    name: screen.name,
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: screen.description ?? "",
    categoryId: toAppAreaValue(screen.screenCategory),
    categoryLabel: APP_AREA_LABEL_BY_ID[toAppAreaValue(screen.screenCategory)] ?? "Servicing",
  })),
  cardSortConcepts: bootstrap.cardSortConcepts,
  adminTables: bootstrap.adminTables.length > 0 ? bootstrap.adminTables : ADMIN_SEED_TABLES,
  selectedScreenId: Number(bootstrap.screens[0]?.id ?? 0),
});

export const useWallState = (): WallState => {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>("features");
  const [activeApp, setActiveApp] = useState<AppArea>(APP_AREAS[0].id);
  const [selectedScreenId, setSelectedScreenId] = useState(0);
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>([]);
  const [freshFeatureIds, setFreshFeatureIds] = useState<number[]>([]);
  const [kudosQuotes, setKudosQuotes] = useState<KudosQuote[]>([]);
  const [screenFeedback, setScreenFeedback] = useState<ScreenFeedback[]>([]);
  const [products, setProducts] = useState<ProductDefinition[]>([]);
  const [screens, setScreens] = useState<AppScreen[]>([]);
  const [cardSortConcepts, setCardSortConcepts] = useState<CardSortConcept[]>(CARD_SORT_CONCEPTS);
  const [adminTables, setAdminTables] = useState<SeedTableDefinition[]>([]);
  const [adminDataSource, setAdminDataSource] = useState<"db" | "flat">(useDbDataSource ? "db" : "flat");
  const [adminDbEngine, setAdminDbEngine] = useState<"sqlite" | "postgres" | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [reseeding, setReseeding] = useState(false);
  const [cardSortResponses, setCardSortResponses] = useState<CardSortResponse[]>([]);
  const [synthesisMode, setSynthesisMode] = useState<SynthesisMode>("roadmap");
  const [synthesisOutput, setSynthesisOutput] = useState("");
  const [synthesisUnlocked, setSynthesisUnlocked] = useState(false);
  const [readinessThreshold, setReadinessThreshold] = useState(30);
  const [sessionRole, setSessionRole] = useState<SessionRole>("unspecified");
  const [revealNarrative, setRevealNarrative] = useState(
    "Yesterday you told us where the workflow broke down. Overnight, we focused on your highest-priority requests and built a working Day 2 prototype.",
  );
  const [synthesisCountdownTarget, setSynthesisCountdownTarget] = useState(
    () => new Date(Date.now() + SYNTHESIS_COUNTDOWN_SECONDS * 1_000).toISOString(),
  );
  const [synthesisCountdownRunning, setSynthesisCountdownRunning] = useState(false);
  const [synthesisCountdownHasStarted, setSynthesisCountdownHasStarted] = useState(false);
  const synthesisPinLengthRange = SYNTHESIS_PIN_LENGTH_RANGE;
  const startSynthesisCountdown = useCallback((durationSeconds: number = SYNTHESIS_COUNTDOWN_SECONDS): void => {
    const safeSeconds = Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : SYNTHESIS_COUNTDOWN_SECONDS;
    const nextTarget = new Date(Date.now() + safeSeconds * 1_000).toISOString();
    setSynthesisCountdownTarget(nextTarget);
    setSynthesisCountdownHasStarted(true);
    setSynthesisCountdownRunning(true);
  }, []);
  const stopSynthesisCountdown = useCallback((): void => {
    setSynthesisCountdownRunning(false);
  }, []);

  const applySnapshot = useCallback((snapshot: WallSeedSnapshot): void => {
    const deduped = dedupeSnapshot(snapshot);
    setFeatureRequests(deduped.featureRequests);
    setFreshFeatureIds([]);
    setKudosQuotes(deduped.kudosQuotes);
    setScreenFeedback(deduped.screenFeedback);
    setProducts(deduped.products);
    setScreens(deduped.screens);
    setCardSortConcepts(deduped.cardSortConcepts.length > 0 ? deduped.cardSortConcepts : CARD_SORT_CONCEPTS);
    setAdminTables(deduped.adminTables);
    if (deduped.selectedScreenId > 0) {
      setSelectedScreenId(deduped.selectedScreenId);
    }
    setIsDataLoaded(true);
  }, []);

  const refreshAdminTables = useCallback(async (): Promise<void> => {
    try {
      const tables = await dataApi.getAdminTables();
      setAdminTables(tables);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[wall-state] failed to load admin tables", error);
      setAdminTables([]);
    }
  }, []);

  const refreshHealth = useCallback(async (): Promise<{ dataSourceMode: "db" | "flat"; dbEngine: "sqlite" | "postgres" | null } | null> => {
    try {
      const health = await dataApi.getHealth();
      const dataSourceMode = health.dataSourceMode === "db" ? "db" : "flat";
      const dbEngine = health.dbEngine === "postgres" ? "postgres" : health.dbEngine === "sqlite" ? "sqlite" : null;
      setAdminDataSource(dataSourceMode);
      setAdminDbEngine(dbEngine);
      return { dataSourceMode, dbEngine };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[wall-state] failed to load health", error);
      return null;
    }
  }, []);

  const reloadFromStore = useCallback(async (): Promise<void> => {
    try {
      await refreshHealth();
      const bootstrap = await dataApi.getBootstrap();
      applySnapshot(mapBootstrapToSnapshot(bootstrap));
      if (bootstrap.adminTables.length === 0) {
        await refreshAdminTables();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[wall-state] reloadFromStore failed", error);
      setAdminTables([]);
    }
  }, [applySnapshot, refreshAdminTables, refreshHealth]);

  useEffect(() => {
    let cancelled = false;

    const init = async (): Promise<void> => {
      setIsDataLoaded(false);
      try {
        const health = await refreshHealth();
        const bootstrap = await dataApi.getBootstrap();
        const backendUsesDb = (health?.dataSourceMode ?? (useDbDataSource ? "db" : "flat")) === "db";
        if (backendUsesDb) {
          const tableRowCount = Object.fromEntries(
            bootstrap.adminTables.map((table) => [table.id, table.rows.length]),
          );
          const hasCanonicalSeed =
            (tableRowCount.categories ?? 0) > 0 &&
            (tableRowCount.subcategories ?? 0) > 0 &&
            (tableRowCount.products ?? 0) > 0 &&
            (tableRowCount.features ?? 0) > 0 &&
            (tableRowCount.screens ?? 0) > 0;
          const hasKudosSeedVolume = (tableRowCount.kudos ?? 0) >= SEEDED_KUDOS_MIN;

          if (!hasCanonicalSeed || !hasKudosSeedVolume) {
            await dataApi.reseed(buildDbSeedPayload());
            if (!cancelled) {
              await reloadFromStore();
            }
            return;
          }
        }
        if (!cancelled) {
          applySnapshot(mapBootstrapToSnapshot(bootstrap));
          if (bootstrap.adminTables.length === 0) {
            await refreshAdminTables();
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[wall-state] init failed", error);
        setAdminTables([]);
        setIsDataLoaded(false);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [refreshAdminTables, refreshHealth, reloadFromStore]);

  const screenSubmissionCounts = useMemo<Record<number, number>>(() => {
    const counts: Record<number, number> = {};
    for (const item of screenFeedback) {
      if (item.screenId == null) continue;
      const key = Number(item.screenId);
      counts[key] = (counts[key] ?? 0) + 1;
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
    const grouped = new Map<string, { app: AppArea; screenId: number | string; screenName: string; positive: number; negative: number }>();

    for (const item of screenFeedback) {
      const key = `${item.app}::${item.screenId}`;
      const current = grouped.get(key) ?? {
        app: item.app,
        screenId: item.screenId ?? 0,
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
    const firstScreenId = screens.find((screen) => screen.app === app)?.id;
    if (firstScreenId) {
      setSelectedScreenId(Number(firstScreenId));
    }
  }, [screens]);

  const addFeatureRequest = useCallback((input: {
    title: string;
    workflowContext?: string;
    app: AppArea;
    productId: number;
    featureId?: number;
    screenId?: number;
    screenName: string;
    origin?: "kiosk" | "mobile";
  }): void => {
    const trimmedTitle = input.title.trim();
    const trimmedContext = input.workflowContext?.trim();
    if (!trimmedTitle) {
      return;
    }
    if (featureRequests.some((item) => normalizeTextKey(item.title) === normalizeTextKey(trimmedTitle))) {
      return;
    }

    const next: FeatureRequest = {
      id: -Date.now(),
      productId: input.productId,
      featureId: input.featureId,
      screenId: input.screenId,
      app: input.app,
      screenName: input.screenName,
      title: trimmedTitle,
      description: trimmedTitle,
      workflowContext: trimmedContext || undefined,
      votes: 1,
      createdAt: nowIso(),
      status: "open",
      origin: input.origin ?? "kiosk",
    };

    setFeatureRequests((current) => [next, ...current]);
    setFreshFeatureIds((current) => [Number(next.id), ...current]);
    void dataApi.addFeatureRequest(next);
  }, [featureRequests]);

  const upvoteFeatureRequest = useCallback((featureId: number): void => {
    setFeatureRequests((current) =>
      current.map((item) => (Number(item.id) === featureId ? { ...item, votes: item.votes + 1 } : item)),
    );
    setFreshFeatureIds((current) => current.filter((id) => id !== featureId));
    void dataApi.upvoteFeatureRequest(featureId)
      .then(({ votes }) => {
        setFeatureRequests((current) =>
          current.map((item) => (Number(item.id) === featureId ? { ...item, votes: Math.max(0, votes) } : item)),
        );
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("[wall-state] failed to persist feature request upvote", error);
        setFeatureRequests((current) =>
          current.map((item) =>
            Number(item.id) === featureId ? { ...item, votes: Math.max(0, item.votes - 1) } : item,
          ),
        );
      });
  }, []);

  const addKudosQuote = useCallback((quote: {
    text: string;
    role: KudosRole;
    consentPublic: boolean;
    productId: number;
    featureId?: number;
    app?: AppArea;
    screenId?: number;
    screenName?: string;
  }): void => {
    const trimmed = quote.text.trim();
    if (!trimmed) {
      return;
    }
    if (kudosQuotes.some((item) => normalizeTextKey(item.text) === normalizeTextKey(trimmed))) {
      return;
    }

    const next: KudosQuote = {
      id: -Date.now(),
      productId: quote.productId,
      featureId: quote.featureId,
      screenId: quote.screenId,
      text: trimmed,
      role: quote.role,
      consentPublic: quote.consentPublic,
      app: quote.app,
      screenName: quote.screenName,
      createdAt: nowIso(),
    };

    setKudosQuotes((current) => [next, ...current]);
    void dataApi.addKudos(next);
  }, [kudosQuotes]);

  const addScreenFeedback = useCallback((input: {
    app: AppArea;
    productId: number;
    featureId?: number;
    screenId?: number;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }): number => {
    const id = -Date.now();
    const trimmedText = input.text?.trim();
    if (screenFeedback.some((item) => normalizeTextKey(item.text) === normalizeTextKey(trimmedText))) {
      return id;
    }
    const next: ScreenFeedback = {
      id,
      productId: input.productId,
      featureId: input.featureId,
      screenId: input.screenId,
      app: input.app,
      screenName: input.screenName,
      type: input.type,
      text: trimmedText || undefined,
      createdAt: nowIso(),
    };

    setScreenFeedback((current) => [next, ...current]);
    void dataApi.addScreenFeedback(next);
    return id;
  }, [screenFeedback]);

  const appendFollowUpResponse = useCallback((feedbackId: number, question: string, response?: string): void => {
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
            (item) => item.screenId != null && (screenSubmissionCounts[Number(item.screenId)] ?? 0) >= lowSignalThreshold,
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

    const cardSortTotals = cardSortConcepts.map((concept) => {
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
  }, [cardSortConcepts, cardSortResponses, conflicts, featureRequests, kudosQuotes, screenFeedback, screenSubmissionCounts, sessionRole]);

  const clearSynthesisOutput = useCallback((): void => {
    setSynthesisOutput("");
  }, []);

  const reseedData = useCallback(async (): Promise<void> => {
    setReseeding(true);
    try {
      await dataApi.reseed(buildDbSeedPayload());
      await reloadFromStore();
    } finally {
      setReseeding(false);
    }
  }, [reloadFromStore]);

  const getNextScreenInActiveApp = useCallback((): number | null => {
    const appScreens = screens.filter((screen) => screen.app === activeApp);
    if (appScreens.length < 2) {
      return null;
    }

    const currentIndex = appScreens.findIndex((screen) => Number(screen.id) === selectedScreenId);
    if (currentIndex === -1) {
      return Number(appScreens[0].id);
    }

    const nextIndex = (currentIndex + 1) % appScreens.length;
    return Number(appScreens[nextIndex].id);
  }, [activeApp, screens, selectedScreenId]);

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
    const conceptTitle = cardSortConcepts.find((item) => item.id === conceptId)?.title;
    if (conceptTitle) {
      void dataApi.setCardSortTier({ conceptTitle, tier, role: sessionRole });
    }
  }, [cardSortConcepts, sessionRole]);

  const sortedFeatureRequests = useMemo(() => {
    const freshIds = new Set(freshFeatureIds);
    return [...featureRequests].sort((a, b) => {
      const aFresh = freshIds.has(Number(a.id));
      const bFresh = freshIds.has(Number(b.id));
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
      const concept = cardSortConcepts.find((item) => item.id === response.conceptId);
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
  }, [cardSortConcepts, cardSortResponses, kudosQuotes, screenFeedback, sessionRole, sortedFeatureRequests]);

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
    synthesisCountdownRunning,
    synthesisCountdownHasStarted,
    synthesisCountdownInitialSeconds: SYNTHESIS_COUNTDOWN_SECONDS,
    startSynthesisCountdown,
    stopSynthesisCountdown,
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
    cardSortConcepts,
    cardSortResponses,
    setCardSortTier,
    buildExportRecords,
    revealNarrative,
    setRevealNarrative,
    adminTables,
    reseeding,
    reseedData,
    refreshAdminTables,
    products,
    screens,
    adminDataSource,
    adminDbEngine,
    isDataLoaded,
  };
};
