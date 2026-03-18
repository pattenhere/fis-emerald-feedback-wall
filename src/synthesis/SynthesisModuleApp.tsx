import { useCallback, useEffect, useMemo, useState } from "react";
import { synthesisModuleApi } from "../services/synthesisModuleApi";
import { readSynthesisAuthFlag, writeSynthesisAuthFlag } from "../services/synthesisAuth";
import { formatCountdown } from "../utils/time";
import { SynthesisOverviewPage } from "./SynthesisOverviewPage";
import { SynthesisModerationPage } from "./SynthesisModerationPage";
import {
  DEFAULT_SYNTHESIS_PATH,
  getSynthesisRoute,
  SYNTHESIS_ROUTES,
  type SynthesisRouteId,
} from "./synthesisRoutes";
import "../styles/synthesis.css";

type ConnectivityState = "reachable" | "unreachable";

const synthesisRouteCopy: Record<SynthesisRouteId, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Session summary, signal health, and readiness checkpoints for synthesis kickoff.",
  },
  moderation: {
    title: "Moderation",
    description: "Review and curate submissions before synthesis generation.",
  },
  run: {
    title: "Synthesis",
    description: "Generate structured artifacts from the latest weighted participant inputs.",
  },
  sizing: {
    title: "T-shirt sizing",
    description: "Estimate implementation size and complexity for prioritized initiatives.",
  },
  themes: {
    title: "Themes view",
    description: "Inspect cross-screen patterns, grouped themes, and confidence levels.",
  },
  artifacts: {
    title: "All artifacts",
    description: "Browse generated summaries, exports, and prior synthesis outputs.",
  },
  roadmap: {
    title: "Roadmap",
    description: "Plan sequenced delivery using synthesis outputs and effort estimates.",
  },
};

const nowIso = (): string => new Date().toISOString();

export const SynthesisModuleApp = (): JSX.Element => {
  const [activePath, setActivePath] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_SYNTHESIS_PATH;
    return getSynthesisRoute(window.location.pathname).path;
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => readSynthesisAuthFlag());
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [totalInputs, setTotalInputs] = useState(0);
  const [sessionCutoffIso, setSessionCutoffIso] = useState<string>(nowIso());
  const [inputWindowOpen, setInputWindowOpen] = useState(false);
  const [connectivity, setConnectivity] = useState<ConnectivityState>("unreachable");
  const [moderationPendingCount, setModerationPendingCount] = useState(0);

  const activeRoute = useMemo(() => getSynthesisRoute(activePath), [activePath]);
  const routeInfo = synthesisRouteCopy[activeRoute.id];
  const breadcrumb = activeRoute.id === "artifacts" ? "Artifacts" : "Admin";
  const countdownLabel = inputWindowOpen ? formatCountdown(sessionCutoffIso) : "Closed";

  const navigate = useCallback((path: string, replace = false) => {
    if (typeof window === "undefined") return;
    if (replace) {
      window.history.replaceState({}, "", path);
    } else {
      window.history.pushState({}, "", path);
    }
    setActivePath(path);
  }, []);

  const refreshInputsCount = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getInputsCount();
      setTotalInputs(Math.max(0, Number(payload.totalInputs ?? 0)));
    } catch {
      setTotalInputs(0);
    }
  }, []);

  const refreshSessionConfig = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getSessionConfig();
      setSessionCutoffIso(String(payload.inputCutoffAt ?? nowIso()));
      setInputWindowOpen(Boolean(payload.inputWindowOpen));
    } catch {
      setSessionCutoffIso(nowIso());
      setInputWindowOpen(false);
    }
  }, []);

  const refreshConnectivity = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getAnthropicHealth();
      setConnectivity(payload.reachable ? "reachable" : "unreachable");
    } catch {
      setConnectivity("unreachable");
    }
  }, []);

  const refreshModerationPending = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getFlaggedInputs();
      setModerationPendingCount(Math.max(0, Number(payload.pendingCount ?? 0)));
    } catch {
      setModerationPendingCount(0);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const normalizedPath = getSynthesisRoute(window.location.pathname).path;
    if (window.location.pathname !== normalizedPath) {
      navigate(normalizedPath, true);
      return;
    }
    const onPopState = (): void => {
      setActivePath(getSynthesisRoute(window.location.pathname).path);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [navigate]);

  useEffect(() => {
    void refreshInputsCount();
    const timer = window.setInterval(() => {
      void refreshInputsCount();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshInputsCount]);

  useEffect(() => {
    void refreshSessionConfig();
    const timer = window.setInterval(() => {
      void refreshSessionConfig();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshSessionConfig]);

  useEffect(() => {
    void refreshConnectivity();
    const timer = window.setInterval(() => {
      void refreshConnectivity();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refreshConnectivity]);

  useEffect(() => {
    void refreshModerationPending();
    const timer = window.setInterval(() => {
      void refreshModerationPending();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshModerationPending]);

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
      setIsAuthenticated(true);
      writeSynthesisAuthFlag(true);
      setPinInput("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setPinError(message);
    } finally {
      setAuthLoading(false);
    }
  }, [pinInput]);

  return (
    <div className="synthesis-shell" role="application" aria-label="Synthesis module">
      <aside className="synthesis-sidebar">
        <div className="synthesis-sidebar-nav">
          {SYNTHESIS_ROUTES.map((route) => (
            <button
              key={route.id}
              type="button"
              className={`synthesis-nav-item ${route.path === activeRoute.path ? "is-active" : ""}`}
              onClick={() => navigate(route.path)}
            >
              <span>{route.label}</span>
              {route.id === "moderation" && moderationPendingCount > 0 && (
                <span className="synthesis-nav-badge">{moderationPendingCount.toLocaleString()}</span>
              )}
            </button>
          ))}
        </div>
        <div className="synthesis-sidebar-status">
          <div className="synthesis-status-row">
            <span
              className={`synthesis-status-dot ${
                connectivity === "reachable" ? "is-reachable" : "is-unreachable"
              }`}
              aria-hidden="true"
            />
            <span>
              API connection: {connectivity === "reachable" ? "Connected" : "Unavailable"}
            </span>
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
        </header>

        {activeRoute.id === "overview" ? (
          <SynthesisOverviewPage onNavigate={navigate} />
        ) : activeRoute.id === "moderation" ? (
          <SynthesisModerationPage onPendingCountChange={setModerationPendingCount} />
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
};
