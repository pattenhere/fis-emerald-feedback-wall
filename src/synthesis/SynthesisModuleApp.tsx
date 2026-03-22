import { useCallback, useEffect, useMemo, useState } from "react";
import { synthesisModuleApi } from "../services/synthesisModuleApi";
import { clearSynthesisAuthSession, readSynthesisAuthFlag, writeSynthesisAuthFlag } from "../services/synthesisAuth";
import { formatCountdown } from "../utils/time";
import { SynthesisOverviewPage } from "./SynthesisOverviewPage";
import { SynthesisModerationPage } from "./SynthesisModerationPage";
import { SynthesisSessionConfigPage } from "./SynthesisSessionConfigPage";
import { SynthesisParametersPage } from "./SynthesisParametersPage";
import { SynthesisCompetingViewsPage } from "./SynthesisCompetingViewsPage";
import { SynthesisTShirtSizingPage } from "./SynthesisTShirtSizingPage";
import { SynthesisCeremonyPage } from "./SynthesisCeremonyPage";
import { SynthesisDay2RevealPage } from "./SynthesisDay2RevealPage";
import { SynthesisTablesPage } from "./SynthesisTablesPage";
import { readCompetingPerspectivesCache } from "./competingViewsCache";
import { readThemeSnapshots } from "../themeSnapshots/store";
import { readAdminBootstrapCache } from "./adminBootstrapCache";
import { ensureDay2RevealState, readDay2RevealState, writeDay2RevealState } from "./day2RevealStore";
import { SynthesisPanel } from "../modules/synthesis/SynthesisPanel";
import { APP_AREAS } from "../state/seedData";
import { useWallState } from "../state/useWallState";
import {
  DEFAULT_SYNTHESIS_PARAMETERS,
  type SynthesisParameters,
  type SynthesisParametersPatch,
} from "./parameters/types";
import { summarizeActiveParameters } from "./parameters/summary";
import {
  DEFAULT_SYNTHESIS_PATH,
  getSynthesisRoute,
  SYNTHESIS_NAV_SECTIONS,
  type SynthesisRouteId,
} from "./synthesisRoutes";
import { AI_PROVIDER_CONFIG } from "../config/aiProvider";
import type { AppArea, SynthesisMode } from "../types/domain";
import type { MacroState } from "../types/domain";
import type { ThemeSnapshot } from "../themeSnapshots/types";
import type { Cap11ExportRecord } from "../services/synthesisModuleApi";
import "../styles/synthesis.css";

type ConnectivityState = "reachable" | "unreachable";
type ProviderName = "anthropic" | "openai";

const providerLabel = (provider: ProviderName): string => (provider === "openai" ? "OpenAI" : "Anthropic");
const providerReasonLabel = (reason: string | null): string => {
  if (reason === "not_authenticated") return "Authenticate with the synthesis PIN first";
  if (reason === "not_configured") return "API key not set";
  if (reason === "auth_failed") return "API key rejected";
  if (reason === "unreachable") return "Cannot reach provider";
  return "Cannot reach provider";
};

const synthesisRouteCopy: Record<SynthesisRouteId, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Session summary, signal health, and readiness checkpoints for synthesis kickoff.",
  },
  moderation: {
    title: "Moderation",
    description: "Review and curate submissions before synthesis generation.",
  },
  "synthesis-parameters": {
    title: "Parameters",
    description: "Tune the synthesis inputs and generation parameters before the session runs.",
  },
  "synthesis-competing-views": {
    title: "Competing views",
    description: "Compare alternate interpretations before the facilitator commits to a direction.",
  },
  run: {
    title: "Run synthesis",
    description: "Run synthesis to generate structured outputs from weighted participant inputs.",
  },
  sizing: {
    title: "T-shirt sizing",
    description: "Estimate implementation size and complexity for prioritized initiatives.",
  },
  ceremony: {
    title: "Ceremony",
    description: "Prepare the live handoff, timing, and facilitator ritual for the session.",
  },
  "day2-reveal": {
    title: "Day 2 reveal",
    description: "Presentation-optimized Day 2 reveal view.",
  },
  "session-config": {
    title: "Session config",
    description: "Administer wall behavior, thresholds, and session timing controls.",
  },
  tables: {
    title: "Tables",
    description: "Inspect available seed tables and schema data used by the session.",
  },
};

const nowIso = (): string => new Date().toISOString();
const toStringValue = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const toBooleanValue = (value: unknown, fallback = false): boolean => (typeof value === "boolean" ? value : fallback);
const toNumberValue = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const SynthesisModuleApp = (): JSX.Element => {
  const { screenFeedback: wallScreenFeedback } = useWallState();
  const cachedAdminBootstrap = readAdminBootstrapCache();
  const cachedSessionConfig = useMemo(
    () => (cachedAdminBootstrap?.sessionConfig && typeof cachedAdminBootstrap.sessionConfig === "object"
      ? cachedAdminBootstrap.sessionConfig
      : {}),
    [cachedAdminBootstrap],
  );
  const cachedInputsCount = useMemo(
    () => (cachedAdminBootstrap?.inputsCount && typeof cachedAdminBootstrap.inputsCount === "object"
      ? cachedAdminBootstrap.inputsCount
      : {}),
    [cachedAdminBootstrap],
  );
  const cachedParameters = useMemo(() => {
    const source = cachedAdminBootstrap?.synthesisParameters?.parameters;
    if (!source || typeof source !== "object") return DEFAULT_SYNTHESIS_PARAMETERS;
    return {
      ...DEFAULT_SYNTHESIS_PARAMETERS,
      ...(source as Partial<SynthesisParameters>),
    };
  }, [cachedAdminBootstrap]);
  const [activePath, setActivePath] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_SYNTHESIS_PATH;
    return getSynthesisRoute(window.location.pathname).path;
  });
  const [synthesisGroupOpen, setSynthesisGroupOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => readSynthesisAuthFlag());
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [totalInputs, setTotalInputs] = useState(() => Math.max(0, toNumberValue(cachedInputsCount.totalInputs, 0)));
  const [sessionCutoffIso, setSessionCutoffIso] = useState<string>(
    () => toStringValue(cachedSessionConfig.inputCutoffAt, nowIso()),
  );
  const [readinessThreshold, setReadinessThreshold] = useState(
    () => Math.max(10, Math.min(500, toNumberValue(cachedSessionConfig.synthesisMinSignals, 30))),
  );
  const [inputWindowOpen, setInputWindowOpen] = useState(() => toBooleanValue(cachedSessionConfig.inputWindowOpen, false));
  const [eventName, setEventName] = useState(() => toStringValue(cachedSessionConfig.eventName, ""));
  const [eventSlug, setEventSlug] = useState(() => toStringValue(cachedSessionConfig.eventSlug, ""));
  const [ceremonyStartTimeLocal, setCeremonyStartTimeLocal] = useState(
    () => toStringValue(cachedSessionConfig.ceremonyStartTimeLocal, ""),
  );
  const [day2RevealTimeLocal, setDay2RevealTimeLocal] = useState(
    () => toStringValue(cachedSessionConfig.day2RevealTimeLocal, ""),
  );
  const [featureRequestCount, setFeatureRequestCount] = useState(
    () => Math.max(0, toNumberValue(cachedInputsCount.featureRequests, 0)),
  );
  const [screenFeedbackCount, setScreenFeedbackCount] = useState(
    () => Math.max(0, toNumberValue(cachedInputsCount.screenFeedback, 0)),
  );
  const [kudosCount, setKudosCount] = useState(() => Math.max(0, toNumberValue(cachedInputsCount.kudos, 0)));
  const [totalVotesCast, setTotalVotesCast] = useState(
    () => Math.max(0, toNumberValue(cachedInputsCount.totalVotesCast, 0)),
  );
  const [synthesisMode, setSynthesisMode] = useState<SynthesisMode>("roadmap");
  const [synthesisOutput, setSynthesisOutput] = useState("");
  const [revealNarrative, setRevealNarrative] = useState("");
  const [synthesisParameters, setSynthesisParameters] = useState<SynthesisParameters>(cachedParameters);
  const [synthesisParametersLastSavedAt, setSynthesisParametersLastSavedAt] = useState<string | null>(
    () => cachedAdminBootstrap?.synthesisParameters?.updatedAt ?? null,
  );
  const [synthesisParametersUsingDefaults, setSynthesisParametersUsingDefaults] = useState(
    () => Boolean(cachedAdminBootstrap?.synthesisParameters?.usingDefaults ?? true),
  );
  const [connectivity, setConnectivity] = useState<ConnectivityState>("unreachable");
  const [connectivityProvider, setConnectivityProvider] = useState<ProviderName>(
    AI_PROVIDER_CONFIG.provider === "openai" ? "openai" : "anthropic",
  );
  const [connectivityReason, setConnectivityReason] = useState<string | null>(null);
  const [connectivityErrorDetail, setConnectivityErrorDetail] = useState<string | null>(null);
  const [connectivityDialogOpen, setConnectivityDialogOpen] = useState(false);
  const [moderationPendingCount, setModerationPendingCount] = useState(
    () => Math.max(0, toNumberValue(cachedAdminBootstrap?.moderation?.pendingCount, 0)),
  );
  const [themeSnapshots, setThemeSnapshots] = useState<ThemeSnapshot[]>([]);
  const [day2RevealState, setDay2RevealState] = useState(() => readDay2RevealState() ?? { readToken: "", prototypeUrl: "" });

  const activeRoute = useMemo(() => getSynthesisRoute(activePath), [activePath]);
  const secondaryRevealMatch =
    typeof window !== "undefined" ? window.location.pathname.match(/^\/reveal\/([^/]+)$/u) : null;
  const isSecondaryReveal = Boolean(secondaryRevealMatch);
  const facilitatorRevealActive = activeRoute.id === "day2-reveal";
  const isRevealMode = facilitatorRevealActive || isSecondaryReveal;
  const routeInfo = synthesisRouteCopy[activeRoute.id];
  const breadcrumb = activeRoute.section === "admin" ? "ADMIN" : "FACILITATOR";
  const countdownLabel = inputWindowOpen ? formatCountdown(sessionCutoffIso) : "Closed";
  const parameterSectionOptions = useMemo(
    () =>
      APP_AREAS.map((area) => ({ id: area.id, label: area.label as string }))
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );
  const parameterSectionLookup = useMemo(
    () => Object.fromEntries(parameterSectionOptions.map((section) => [section.id, section.label])) as Record<AppArea, string>,
    [parameterSectionOptions],
  );
  const activeParameterSummaryLines = useMemo(
    () => summarizeActiveParameters(synthesisParameters, parameterSectionLookup),
    [parameterSectionLookup, synthesisParameters],
  );
  const competingPerspectivesSummary = useMemo(() => {
    const cache = readCompetingPerspectivesCache();
    if (!cache) return { status: "not_analyzed" as const, count: 0 };
    if (cache.result.length === 0) return { status: "none_detected" as const, count: 0 };
    return { status: "detected" as const, count: cache.result.length };
  }, [activeRoute.path]);

  const navigate = useCallback((path: string, replace = false) => {
    if (typeof window === "undefined") return;
    if (replace) {
      window.history.replaceState({}, "", path);
    } else {
      window.history.pushState({}, "", path);
    }
    setActivePath(path);
  }, []);

  const navigateToWall = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.assign("/");
  }, []);

  const refreshInputsCount = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getInputsCount();
      setTotalInputs(Math.max(0, Number(payload.totalInputs ?? 0)));
      setFeatureRequestCount(Math.max(0, Number(payload.featureRequests ?? 0)));
      setScreenFeedbackCount(Math.max(0, Number(payload.screenFeedback ?? 0)));
      setKudosCount(Math.max(0, Number(payload.kudos ?? 0)));
      setTotalVotesCast(Math.max(0, Number(payload.totalVotesCast ?? 0)));
    } catch {
      setTotalInputs(0);
      setFeatureRequestCount(0);
      setScreenFeedbackCount(0);
      setKudosCount(0);
      setTotalVotesCast(0);
    }
  }, []);

  const refreshSessionConfig = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getSessionConfig();
      setSessionCutoffIso(String(payload.inputCutoffAt ?? nowIso()));
      setInputWindowOpen(Boolean(payload.inputWindowOpen));
      setReadinessThreshold(Math.max(10, Math.min(500, Number(payload.synthesisMinSignals ?? 30))));
      setEventName(String(payload.eventName ?? ""));
      setEventSlug(String(payload.eventSlug ?? ""));
      setCeremonyStartTimeLocal(String(payload.ceremonyStartTimeLocal ?? ""));
      setDay2RevealTimeLocal(String(payload.day2RevealTimeLocal ?? ""));
    } catch {
      setSessionCutoffIso(nowIso());
      setInputWindowOpen(false);
      setReadinessThreshold(30);
      setEventName("");
      setEventSlug("");
      setCeremonyStartTimeLocal("");
      setDay2RevealTimeLocal("");
    }
  }, []);

  const refreshConnectivity = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getAIProviderHealth();
      setConnectivityProvider(payload.provider === "openai" ? "openai" : "anthropic");
      setConnectivityReason(payload.reason ?? null);
      setConnectivityErrorDetail(payload.error ?? null);
      setConnectivity(payload.reachable ? "reachable" : "unreachable");
      if (payload.reason === "not_authenticated") {
        clearSynthesisAuthSession();
        setIsAuthenticated(false);
      }
    } catch (error) {
      setConnectivityProvider(AI_PROVIDER_CONFIG.provider === "openai" ? "openai" : "anthropic");
      setConnectivityReason("unreachable");
      setConnectivityErrorDetail(error instanceof Error ? error.message : "Unknown error");
      setConnectivity("unreachable");
    }
  }, []);

  const refreshSynthesisParameters = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getSynthesisParameters();
      setSynthesisParameters({
        ...DEFAULT_SYNTHESIS_PARAMETERS,
        ...payload.parameters,
      });
      setSynthesisParametersLastSavedAt(payload.updatedAt ?? null);
      setSynthesisParametersUsingDefaults(Boolean(payload.usingDefaults));
    } catch {
      setSynthesisParameters(DEFAULT_SYNTHESIS_PARAMETERS);
      setSynthesisParametersLastSavedAt(null);
      setSynthesisParametersUsingDefaults(true);
    }
  }, []);

  const patchSynthesisParameters = useCallback(async (patch: SynthesisParametersPatch): Promise<void> => {
    setSynthesisParameters((current) => ({ ...current, ...patch }));
    try {
      const payload = await synthesisModuleApi.patchSynthesisParameters(patch);
      setSynthesisParameters({
        ...DEFAULT_SYNTHESIS_PARAMETERS,
        ...payload.parameters,
      });
      setSynthesisParametersLastSavedAt(payload.updatedAt ?? null);
      setSynthesisParametersUsingDefaults(Boolean(payload.usingDefaults));
    } catch {
      // Keep optimistic UI state if save fails; polling will reconcile.
    }
  }, []);

  const showConnectivityDetails = useCallback((): void => {
    if (connectivity !== "unreachable") return;
    setConnectivityDialogOpen(true);
  }, [connectivity]);

  const closeConnectivityDialog = useCallback((): void => {
    setConnectivityDialogOpen(false);
  }, []);

  const refreshModerationPending = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getFlaggedInputs();
      setModerationPendingCount(Math.max(0, Number(payload.pendingCount ?? 0)));
    } catch {
      setModerationPendingCount(0);
    }
  }, []);

  const refreshProtectedAdminData = useCallback(async (): Promise<void> => {
    await Promise.all([
      refreshInputsCount(),
      refreshSessionConfig(),
      refreshModerationPending(),
      refreshSynthesisParameters(),
    ]);
  }, [refreshInputsCount, refreshModerationPending, refreshSessionConfig, refreshSynthesisParameters]);

  const verifyProtectedDataAccess = useCallback(async (): Promise<void> => {
    await synthesisModuleApi.getInputsCount();
  }, []);

  useEffect(() => {
    if (!facilitatorRevealActive) return;
    if (/^[a-f0-9]{16}$/u.test(day2RevealState.readToken)) return;
    const ensured = ensureDay2RevealState();
    setDay2RevealState(ensured);
  }, [day2RevealState.readToken, facilitatorRevealActive]);

  const updateRevealPrototypeUrl = useCallback((next: string): void => {
    const normalized = String(next ?? "").trim();
    const token = /^[a-f0-9]{16}$/u.test(day2RevealState.readToken)
      ? day2RevealState.readToken
      : ensureDay2RevealState().readToken;
    const nextState = { readToken: token, prototypeUrl: normalized };
    writeDay2RevealState(nextState);
    setDay2RevealState(nextState);
  }, [day2RevealState.readToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isRevealPath = /^\/reveal\/[^/]+$/u.test(window.location.pathname);
    const normalizedPath = isRevealPath ? window.location.pathname : getSynthesisRoute(window.location.pathname).path;
    if (!isRevealPath && window.location.pathname !== normalizedPath) {
      navigate(normalizedPath, true);
      return;
    }
    const onPopState = (): void => {
      if (/^\/reveal\/[^/]+$/u.test(window.location.pathname)) {
        setActivePath(window.location.pathname);
        return;
      }
      setActivePath(getSynthesisRoute(window.location.pathname).path);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [navigate]);

  useEffect(() => {
    if (isRevealMode) return;
    void refreshInputsCount();
    const timer = window.setInterval(() => {
      void refreshInputsCount();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isRevealMode, refreshInputsCount]);

  useEffect(() => {
    if (isRevealMode) return;
    void refreshSessionConfig();
    const timer = window.setInterval(() => {
      void refreshSessionConfig();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isRevealMode, refreshSessionConfig]);

  useEffect(() => {
    if (isRevealMode) return;
    void refreshConnectivity();
    const timer = window.setInterval(() => {
      void refreshConnectivity();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [isRevealMode, refreshConnectivity]);

  useEffect(() => {
    if (isRevealMode) return;
    void refreshModerationPending();
    const timer = window.setInterval(() => {
      void refreshModerationPending();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isRevealMode, refreshModerationPending]);

  useEffect(() => {
    if (isRevealMode) return;
    void refreshSynthesisParameters();
    const timer = window.setInterval(() => {
      void refreshSynthesisParameters();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isRevealMode, refreshSynthesisParameters]);

  useEffect(() => {
    if (!connectivityDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setConnectivityDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connectivityDialogOpen]);

  useEffect(() => {
    const refresh = (): void => setThemeSnapshots(readThemeSnapshots());
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const submitPin = useCallback(async () => {
    const candidate = pinInput.trim();
    if (!candidate) {
      setPinError("Enter the synthesis PIN to continue.");
      return;
    }
    setAuthLoading(true);
    setPinError(null);
    try {
      const result = await synthesisModuleApi.verifyPin(candidate);
      if (!result.authenticated) {
        setPinError(result.error ?? "Invalid PIN.");
        return;
      }
      if (!isRevealMode) {
        try {
          await verifyProtectedDataAccess();
        } catch (error) {
          clearSynthesisAuthSession();
          setIsAuthenticated(false);
          const message = error instanceof Error ? error.message : "Unable to load facilitator data.";
          setPinError(`PIN accepted, but facilitator data failed to load: ${message}`);
          return;
        }
      }
      setIsAuthenticated(true);
      writeSynthesisAuthFlag(true);
      setPinInput("");
      if (!isRevealMode) {
        void refreshConnectivity();
        void refreshProtectedAdminData();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setPinError(message);
    } finally {
      setAuthLoading(false);
    }
  }, [isRevealMode, pinInput, refreshConnectivity, refreshProtectedAdminData, verifyProtectedDataAccess]);

  const handlePanelUnlock = useCallback(async (pin: string): Promise<boolean> => {
    const result = await synthesisModuleApi.verifyPin(pin);
    if (!result.authenticated) return false;
    if (!isRevealMode) {
      try {
        await verifyProtectedDataAccess();
      } catch {
        clearSynthesisAuthSession();
        setIsAuthenticated(false);
        return false;
      }
    }
    setIsAuthenticated(true);
    writeSynthesisAuthFlag(true);
    if (!isRevealMode) {
      void refreshConnectivity();
      void refreshProtectedAdminData();
    }
    return true;
  }, [isRevealMode, refreshConnectivity, refreshProtectedAdminData, verifyProtectedDataAccess]);

  const buildPromptBody = useCallback((macros?: MacroState): string => {
    return JSON.stringify(
      {
        summary: {
          totalFeatureVotes: totalVotesCast,
          screenFeedbackCount,
          kudosCount,
          totalInputs,
          readinessThreshold,
        },
        macros: macros ?? null,
      },
      null,
      2,
    );
  }, [kudosCount, readinessThreshold, screenFeedbackCount, totalInputs, totalVotesCast]);

  const exportRecords = useCallback(async (): Promise<Cap11ExportRecord[]> => {
    const payload = await synthesisModuleApi.getExportRecords();
    return Array.isArray(payload.records) ? payload.records : [];
  }, []);

  if (isRevealMode) {
    const eventSlugFromConfig = String(cachedSessionConfig.eventSlug ?? eventSlug ?? "").trim();
    const slugFromPath = secondaryRevealMatch?.[1] ? decodeURIComponent(secondaryRevealMatch[1]) : "";
    const tokenFromQuery =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") ?? "" : "";
    const tokenIsValid =
      !isSecondaryReveal ||
      (/^[a-f0-9]{16}$/u.test(day2RevealState.readToken) &&
        tokenFromQuery.toLowerCase() === day2RevealState.readToken.toLowerCase() &&
        (!eventSlugFromConfig || slugFromPath === eventSlugFromConfig));
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const safeSlug = eventSlugFromConfig || "event";
    const secondaryDisplayUrl = day2RevealState.readToken
      ? `${origin}/reveal/${encodeURIComponent(safeSlug)}?token=${day2RevealState.readToken}`
      : "";

    return (
      <div className="synthesis-reveal-shell">
        <SynthesisDay2RevealPage
          sessionConfig={{
            eventName: String(cachedSessionConfig.eventName ?? eventName),
            day2RevealTimeLocal: String(cachedSessionConfig.day2RevealTimeLocal ?? day2RevealTimeLocal),
            eventSlug: eventSlugFromConfig,
          }}
          inputsCount={{ totalInputs: Number(cachedInputsCount.totalInputs ?? totalInputs) }}
          latestPhase1Analysis={
            (cachedAdminBootstrap?.latestPhase1Analysis as { p0Items?: Array<{ title?: string; rationale?: string }> } | null) ?? null
          }
          latestTShirtSizing={cachedAdminBootstrap?.latestTShirtSizing ?? null}
          savedNarrative={cachedAdminBootstrap?.savedNarrative ?? null}
          screenFeedback={wallScreenFeedback}
          secondaryDisplayUrl={secondaryDisplayUrl}
          isSecondaryDisplay={isSecondaryReveal}
          isTokenValid={tokenIsValid}
          prototypeUrl={day2RevealState.prototypeUrl}
          onPrototypeUrlChange={updateRevealPrototypeUrl}
          onExitReveal={() => navigate("/facilitator/overview")}
        />
        {facilitatorRevealActive && !isAuthenticated && (
          <div className="synthesis-pin-overlay" role="dialog" aria-modal="true" aria-label="Synthesis PIN required">
            <form
              className="synthesis-pin-card"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPin();
              }}
            >
              <h2>Synthesis Access</h2>
              <p>Enter the session PIN to unlock synthesis routes for this browser session.</p>
              <label htmlFor="synthesis-pin-input">PIN</label>
              <input
                id="synthesis-pin-input"
                type="password"
                value={pinInput}
                onChange={(event) => setPinInput(event.target.value)}
                autoComplete="one-time-code"
                autoFocus
              />
              {pinError && <p className="synthesis-pin-error">{pinError}</p>}
              <button type="submit" className="synthesis-pin-submit" disabled={authLoading}>
                {authLoading ? "Validating..." : "Unlock synthesis"}
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="synthesis-shell" role="application" aria-label="Synthesis module">
      <aside className="synthesis-sidebar">
        <div className="synthesis-sidebar-nav">
          {SYNTHESIS_NAV_SECTIONS.map((section) => (
            <section key={section.id} className="synthesis-nav-section">
              <h2>{section.label}</h2>
              <div className="synthesis-nav-section-items">
                {section.items.map((item) => {
                  if ("items" in item) {
                    const isGroupActive = item.items.some((route) => route.path === activeRoute.path);
                    return (
                      <div key={item.id} className="synthesis-nav-group">
                      <button
                        type="button"
                        className={`synthesis-nav-group-trigger ${isGroupActive ? "is-active" : ""}`}
                        aria-expanded={synthesisGroupOpen}
                        onClick={() => setSynthesisGroupOpen((current) => !current)}
                      >
                        <span>{item.label}</span>
                        <span className={`synthesis-nav-group-chevron ${synthesisGroupOpen ? "is-open" : ""}`} aria-hidden="true" />
                      </button>
                      {synthesisGroupOpen && (
                        <div className="synthesis-nav-group-items">
                          {item.items.map((route) => (
                            <button
                              key={route.id}
                              type="button"
                              className={`synthesis-nav-item ${route.path === activeRoute.path ? "is-active" : ""}`}
                              onClick={() => navigate(route.path)}
                            >
                              <span>{route.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      </div>
                    );
                  }
                  return (
                  <button
                    key={item.id}
                    type="button"
                    className={`synthesis-nav-item ${item.path === activeRoute.path ? "is-active" : ""}`}
                    onClick={() => navigate(item.path)}
                  >
                    <span>{item.label}</span>
                    {item.id === "moderation" && moderationPendingCount > 0 && (
                      <span className="synthesis-nav-badge">{moderationPendingCount.toLocaleString()}</span>
                    )}
                  </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="synthesis-sidebar-back">
          <button type="button" className="synthesis-back-link" onClick={navigateToWall}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.5 6.5 9 12l5.5 5.5" />
              <path d="M9.5 12h8" />
            </svg>
            <span>Back to wall</span>
          </button>
        </div>
        <div className="synthesis-sidebar-status">
          <div className="synthesis-status-row">
            <span
              className={`synthesis-status-dot ${
                connectivity === "reachable" ? "is-reachable" : "is-unreachable"
              }`}
              aria-hidden="true"
            />
            {connectivity === "reachable" ? (
              <span>{providerLabel(connectivityProvider)}: Connected</span>
            ) : (
              <button
                type="button"
                className="synthesis-status-link"
                onClick={showConnectivityDetails}
                title={providerReasonLabel(connectivityReason)}
              >
                {providerLabel(connectivityProvider)}: Unavailable
              </button>
            )}
          </div>
          <div className="synthesis-status-row">
            <span className={`synthesis-status-dot ${inputWindowOpen ? "is-reachable" : "is-unreachable"}`} aria-hidden="true" />
            <span>Input window: {inputWindowOpen ? "Open" : "Closed"}</span>
          </div>
        </div>
      </aside>

      <main className="synthesis-main">
        <header className="synthesis-topbar">
          <div>
            <p className="synthesis-breadcrumb">{breadcrumb}</p>
            <h1>{routeInfo.title}</h1>
          </div>
          <div className="synthesis-topbar-right">
            <button type="button" className="universe-launch" onClick={navigateToWall}>
              Back to wall
            </button>
            <div className="synthesis-metrics">
              <div className="synthesis-metric-card">
                <span>Live inputs</span>
                <strong>{totalInputs.toLocaleString()}</strong>
              </div>
              <div className="synthesis-metric-card">
                <span>Synthesis countdown</span>
                <strong>{countdownLabel}</strong>
              </div>
            </div>
          </div>
        </header>

        {activeRoute.id === "overview" ? (
          <SynthesisOverviewPage />
        ) : activeRoute.id === "moderation" ? (
          <SynthesisModerationPage onPendingCountChange={setModerationPendingCount} />
        ) : activeRoute.id === "session-config" ? (
          <SynthesisSessionConfigPage isAuthenticated={isAuthenticated} />
        ) : activeRoute.id === "run" ? (
          <section className="synthesis-page-card synthesis-run-shell">
            <SynthesisPanel
              summary={{
                totalFeatureVotes: featureRequestCount,
                screenFeedbackCount,
                kudosCount,
                totalResponses: totalInputs,
              }}
              competingPerspectivesStatus={competingPerspectivesSummary.status}
              competingPerspectivesCount={competingPerspectivesSummary.count}
              readinessThreshold={readinessThreshold}
              mode={synthesisMode}
              onModeChange={setSynthesisMode}
              unlocked={isAuthenticated}
              onUnlock={handlePanelUnlock}
              pinLengthRange={{ min: 4, max: 6 }}
              output={synthesisOutput}
              onOutputChange={setSynthesisOutput}
              buildPromptBody={buildPromptBody}
              onClearOutput={() => setSynthesisOutput("")}
              exportRecords={exportRecords}
              exportMetadata={{
                eventName,
                eventSlug,
                ceremonyStartTimeLocal,
                day2RevealTimeLocal,
                synthesisMinSignals: readinessThreshold,
                themeSnapshots,
              }}
              revealNarrative={revealNarrative}
              onRevealNarrativeChange={setRevealNarrative}
              featureRequests={[]}
              onSynthesisStart={() => undefined}
              onSynthesisComplete={() => undefined}
              activeParametersSummary={activeParameterSummaryLines}
            />
          </section>
        ) : activeRoute.id === "synthesis-parameters" ? (
          <SynthesisParametersPage
            parameters={synthesisParameters}
            readinessThreshold={readinessThreshold}
            appSections={parameterSectionOptions}
            lastSavedAt={synthesisParametersLastSavedAt}
            usingDefaults={synthesisParametersUsingDefaults}
            onPatch={(patch) => {
              void patchSynthesisParameters(patch);
            }}
          />
        ) : activeRoute.id === "synthesis-competing-views" ? (
          <SynthesisCompetingViewsPage
            parameters={synthesisParameters}
            screenFeedbackRecords={wallScreenFeedback}
          />
        ) : activeRoute.id === "sizing" ? (
          <SynthesisTShirtSizingPage />
        ) : activeRoute.id === "ceremony" ? (
          <SynthesisCeremonyPage
            summary={{
              totalFeatureVotes: featureRequestCount,
              screenFeedbackCount,
              kudosCount,
              totalResponses: totalInputs,
            }}
            competingPerspectivesStatus={competingPerspectivesSummary.status}
            competingPerspectivesCount={competingPerspectivesSummary.count}
            readinessThreshold={readinessThreshold}
            mode={synthesisMode}
            onModeChange={setSynthesisMode}
            unlocked={isAuthenticated}
            onUnlock={handlePanelUnlock}
            pinLengthRange={{ min: 4, max: 6 }}
            output={synthesisOutput}
            onOutputChange={setSynthesisOutput}
            buildPromptBody={buildPromptBody}
            onClearOutput={() => setSynthesisOutput("")}
            exportRecords={exportRecords}
            activeParametersSummary={activeParameterSummaryLines}
            exportMetadata={{
              eventName,
              eventSlug,
              ceremonyStartTimeLocal,
              day2RevealTimeLocal,
              synthesisMinSignals: readinessThreshold,
              themeSnapshots,
            }}
            revealNarrative={revealNarrative}
            onRevealNarrativeChange={setRevealNarrative}
            featureRequests={[]}
            onSynthesisStart={() => undefined}
            onSynthesisComplete={() => undefined}
            eventName={eventName}
            day2RevealTimeLocal={day2RevealTimeLocal}
            totalInputs={totalInputs}
            screenFeedbackRecords={wallScreenFeedback}
          />
        ) : activeRoute.id === "tables" ? (
          <SynthesisTablesPage />
        ) : (
          <section className="synthesis-page-card">
            <h2>{routeInfo.title}</h2>
            <p>{routeInfo.description}</p>
          </section>
        )}
      </main>

      {!isAuthenticated && (
        <div className="synthesis-pin-overlay" role="dialog" aria-modal="true" aria-label="Synthesis PIN required">
          <form
            className="synthesis-pin-card"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPin();
            }}
          >
            <h2>Synthesis Access</h2>
            <p>Enter the session PIN to unlock synthesis routes for this browser session.</p>
            <label htmlFor="synthesis-pin-input">PIN</label>
            <input
              id="synthesis-pin-input"
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              autoComplete="one-time-code"
              autoFocus
            />
            {pinError && <p className="synthesis-pin-error">{pinError}</p>}
            <button type="submit" className="synthesis-pin-submit" disabled={authLoading}>
              {authLoading ? "Validating..." : "Unlock synthesis"}
            </button>
          </form>
        </div>
      )}

      {connectivityDialogOpen && connectivity === "unreachable" && (
        <div
          className="synthesis-connectivity-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Provider connectivity details"
          onClick={closeConnectivityDialog}
        >
          <div className="synthesis-connectivity-card" onClick={(event) => event.stopPropagation()}>
            <h2>{providerLabel(connectivityProvider)} status: Unavailable</h2>
            <p>Reason: {providerReasonLabel(connectivityReason)}</p>
            {connectivityErrorDetail && <p>Details: {connectivityErrorDetail}</p>}
            <button type="button" className="synthesis-connectivity-close" onClick={closeConnectivityDialog}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
