import { useCallback, useEffect, useMemo, useState } from "react";
import { synthesisModuleApi, type SessionConfigResponse } from "../services/synthesisModuleApi";

interface SessionToggleState {
  wallWindowOpen: boolean;
  mobileWindowOpen: boolean;
  themesViewActive: boolean;
  synthesisMinSignals: number;
  stopAcceptingTimeLocal: string;
  mobileWindowCloseTimeLocal: string;
  eventName: string;
  eventSlug: string;
  ceremonyStartTimeLocal: string;
  day2RevealTimeLocal: string;
}

interface SynthesisSessionConfigPageProps {
  isAuthenticated: boolean;
}

const DEFAULT_MIN_SIGNALS = 30;

const toLocalTimeFromIso = (value: string | undefined): string => {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) return "";
  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
};

const parseLocalTime = (value: string): number | null => {
  const match = String(value).trim().match(/^(\d{2}):(\d{2})$/u);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const toIsoForToday = (timeLocal: string, fallbackIso: string): string => {
  const mins = parseLocalTime(timeLocal);
  if (mins == null) return fallbackIso;
  const next = new Date();
  next.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return next.toISOString();
};

const slugifyEventName = (value: string): string => {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40);
};

const initialState: SessionToggleState = {
  wallWindowOpen: true,
  mobileWindowOpen: true,
  themesViewActive: false,
  synthesisMinSignals: DEFAULT_MIN_SIGNALS,
  stopAcceptingTimeLocal: "",
  mobileWindowCloseTimeLocal: "",
  eventName: "",
  eventSlug: "",
  ceremonyStartTimeLocal: "",
  day2RevealTimeLocal: "",
};

export const SynthesisSessionConfigPage = ({ isAuthenticated }: SynthesisSessionConfigPageProps): JSX.Element => {
  const [config, setConfig] = useState<SessionToggleState>(initialState);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [lastAutoSlug, setLastAutoSlug] = useState("");
  const [minSignalsDraft, setMinSignalsDraft] = useState(String(DEFAULT_MIN_SIGNALS));
  const [minSignalsError, setMinSignalsError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [pending, setPending] = useState({
    wallWindowOpen: false,
    mobileWindowOpen: false,
    themesViewActive: false,
  });

  const applySessionConfig = useCallback((payload: SessionConfigResponse): void => {
    const stopTime = toLocalTimeFromIso(payload.inputCutoffAt);
    const mobileCloseLocal = typeof payload.mobileWindowCloseTimeLocal === "string" && payload.mobileWindowCloseTimeLocal.trim()
      ? payload.mobileWindowCloseTimeLocal.trim()
      : toLocalTimeFromIso(payload.mobileWindowCloseTime ?? payload.inputCutoffAt);
    const minSignals = Math.max(10, Math.min(500, Number(payload.synthesisMinSignals ?? DEFAULT_MIN_SIGNALS)));
    const eventName = String(payload.eventName ?? "");
    const eventSlug = String(payload.eventSlug ?? "");
    setConfig({
      wallWindowOpen: payload.wallWindowOpen ?? true,
      mobileWindowOpen: payload.mobileWindowOpen ?? true,
      themesViewActive: payload.themesViewActive ?? false,
      synthesisMinSignals: minSignals,
      stopAcceptingTimeLocal: stopTime,
      mobileWindowCloseTimeLocal: mobileCloseLocal,
      eventName,
      eventSlug,
      ceremonyStartTimeLocal: String(payload.ceremonyStartTimeLocal ?? ""),
      day2RevealTimeLocal: String(payload.day2RevealTimeLocal ?? ""),
    });
    setMinSignalsDraft(String(minSignals));
    setLastAutoSlug(slugifyEventName(eventName));
  }, []);

  const refreshSessionConfig = useCallback(async (): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getSessionConfig();
      applySessionConfig(payload);
      setToggleError(null);
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : "Unable to load session settings.");
    }
  }, [applySessionConfig]);

  useEffect(() => {
    if (!isAuthenticated) {
      setToggleError(null);
      return;
    }
    void refreshSessionConfig();
    const timer = window.setInterval(() => {
      void refreshSessionConfig();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, refreshSessionConfig]);

  const patchToggle = useCallback(async (key: "wallWindowOpen" | "mobileWindowOpen" | "themesViewActive", value: boolean) => {
    if (!isAuthenticated) return;
    setToggleError(null);
    setPending((current) => ({ ...current, [key]: true }));
    const previous = config[key];
    setConfig((current) => ({ ...current, [key]: value }));
    try {
      const updated = await synthesisModuleApi.patchSessionConfig({ [key]: value });
      applySessionConfig(updated);
    } catch (error) {
      setConfig((current) => ({ ...current, [key]: previous }));
      setToggleError(error instanceof Error ? error.message : "Unable to save session settings.");
    } finally {
      setPending((current) => ({ ...current, [key]: false }));
    }
  }, [applySessionConfig, config, isAuthenticated]);

  const patchConfig = useCallback(async (payload: Parameters<typeof synthesisModuleApi.patchSessionConfig>[0]) => {
    if (!isAuthenticated) return;
    try {
      const updated = await synthesisModuleApi.patchSessionConfig(payload);
      applySessionConfig(updated);
      setToggleError(null);
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : "Unable to save session settings.");
    }
  }, [applySessionConfig, isAuthenticated]);

  const stopTimeMinutes = parseLocalTime(config.stopAcceptingTimeLocal);
  const mobileCloseMinutes = parseLocalTime(config.mobileWindowCloseTimeLocal);
  const ceremonyMinutes = parseLocalTime(config.ceremonyStartTimeLocal);
  const day2RevealMinutes = parseLocalTime(config.day2RevealTimeLocal);

  const wallClosingSoonWarning = useMemo(() => {
    if (!config.wallWindowOpen || stopTimeMinutes == null) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const delta = stopTimeMinutes - nowMinutes;
    if (delta >= 0 && delta < 30) {
      return "Wall closes in under 30 minutes.";
    }
    return null;
  }, [config.wallWindowOpen, stopTimeMinutes]);

  const mobileCloseAfterWallWarning =
    mobileCloseMinutes != null && stopTimeMinutes != null && mobileCloseMinutes > stopTimeMinutes
      ? "Mobile QR window closes after the wall input window. Consider aligning these."
      : null;

  const ceremonyOrderingWarning =
    ceremonyMinutes != null && stopTimeMinutes != null && ceremonyMinutes <= stopTimeMinutes
      ? "Ceremony should start after inputs close."
      : null;

  const revealOrderingWarning =
    day2RevealMinutes != null && ceremonyMinutes != null && day2RevealMinutes <= ceremonyMinutes
      ? "Reveal should be scheduled after the ceremony."
      : null;

  const eventNameMissingWarning = config.eventName.trim().length === 0
    ? "Event name is not set. Synthesis exports and the Day 2 narrative will use a placeholder until set."
    : null;

  return (
    <section className="synthesis-session-config">
      <div className="overview-panel">
        <h2>Session controls</h2>
        {eventNameMissingWarning && <p className="overview-inline-warning">{eventNameMissingWarning}</p>}

        <div className="overview-toggle-row">
          <div>
            <p>Wall input window</p>
          </div>
          <button
            type="button"
            className={`overview-toggle ${config.wallWindowOpen ? "is-on" : ""}`}
            aria-pressed={config.wallWindowOpen}
            onClick={() => void patchToggle("wallWindowOpen", !config.wallWindowOpen)}
            disabled={pending.wallWindowOpen}
          >
            <span />
          </button>
        </div>

        <div className="overview-toggle-row">
          <div>
            <p>Mobile QR window</p>
            <span>Closes at {config.mobileWindowCloseTimeLocal || "--:--"}</span>
          </div>
          <button
            type="button"
            className={`overview-toggle ${config.mobileWindowOpen ? "is-on" : ""}`}
            aria-pressed={config.mobileWindowOpen}
            onClick={() => void patchToggle("mobileWindowOpen", !config.mobileWindowOpen)}
            disabled={pending.mobileWindowOpen}
          >
            <span />
          </button>
        </div>

        <div className="overview-toggle-row">
          <div>
            <p>Themes view on wall</p>
            <span>Auto-switches after synthesis.</span>
          </div>
          <button
            type="button"
            className={`overview-toggle ${config.themesViewActive ? "is-on" : ""}`}
            aria-pressed={config.themesViewActive}
            onClick={() => void patchToggle("themesViewActive", !config.themesViewActive)}
            disabled={pending.themesViewActive}
          >
            <span />
          </button>
        </div>

        <div className="overview-toggle-row overview-field-row">
          <div>
            <p>Minimum inputs before synthesis can begin</p>
            <span>Recommended: 30-100 for a half-day event. This value is read by Run synthesis.</span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={minSignalsDraft}
            onChange={(event) => {
              const next = event.target.value;
              if (/^\d*$/.test(next)) {
                setMinSignalsDraft(next);
                setMinSignalsError(null);
              }
            }}
            onBlur={() => {
              const parsed = Number(minSignalsDraft);
              if (!Number.isInteger(parsed) || parsed < 10 || parsed > 500) {
                setMinSignalsError("Must be between 10 and 500.");
                return;
              }
              void patchConfig({ synthesisMinSignals: parsed });
            }}
          />
        </div>
        {minSignalsError && <p className="overview-inline-error">{minSignalsError}</p>}

        <div className="overview-toggle-row overview-field-row">
          <div>
            <p>Stop accepting inputs at (local timezone)</p>
          </div>
          <input
            type="time"
            value={config.stopAcceptingTimeLocal}
            onChange={(event) => {
              const next = event.target.value;
              setConfig((current) => ({ ...current, stopAcceptingTimeLocal: next }));
              void patchConfig({
                inputCutoffAt: toIsoForToday(next, new Date().toISOString()),
              });
            }}
          />
        </div>
        {wallClosingSoonWarning && <p className="overview-inline-warning">{wallClosingSoonWarning}</p>}

        <div className="overview-toggle-row overview-field-row">
          <div>
            <p>Mobile QR window close time</p>
          </div>
          <input
            type="time"
            value={config.mobileWindowCloseTimeLocal}
            onChange={(event) => {
              const next = event.target.value;
              setConfig((current) => ({ ...current, mobileWindowCloseTimeLocal: next }));
              void patchConfig({ mobileWindowCloseTime: next });
            }}
          />
        </div>
        {mobileCloseAfterWallWarning && <p className="overview-inline-warning">{mobileCloseAfterWallWarning}</p>}

        <div className="overview-toggle-row overview-section-header">
          <div>
            <p>Event identity</p>
          </div>
        </div>

        <div className="overview-toggle-row overview-field-row">
          <div>
            <p>Event name</p>
          </div>
          <input
            type="text"
            maxLength={80}
            placeholder="e.g. Emerald 2026 — Chicago"
            value={config.eventName}
            onChange={(event) => setConfig((current) => ({ ...current, eventName: event.target.value }))}
            onBlur={() => {
              const nextName = config.eventName.trim();
              const nextAutoSlug = slugifyEventName(nextName);
              const shouldRegenerateSlug =
                config.eventSlug.trim().length === 0 || config.eventSlug.trim() === lastAutoSlug;
              if (shouldRegenerateSlug) {
                setConfig((current) => ({ ...current, eventSlug: nextAutoSlug }));
                setLastAutoSlug(nextAutoSlug);
                void patchConfig({ eventName: nextName, eventSlug: nextAutoSlug });
                return;
              }
              setLastAutoSlug(nextAutoSlug);
              void patchConfig({ eventName: nextName });
            }}
          />
        </div>

        <div className="overview-toggle-row overview-field-row">
          <div>
            <p>Event slug</p>
            <span>Used in export filenames. Auto-generated from event name — editable.</span>
          </div>
          <input
            type="text"
            maxLength={40}
            value={config.eventSlug}
            onChange={(event) => {
              setSlugError(null);
              setConfig((current) => ({ ...current, eventSlug: event.target.value.toLowerCase() }));
            }}
            onBlur={() => {
              const trimmed = config.eventSlug.trim().toLowerCase();
              if (trimmed && !/^[a-z0-9-]{1,40}$/u.test(trimmed)) {
                setSlugError("Slug must be lowercase letters, numbers, and hyphens only (max 40 characters).");
                return;
              }
              void patchConfig({ eventSlug: trimmed });
            }}
          />
        </div>
        {slugError && <p className="overview-inline-error">{slugError}</p>}

        <div className="overview-toggle-row overview-field-row">
          <div>
            <p>Ceremony start time (local timezone)</p>
            <span>When the end-of-day synthesis ceremony begins. Drives the ceremony countdown on the kiosk wall.</span>
          </div>
          <input
            type="time"
            value={config.ceremonyStartTimeLocal}
            onChange={(event) => {
              const next = event.target.value;
              setConfig((current) => ({ ...current, ceremonyStartTimeLocal: next }));
              void patchConfig({ ceremonyStartTimeLocal: next });
            }}
          />
        </div>
        {ceremonyOrderingWarning && <p className="overview-inline-warning">{ceremonyOrderingWarning}</p>}

        <div className="overview-toggle-row overview-field-row">
          <div>
            <p>Day 2 reveal time (local timezone)</p>
            <span>When the Day 2 prototype reveal begins. Shown in the narrative and reveal screen.</span>
          </div>
          <input
            type="time"
            value={config.day2RevealTimeLocal}
            onChange={(event) => {
              const next = event.target.value;
              setConfig((current) => ({ ...current, day2RevealTimeLocal: next }));
              void patchConfig({ day2RevealTimeLocal: next });
            }}
          />
        </div>
        {revealOrderingWarning && <p className="overview-inline-warning">{revealOrderingWarning}</p>}

        {toggleError && <p className="overview-toggle-error">{toggleError}</p>}
      </div>
    </section>
  );
};
