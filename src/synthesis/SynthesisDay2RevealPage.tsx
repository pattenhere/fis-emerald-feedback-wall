import { useMemo } from "react";
import { copyText } from "../utils/clipboard";
import type { Day2Narrative } from "../services/synthesisModuleApi";
import type { TShirtSizingResultsPayload } from "./tshirt/sizingResultsStore";
import { readCompetingPerspectivesCache } from "./competingViewsCache";
import type { AppArea } from "../types/domain";
import { APP_AREAS } from "../state/seedData";

type Phase1P0 = {
  title?: string;
  rationale?: string;
};

type RevealSessionConfig = {
  eventName?: string;
  day2RevealTimeLocal?: string;
  eventSlug?: string;
};

interface SynthesisDay2RevealPageProps {
  sessionConfig: RevealSessionConfig;
  inputsCount: { totalInputs?: number };
  latestPhase1Analysis: { p0Items?: Phase1P0[] } | null;
  latestTShirtSizing: TShirtSizingResultsPayload | null;
  savedNarrative: Day2Narrative | null;
  screenFeedback: Array<{ app: AppArea }>;
  secondaryDisplayUrl: string;
  isSecondaryDisplay: boolean;
  isTokenValid: boolean;
  prototypeUrl: string;
  onPrototypeUrlChange: (next: string) => void;
  onExitReveal: () => void;
}

const APP_LABEL_BY_ID = Object.fromEntries(APP_AREAS.map((area) => [area.id, area.label])) as Record<AppArea, string>;

const toDay2Label = (value: string | undefined): string => (value && value.trim() ? value.trim() : "TBD");

const toOneLine = (value: string | undefined): string => {
  const trimmed = String(value ?? "").trim().replace(/\s+/gu, " ");
  if (trimmed.length <= 140) return trimmed;
  return `${trimmed.slice(0, 139).trimEnd()}...`;
};

const sizeTone = (size: string | null): string => {
  if (size === "XS" || size === "S") return "is-built";
  if (size === "M") return "is-medium";
  if (size === "L") return "is-large";
  return "is-none";
};

export const SynthesisDay2RevealPage = ({
  sessionConfig,
  inputsCount,
  latestPhase1Analysis,
  latestTShirtSizing,
  savedNarrative,
  screenFeedback,
  secondaryDisplayUrl,
  isSecondaryDisplay,
  isTokenValid,
  prototypeUrl,
  onPrototypeUrlChange,
  onExitReveal,
}: SynthesisDay2RevealPageProps): JSX.Element => {
  const totalInputs = Math.max(0, Number(inputsCount.totalInputs ?? 0));
  const eventName = String(sessionConfig.eventName ?? "").trim() || "Emerald Event";
  const day2RevealTime = toDay2Label(sessionConfig.day2RevealTimeLocal);
  const phase1P0 = Array.isArray(latestPhase1Analysis?.p0Items) ? latestPhase1Analysis.p0Items : [];
  const topSignals = phase1P0.slice(0, 3).map((item) => ({
    title: String(item.title ?? "").trim(),
    rationale: toOneLine(item.rationale),
  })).filter((item) => item.title.length > 0);

  const sizingRows = Array.isArray(latestTShirtSizing?.results) ? latestTShirtSizing.results : [];
  const builtRows = sizingRows.filter((row) => row.size === "XS" || row.size === "S");
  const deferredRows = sizingRows.filter((row) => row.size === "M" || row.size === "L");

  const competingCount = useMemo(() => {
    const cache = readCompetingPerspectivesCache();
    return Array.isArray(cache?.result) ? cache.result.length : 0;
  }, []);

  const topArea = useMemo(() => {
    const counts = new Map<AppArea, number>();
    for (const row of screenFeedback) {
      counts.set(row.app, (counts.get(row.app) ?? 0) + 1);
    }
    if (counts.size === 0) return "Unknown";
    const [id] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return APP_LABEL_BY_ID[id] ?? id;
  }, [screenFeedback]);

  const warnings = [
    latestPhase1Analysis == null ? "Synthesis has not been run. Section 2 will be empty." : "",
    !latestTShirtSizing?.savedAt ? "T-shirt sizing has not been saved. Sections 3 and 4 will be empty." : "",
    savedNarrative == null ? "Day 2 narrative has not been generated. Section 5 will be empty." : "",
  ].filter(Boolean);

  const canOpenPrototype = prototypeUrl.trim().length > 0;

  if (isSecondaryDisplay && !isTokenValid) {
    return (
      <section className="day2-reveal day2-reveal--invalid">
        <p>Invalid display link.</p>
      </section>
    );
  }

  return (
    <section className={`day2-reveal${isSecondaryDisplay ? " day2-reveal--secondary" : ""}`}>
      {!isSecondaryDisplay && (
        <div className="day2-reveal-topline">
          <button type="button" className="day2-reveal-exit" onClick={onExitReveal}>
            Exit reveal
          </button>
          <div className="day2-reveal-display-link">
            <strong>Secondary display URL</strong>
            <code>{secondaryDisplayUrl}</code>
            <button type="button" className="secondary-btn" onClick={() => void copyText(secondaryDisplayUrl)}>
              Copy
            </button>
          </div>
        </div>
      )}

      <header className="day2-reveal-header-band">
        <h1>{eventName}</h1>
        <p>Day 2 · {day2RevealTime}</p>
        <span className="day2-reveal-input-badge">{totalInputs.toLocaleString()} inputs collected</span>
      </header>

      {warnings.length > 0 && (
        <section className="day2-reveal-warnings">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </section>
      )}

      <section className="day2-reveal-section">
        <h2>What you told us</h2>
        {topSignals.length === 0 ? (
          <p className="helper-copy">No synthesis signals available yet.</p>
        ) : (
          <div className="day2-reveal-signal-cards">
            {topSignals.map((signal) => (
              <article key={signal.title} className="day2-reveal-signal-card">
                <h3>{signal.title}</h3>
                <p>{signal.rationale}</p>
              </article>
            ))}
          </div>
        )}
        {competingCount > 0 && (
          <p className="day2-reveal-callout">
            We also heard competing views on {competingCount} screens - we took both sides into account.
          </p>
        )}
      </section>

      <section className="day2-reveal-section">
        <h2>What we built overnight</h2>
        {builtRows.length === 0 ? (
          <p className="helper-copy">No XS/S sized items available.</p>
        ) : (
          <ul className="list-reset day2-reveal-item-list">
            {builtRows.map((row) => (
              <li key={row.p0ItemTitle} className="day2-reveal-item">
                <div>
                  <strong>{row.p0ItemTitle}</strong>
                  {row.notes ? <p>{row.notes}</p> : null}
                </div>
                <span className={`day2-reveal-size ${sizeTone(row.size)}`}>{row.size}</span>
              </li>
            ))}
          </ul>
        )}
        {!isSecondaryDisplay && (
          <div className="day2-reveal-prototype">
            <label htmlFor="day2-prototype-url">Prototype URL</label>
            <input
              id="day2-prototype-url"
              type="url"
              placeholder="https://..."
              value={prototypeUrl}
              onChange={(event) => onPrototypeUrlChange(event.target.value)}
            />
            {canOpenPrototype && (
              <a className="secondary-btn" href={prototypeUrl} target="_blank" rel="noreferrer">
                Open prototype
              </a>
            )}
          </div>
        )}
        {isSecondaryDisplay && canOpenPrototype && (
          <a className="secondary-btn" href={prototypeUrl} target="_blank" rel="noreferrer">
            Open prototype
          </a>
        )}
      </section>

      <section className="day2-reveal-section">
        <h2>What we're taking forward</h2>
        {deferredRows.length === 0 ? (
          <p className="helper-copy">No M/L sized items available.</p>
        ) : (
          <ul className="list-reset day2-reveal-item-list">
            {deferredRows.map((row) => (
              <li key={row.p0ItemTitle} className="day2-reveal-item">
                <div>
                  <strong>{row.p0ItemTitle}</strong>
                  {row.notes ? <p>{row.notes}</p> : null}
                </div>
                <span className={`day2-reveal-size ${sizeTone(row.size)}`}>{row.size}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="day2-reveal-fixed-framing">
          These items are captured and will be reviewed in our next cycle.
        </p>
      </section>

      {!isSecondaryDisplay && (
        <section className="day2-reveal-section">
          <h2>Facilitator narrative</h2>
          {savedNarrative ? (
            <div className="day2-reveal-narrative">
              <article>
                <strong>Opening</strong>
                <p>{savedNarrative.opening}</p>
              </article>
              <article>
                <strong>What we heard</strong>
                <p>{savedNarrative.what_we_heard}</p>
              </article>
              <article>
                <strong>What we built</strong>
                <p>{savedNarrative.what_we_built}</p>
              </article>
              <article>
                <strong>What we deferred</strong>
                <p>{savedNarrative.what_we_deferred}</p>
              </article>
              <article>
                <strong>Closing</strong>
                <p>{savedNarrative.closing}</p>
              </article>
            </div>
          ) : (
            <p className="helper-copy">No saved narrative available.</p>
          )}
        </section>
      )}

      <section className="day2-reveal-section day2-reveal-disclaimer">
        <p>
          All items shown are prototype demonstrations derived from attendee feedback. No production commitments are
          implied. Prototype · Non-production · Synthetic data.
        </p>
      </section>

      <div className="day2-reveal-meta">Top active area: {topArea}</div>
    </section>
  );
};
