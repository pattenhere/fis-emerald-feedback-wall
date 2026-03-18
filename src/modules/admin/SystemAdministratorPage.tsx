import { memo, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type { SeedTableDefinition } from "../../state/adminSeedData";
import { formatCountdown, formatDurationMmSs } from "../../utils/time";
import { PaginationControls } from "../pagination/PaginationControls";
import { usePagination } from "../pagination/usePagination";

const PAGE_SIZE = 12;
type MenuIcon = "grid" | "stack" | "check" | "trend" | "table" | "file" | "arrow";
interface MenuItem {
  id: string;
  label: string;
  icon: MenuIcon;
  badge?: number;
}
interface MenuSection {
  label: string;
  items: MenuItem[];
}

const MENU_SECTIONS: MenuSection[] = [
  {
    label: "Admin",
    items: [
      { id: "overview", label: "Overview", icon: "grid" },
      { id: "moderation", label: "Moderation", icon: "stack", badge: 3 },
      { id: "synthesis", label: "Synthesis", icon: "check" },
      { id: "sizing", label: "T-shirt sizing", icon: "trend" },
      { id: "tables", label: "Tables", icon: "table" },
    ],
  },
  {
    label: "Artifacts",
    items: [
      { id: "themes", label: "Themes view", icon: "table" },
      { id: "all-artifacts", label: "All artifacts", icon: "file" },
      { id: "roadmap", label: "Roadmap", icon: "arrow" },
    ],
  },
];

type PipelineState = "idle" | "running" | "awaiting-sizing" | "completed";
interface ModerationItem {
  id: number;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
}
interface ThemeShell {
  id: number;
  name: string;
  signal: number;
  phase: "building-tonight" | "roadmap-phase-2";
}

const INITIAL_MODERATION_QUEUE: ModerationItem[] = [
  {
    id: 1,
    title: "Potential duplicate asks on repayment timeline widget",
    detail: "3 submissions appear near-identical and need keep/remove decision.",
    severity: "medium",
  },
  {
    id: 2,
    title: "Outlier request: remove audit trail export",
    detail: "Flagged for policy risk. Requires moderator confirmation before synthesis.",
    severity: "high",
  },
  {
    id: 3,
    title: "Unclear comments attribution for servicing escalation flow",
    detail: "Participant role is missing; hold until reviewed.",
    severity: "low",
  },
];

const PIPELINE_STEPS = [
  "Ingest moderated signal set",
  "Cluster narratives into draft themes",
  "Generate artifacts and impact notes",
  "Pause for T-shirt sizing confirmation",
  "Publish roadmap, themes, and artifact pack",
] as const;

const THEME_SHELLS: ThemeShell[] = [
  { id: 1, name: "I can clear queue friction before noon", signal: 87, phase: "building-tonight" },
  { id: 2, name: "I can trust exception handoffs across teams", signal: 79, phase: "building-tonight" },
  { id: 3, name: "I can see what changed without hunting", signal: 66, phase: "roadmap-phase-2" },
  { id: 4, name: "I can explain portfolio risk in one view", signal: 58, phase: "roadmap-phase-2" },
];

const ROADMAP_ITEMS = [
  { rank: 1, title: "Queue-focused triage lane with role cues", horizon: "Tonight" },
  { rank: 2, title: "Guided exception checkpoints on servicing flow", horizon: "Tonight" },
  { rank: 3, title: "One-click evidence bundle for approvals", horizon: "30-day" },
  { rank: 4, title: "Cross-screen ownership timeline and drift alerts", horizon: "30-day" },
  { rank: 5, title: "Portfolio narrative board for executive review", horizon: "90-day" },
  { rank: 6, title: "Adaptive AI recommendations with confidence bands", horizon: "90-day" },
] as const;

interface SystemAdministratorPageProps {
  tables: SeedTableDefinition[];
  featureRequestCount: number;
  screenFeedbackCount: number;
  kudosCount: number;
  totalFeatureVotes: number;
  readinessThreshold: number;
  onReadinessThresholdChange: (next: number) => void;
  wallInputOpen: boolean;
  onWallInputOpenChange: (next: boolean) => void;
  mobileQrActive: boolean;
  onMobileQrActiveChange: (next: boolean) => void;
  themesAutoSwitch: boolean;
  onThemesAutoSwitchChange: (next: boolean) => void;
  closeTimeLocal: string;
  onCloseTimeLocalChange: (next: string) => void;
  synthesisCountdownTarget: string;
  synthesisCountdownRunning: boolean;
  synthesisCountdownHasStarted: boolean;
  synthesisCountdownInitialSeconds: number;
  onReseed: () => Promise<void>;
  reseeding: boolean;
  dataSource: "db" | "flat";
  dbEngine?: "sqlite" | "postgres" | null;
  onBackToDashboard: () => void;
}

export const SystemAdministratorPage = memo(({
  tables,
  featureRequestCount,
  screenFeedbackCount,
  kudosCount,
  totalFeatureVotes,
  readinessThreshold,
  onReadinessThresholdChange,
  wallInputOpen,
  onWallInputOpenChange,
  mobileQrActive,
  onMobileQrActiveChange,
  themesAutoSwitch,
  onThemesAutoSwitchChange,
  closeTimeLocal,
  onCloseTimeLocalChange,
  synthesisCountdownTarget,
  synthesisCountdownRunning,
  synthesisCountdownHasStarted,
  synthesisCountdownInitialSeconds,
  onReseed,
  reseeding,
  dataSource,
  dbEngine = null,
  onBackToDashboard,
}: SystemAdministratorPageProps): JSX.Element => {
  const [tableId, setTableId] = useState(tables[0]?.id ?? "");
  const [page, setPage] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState<string>("overview");
  const [moderationQueue, setModerationQueue] = useState<ModerationItem[]>(INITIAL_MODERATION_QUEUE);
  const [pipelineState, setPipelineState] = useState<PipelineState>("idle");
  const [pipelineStepIndex, setPipelineStepIndex] = useState(-1);
  const [sizingConfirmed, setSizingConfirmed] = useState(false);
  const [artifactPreviewOpen, setArtifactPreviewOpen] = useState(false);
  const [synthesisCountdown, setSynthesisCountdown] = useState(() =>
    synthesisCountdownHasStarted ? formatCountdown(synthesisCountdownTarget) : formatDurationMmSs(synthesisCountdownInitialSeconds),
  );

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === tableId) ?? tables[0],
    [tableId, tables],
  );

  useEffect(() => {
    if (!selectedTable && tables[0]) {
      setTableId(tables[0].id);
      setPage(1);
    }
  }, [selectedTable, tables]);

  useEffect(() => {
    if (pipelineState !== "running") {
      return;
    }

    if (pipelineStepIndex >= PIPELINE_STEPS.length - 1) {
      setPipelineState("completed");
      return;
    }

    if (pipelineStepIndex === 3 && !sizingConfirmed) {
      setPipelineState("awaiting-sizing");
      setActiveMenuId("sizing");
      return;
    }

    const timer = window.setTimeout(() => {
      setPipelineStepIndex((current) => Math.min(current + 1, PIPELINE_STEPS.length - 1));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [pipelineState, pipelineStepIndex, sizingConfirmed]);

  useEffect(() => {
    if (!synthesisCountdownRunning) {
      return;
    }
    setSynthesisCountdown(formatCountdown(synthesisCountdownTarget));
    const timer = window.setInterval(() => {
      setSynthesisCountdown(formatCountdown(synthesisCountdownTarget));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [synthesisCountdownRunning, synthesisCountdownTarget]);

  useEffect(() => {
    if (!synthesisCountdownHasStarted) {
      setSynthesisCountdown(formatDurationMmSs(synthesisCountdownInitialSeconds));
    }
  }, [synthesisCountdownHasStarted, synthesisCountdownInitialSeconds]);

  const columns = useMemo(
    () => selectedTable?.columns ?? Object.keys(selectedTable?.rows[0] ?? {}),
    [selectedTable],
  );
  const pagination = usePagination(selectedTable?.rows ?? [], page, PAGE_SIZE);

  const handleSelectTable = (id: string): void => {
    setTableId(id);
    setPage(1);
  };

  const sourceLabel =
    dataSource === "flat"
      ? "Flat Files"
      : dbEngine === "postgres"
        ? "Postgres DB"
        : "SQLite DB";
  const activeMenuLabel =
    MENU_SECTIONS.flatMap((section) => section.items).find((item) => item.id === activeMenuId)?.label ?? "View";
  const uniqueInputCount = featureRequestCount + screenFeedbackCount + kudosCount;
  const safeReadinessThreshold = Math.max(1, Math.round(readinessThreshold || 1));
  const readinessProgress = Math.min(uniqueInputCount / Math.max(readinessThreshold, 1), 1);
  const readinessMet = uniqueInputCount >= readinessThreshold;
  const readinessNear = !readinessMet && uniqueInputCount >= Math.max(0, readinessThreshold - 10);
  const readinessMissingCount = Math.max(0, safeReadinessThreshold - uniqueInputCount);
  const votesPerInput = uniqueInputCount === 0 ? 0 : totalFeatureVotes / uniqueInputCount;
  const closeTimeLabel = useMemo(() => {
    const [hoursRaw, minutesRaw] = closeTimeLocal.split(":");
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return "Set close time";
    }
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }, [closeTimeLocal]);
  const readinessStatusMessage = readinessMet
    ? `Ready — ${uniqueInputCount.toLocaleString()} inputs collected, ${safeReadinessThreshold.toLocaleString()} required.`
    : readinessNear
      ? `${uniqueInputCount.toLocaleString()} inputs — ${readinessMissingCount.toLocaleString()} more needed to reach threshold.`
      : `${uniqueInputCount.toLocaleString()} inputs collected. Minimum required: ${safeReadinessThreshold.toLocaleString()}.`;

  const handleThresholdInput = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = Number(event.target.value);
    if (Number.isNaN(next)) {
      return;
    }
    onReadinessThresholdChange(Math.max(1, Math.round(next)));
  };
  const moderationRemaining = moderationQueue.length;
  const queueIsClear = moderationRemaining === 0;
  const canRunPipeline = queueIsClear;

  const handleModerationAction = (id: number): void => {
    setModerationQueue((current) => current.filter((item) => item.id !== id));
  };

  const runSynthesisPipeline = (): void => {
    if (!canRunPipeline) {
      return;
    }
    setSizingConfirmed(false);
    setArtifactPreviewOpen(false);
    setPipelineStepIndex(0);
    setPipelineState("running");
    setActiveMenuId("synthesis");
  };

  const confirmSizing = (): void => {
    setSizingConfirmed(true);
    setPipelineState("running");
    setActiveMenuId("synthesis");
  };

  return (
    <section className="sysadmin-layout">
      <aside className="sysadmin-nav">
        <div className="sysadmin-nav-brand">
          <span className="sysadmin-nav-badge">FIS</span>
          <h2>Emerald Wall</h2>
          <p>Synthesis + Artifacts</p>
        </div>
        <div className="sysadmin-nav-groups">
          {MENU_SECTIONS.map((section) => (
            <section key={section.label} className="sysadmin-nav-section">
              <h3>{section.label}</h3>
              <div className="sysadmin-nav-list">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`sysadmin-nav-item ${activeMenuId === item.id ? "is-active" : ""}`}
                    onClick={() => setActiveMenuId(item.id)}
                  >
                    <span className={`sysadmin-nav-icon is-${item.icon}`} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.badge ? <span className="sysadmin-nav-badge-count">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>

      <section className={`sysadmin-shell ${activeMenuId === "tables" ? "" : "is-single-panel"}`}>
        {activeMenuId === "tables" ? (
          <>
            <aside className="sysadmin-sidebar">
              <div className="sysadmin-block-title">Tables</div>
              <div className="sysadmin-table-list">
                {tables.map((table) => {
                  const columnCount = table.columns?.length ?? Object.keys(table.rows[0] ?? {}).length;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      className={`sysadmin-table-item ${table.id === selectedTable?.id ? "is-active" : ""}`}
                      onClick={() => handleSelectTable(table.id)}
                    >
                      <div>
                        <div className="sysadmin-table-name">{table.label}</div>
                        <div className="sysadmin-table-meta">{columnCount} columns</div>
                      </div>
                      <span className="sysadmin-table-count">{table.rows.length}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <article className="sysadmin-main">
              {!selectedTable ? (
                <div className="sysadmin-empty">No seed tables available.</div>
              ) : (
                <>
                  <header className="sysadmin-main-head">
                    <div>
                      <p className="sysadmin-block-title">Seed Data</p>
                      <h2>{selectedTable.label}</h2>
                      <p>{selectedTable.rows.length} rows in canonical seed snapshot.</p>
                      <p className="sysadmin-source">Source: {sourceLabel}</p>
                    </div>
                    <div className="sysadmin-head-actions">
                      <button type="button" className="secondary-btn" onClick={onBackToDashboard}>
                        Back to Dashboard
                      </button>
                      <button type="button" className="secondary-btn" onClick={() => void onReseed()} disabled={reseeding}>
                        {reseeding ? "Reseeding..." : "Reseed Data"}
                      </button>
                      <span className="sysadmin-page-pill">Page {pagination.page} of {pagination.totalPages}</span>
                    </div>
                  </header>

                  <div className="sysadmin-grid-wrap">
                    <table className="sysadmin-grid">
                      <thead>
                        <tr>
                          {columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageItems.length === 0 ? (
                          <tr>
                            <td colSpan={Math.max(columns.length, 1)}>No rows</td>
                          </tr>
                        ) : (
                          pagination.pageItems.map((row, rowIndex) => (
                            <tr key={`${selectedTable.id}-${pagination.startItem + rowIndex}`}>
                              {columns.map((column) => (
                                <td key={column}>{String(row[column] ?? "")}</td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <footer className="sysadmin-footer">
                    <span>Showing {pagination.startItem}-{pagination.endItem} of {pagination.totalItems}</span>
                    <PaginationControls
                      page={pagination.page}
                      totalPages={pagination.totalPages}
                      onPageChange={setPage}
                    />
                  </footer>
                </>
              )}
            </article>
          </>
        ) : activeMenuId === "overview" ? (
          <article className="sysadmin-main sysadmin-overview">
            <header className="sysadmin-main-head sysadmin-overview-head">
              <div>
                <h2>Overview</h2>
                <p>Live input counts and session controls for Day 1.</p>
              </div>
              <div className="sysadmin-head-actions">
                <button type="button" className="secondary-btn" onClick={onBackToDashboard}>
                  Back to Dashboard
                </button>
              </div>
            </header>

            <section className="sysadmin-overview-metrics" aria-label="Live input counts">
              <article className="sysadmin-metric-card is-feature">
                <p>Feature Requests</p>
                <strong>{featureRequestCount.toLocaleString()}</strong>
                <span>deduplicated submissions</span>
              </article>
              <article className="sysadmin-metric-card is-feedback">
                <p>Screen Feedback</p>
                <strong>{screenFeedbackCount.toLocaleString()}</strong>
                <span>captured across active screens</span>
              </article>
              <article className="sysadmin-metric-card is-kudos">
                <p>Comments</p>
                <strong>{kudosCount.toLocaleString()}</strong>
                <span>total appreciations submitted</span>
              </article>
              <article className="sysadmin-metric-card is-votes">
                <p>Total Votes Cast</p>
                <strong>{totalFeatureVotes.toLocaleString()}</strong>
                <span>{votesPerInput.toFixed(1)} votes per input</span>
              </article>
            </section>

            <section className="sysadmin-overview-grid">
              <article className="sysadmin-control-card">
                <h3>Session controls</h3>
                <div className="sysadmin-toggle-row">
                  <div>
                    <p>Wall input window</p>
                    <span>Participants at the kiosk</span>
                  </div>
                  <button
                    type="button"
                    className={`sysadmin-toggle ${wallInputOpen ? "is-on" : ""}`}
                    aria-pressed={wallInputOpen}
                    onClick={() => onWallInputOpenChange(!wallInputOpen)}
                  >
                    <span />
                  </button>
                </div>
                <div className="sysadmin-toggle-row">
                  <div>
                    <p>Mobile QR window</p>
                    <span>Closes at {closeTimeLabel} today</span>
                  </div>
                  <div className="sysadmin-inline-controls">
                    <span className="sysadmin-time-pill">{closeTimeLabel}</span>
                    <button
                      type="button"
                      className={`sysadmin-toggle ${mobileQrActive ? "is-on" : ""}`}
                      aria-pressed={mobileQrActive}
                      onClick={() => onMobileQrActiveChange(!mobileQrActive)}
                    >
                      <span />
                    </button>
                  </div>
                </div>
                <div className="sysadmin-toggle-row">
                  <div>
                    <p>Themes view on wall</p>
                    <span>Auto-switches after synthesis</span>
                  </div>
                  <button
                    type="button"
                    className={`sysadmin-toggle ${themesAutoSwitch ? "is-on" : ""}`}
                    aria-pressed={themesAutoSwitch}
                    onClick={() => onThemesAutoSwitchChange(!themesAutoSwitch)}
                  >
                    <span />
                  </button>
                </div>
                <div className="sysadmin-session-fields">
                  <label className="sysadmin-field">
                    <span>Minimum inputs before synthesis can begin</span>
                    <input
                      type="number"
                      min={1}
                      value={safeReadinessThreshold}
                      onChange={handleThresholdInput}
                    />
                    <small>Readiness checks use this value as the required minimum.</small>
                  </label>
                  <label className="sysadmin-field">
                    <span>Stop accepting inputs at (local timezone)</span>
                    <input
                      type="time"
                      value={closeTimeLocal}
                      onChange={(event) => onCloseTimeLocalChange(event.target.value)}
                    />
                    <small>Current close time: {closeTimeLabel}</small>
                  </label>
                </div>
              </article>

              <article className="sysadmin-control-card sysadmin-readiness-card">
                <h3>Synthesis readiness</h3>
                <div
                  className={`sysadmin-readiness-bar ${
                    readinessMet ? "is-ready" : readinessNear ? "is-near" : "is-low"
                  }`}
                  role="img"
                  aria-label={`Readiness ${Math.round(readinessProgress * 100)} percent`}
                >
                  <span style={{ width: `${Math.round(readinessProgress * 100)}%` }} />
                </div>
                <p className={`sysadmin-readiness-text ${readinessMet ? "is-ready" : readinessNear ? "is-near" : ""}`}>
                  {readinessStatusMessage}
                </p>
              </article>
            </section>
          </article>
        ) : activeMenuId === "moderation" ? (
          <article className="sysadmin-main sysadmin-shell-page">
            <header className="sysadmin-main-head">
              <div>
                <p className="sysadmin-block-title">Moderation Queue</p>
                <h2>Flagged items</h2>
                <p>{moderationRemaining} items require keep/remove decisions.</p>
              </div>
              <div className="sysadmin-head-actions">
                <button type="button" className="secondary-btn" onClick={onBackToDashboard}>
                  Back to Dashboard
                </button>
              </div>
            </header>
            <div className="sysadmin-shell-stack">
              {moderationQueue.length === 0 ? (
                <div className="sysadmin-shell-empty">Queue clear. Synthesis may proceed.</div>
              ) : (
                moderationQueue.map((item) => (
                  <article key={item.id} className="sysadmin-moderation-item">
                    <div>
                      <span className={`sysadmin-chip is-${item.severity}`}>{item.severity}</span>
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </div>
                    <div className="sysadmin-inline-actions">
                      <button type="button" className="secondary-btn" onClick={() => handleModerationAction(item.id)}>
                        Keep
                      </button>
                      <button type="button" className="secondary-btn" onClick={() => handleModerationAction(item.id)}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))
              )}
              <p className={`sysadmin-status-note ${queueIsClear ? "is-good" : "is-warn"}`}>
                {queueIsClear
                  ? "Moderation queue cleared. The synthesis engine is ready."
                  : "Synthesis should wait until the moderation queue is clear."}
              </p>
            </div>
          </article>
        ) : activeMenuId === "synthesis" ? (
          <article className="sysadmin-main sysadmin-shell-page">
            <header className="sysadmin-main-head">
              <div>
                <p className="sysadmin-block-title">Synthesis Engine</p>
                <h2>5-step pipeline</h2>
                <p>Run synthesis to watch pipeline progress in real time.</p>
              </div>
              <div className="sysadmin-head-actions">
                <button type="button" className="secondary-btn" onClick={runSynthesisPipeline} disabled={!canRunPipeline}>
                  Run synthesis
                </button>
              </div>
            </header>
            <div className="sysadmin-shell-stack">
              <article className="sysadmin-control-card sysadmin-synthesis-countdown-card">
                <h3>Synthesis Countdown</h3>
                <p className="sysadmin-synthesis-countdown-value">{synthesisCountdown}</p>
                <span className="sysadmin-synthesis-countdown-help">
                  Preserved synthesis timer, now managed from this section.
                </span>
              </article>
              <ol className="sysadmin-pipeline-list">
                {PIPELINE_STEPS.map((step, index) => {
                  const isDone = pipelineStepIndex > index || (pipelineState === "completed" && pipelineStepIndex >= index);
                  const isActive = pipelineStepIndex === index && (pipelineState === "running" || pipelineState === "awaiting-sizing");
                  const isPaused = pipelineState === "awaiting-sizing" && index === 3;
                  return (
                    <li
                      key={step}
                      className={`sysadmin-pipeline-step ${isDone ? "is-done" : ""} ${isActive ? "is-active" : ""} ${isPaused ? "is-paused" : ""}`}
                    >
                      <span className="sysadmin-pipeline-index">{index + 1}</span>
                      <div>
                        <h3>{step}</h3>
                        <p>
                          {isPaused
                            ? "Paused for sizing confirmation."
                            : isDone
                              ? "Completed."
                              : isActive
                                ? "Running..."
                                : "Waiting."}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className={`sysadmin-status-note ${canRunPipeline ? "is-good" : "is-warn"}`}>
                {canRunPipeline
                  ? pipelineState === "awaiting-sizing"
                    ? "Pipeline paused at step 4. Confirm T-shirt sizes to continue."
                    : pipelineState === "completed"
                      ? "Pipeline complete. All 5 steps finished."
                      : "Queue is clear. Pipeline can run."
                  : "Moderation queue has open items. Clear the queue before synthesis runs."}
              </p>
            </div>
          </article>
        ) : activeMenuId === "sizing" ? (
          <article className="sysadmin-main sysadmin-shell-page">
            <header className="sysadmin-main-head">
              <div>
                <p className="sysadmin-block-title">Step 4 Handoff</p>
                <h2>T-shirt sizing</h2>
                <p>The synthesis pipeline pauses here for human confirmation.</p>
              </div>
              <div className="sysadmin-head-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={confirmSizing}
                  disabled={pipelineState !== "awaiting-sizing"}
                >
                  Confirm sizes
                </button>
              </div>
            </header>
            <div className="sysadmin-shell-stack">
              <div className="sysadmin-sizing-table">
                <div className="sysadmin-sizing-row is-head">
                  <span>Theme</span>
                  <span>AI size</span>
                  <span>Human size</span>
                  <span>Status</span>
                </div>
                <div className="sysadmin-sizing-row">
                  <span>Theme 1</span>
                  <span>L</span>
                  <span>L</span>
                  <span>Aligned</span>
                </div>
                <div className="sysadmin-sizing-row">
                  <span>Theme 2</span>
                  <span>M</span>
                  <span>M</span>
                  <span>Aligned</span>
                </div>
                <div className="sysadmin-sizing-row">
                  <span>Theme 3</span>
                  <span>S</span>
                  <span>M</span>
                  <span>Adjusted</span>
                </div>
                <div className="sysadmin-sizing-row is-flagged">
                  <span>Theme 4</span>
                  <span>XL</span>
                  <span>L</span>
                  <span>AI-vs-human override flagged</span>
                </div>
              </div>
              <p className={`sysadmin-status-note ${pipelineState === "awaiting-sizing" ? "is-warn" : "is-good"}`}>
                {pipelineState === "awaiting-sizing"
                  ? "Step 4 is paused. Confirm sizes to resume step 5."
                  : pipelineState === "completed"
                    ? "Sizes confirmed. Step 5 is complete."
                    : "Run synthesis to enter the step 4 sizing pause point."}
              </p>
            </div>
          </article>
        ) : activeMenuId === "themes" ? (
          <article className="sysadmin-main sysadmin-shell-page">
            <header className="sysadmin-main-head">
              <div>
                <p className="sysadmin-block-title">Themes View</p>
                <h2>Client-voice themes</h2>
                <p>Signal-weighted cards with execution phase badges.</p>
              </div>
            </header>
            <div className="sysadmin-theme-grid">
              {THEME_SHELLS.map((theme) => (
                <article key={theme.id} className="sysadmin-theme-card">
                  <div className="sysadmin-theme-head">
                    <h3>{theme.name}</h3>
                    <span className={`sysadmin-chip ${theme.phase === "building-tonight" ? "is-good" : "is-neutral"}`}>
                      {theme.phase}
                    </span>
                  </div>
                  <div className="sysadmin-theme-bar">
                    <span style={{ width: `${theme.signal}%` }} />
                  </div>
                  <p>{theme.signal}% signal strength</p>
                </article>
              ))}
            </div>
          </article>
        ) : activeMenuId === "all-artifacts" ? (
          <article className="sysadmin-main sysadmin-shell-page">
            <header className="sysadmin-main-head">
              <div>
                <p className="sysadmin-block-title">All Artifacts</p>
                <h2>Output package status</h2>
                <p>Document previews and synthesis outputs in one place.</p>
              </div>
            </header>
            <div className="sysadmin-shell-stack">
              <div className="sysadmin-artifact-list">
                {[
                  { id: "doc-1", label: "Document 1 · Because you said cards", status: "ready" },
                  { id: "doc-2", label: "Document 2 · Ranked roadmap", status: "ready" },
                  { id: "doc-3", label: "Document 3 · Theme narratives", status: "draft" },
                  { id: "doc-4", label: "Document 4 · Moderator audit log", status: "ready" },
                  { id: "doc-5", label: "Document 5 · Execution handoff packet", status: "building" },
                ].map((artifact) => (
                  <button
                    key={artifact.id}
                    type="button"
                    className={`sysadmin-artifact-item ${artifact.id === "doc-1" && artifactPreviewOpen ? "is-active" : ""}`}
                    onClick={() => setArtifactPreviewOpen(artifact.id === "doc-1")}
                  >
                    <span>{artifact.label}</span>
                    <span className={`sysadmin-chip is-${artifact.status === "ready" ? "good" : artifact.status === "draft" ? "warn" : "neutral"}`}>
                      {artifact.status}
                    </span>
                  </button>
                ))}
              </div>
              {artifactPreviewOpen && (
                <section className="sysadmin-artifact-preview">
                  <h3>Document 1 preview · Because you said</h3>
                  <div className="sysadmin-preview-cards">
                    <article>
                      <h4>Because you said:</h4>
                      <p>"I lose time verifying who owns exceptions at each stage."</p>
                    </article>
                    <article>
                      <h4>We built tonight:</h4>
                      <p>Owner trail panel with timestamped handoff evidence.</p>
                    </article>
                    <article>
                      <h4>Impact:</h4>
                      <p>Faster queue decisions and clearer audit readiness.</p>
                    </article>
                  </div>
                </section>
              )}
            </div>
          </article>
        ) : activeMenuId === "roadmap" ? (
          <article className="sysadmin-main sysadmin-shell-page">
            <header className="sysadmin-main-head">
              <div>
                <p className="sysadmin-block-title">Roadmap</p>
                <h2>Ranked implementation plan</h2>
                <p>Tonight, 30-day, and 90-day execution horizons.</p>
              </div>
            </header>
            <ol className="sysadmin-roadmap-list">
              {ROADMAP_ITEMS.map((item) => (
                <li key={item.rank}>
                  <span className="sysadmin-roadmap-rank">#{item.rank}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.horizon}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="sysadmin-roadmap-signoff">
              "We heard you, we built with you, and tonight we move the workflow forward together."
            </p>
          </article>
        ) : (
          <article className="sysadmin-main">
            <header className="sysadmin-main-head">
              <div>
                <p className="sysadmin-block-title">System Admin</p>
                <h2>{activeMenuLabel}</h2>
                <p>This section is available in navigation and ready for future content.</p>
              </div>
              <div className="sysadmin-head-actions">
                <button type="button" className="secondary-btn" onClick={onBackToDashboard}>
                  Back to Dashboard
                </button>
              </div>
            </header>
          </article>
        )}
      </section>
    </section>
  );
});
