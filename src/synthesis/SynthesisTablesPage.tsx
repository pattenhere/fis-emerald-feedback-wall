import { useCallback, useEffect, useMemo, useState } from "react";
import { dataApi, type BootstrapResponse } from "../services/dataApi";
import { greeterApi, type GreeterSessionRecord } from "../services/greeterApi";
import type { SeedTableDefinition } from "../state/adminSeedData";

type TablesTabId = "seed" | "database";

type BootstrapAppArea = BootstrapResponse["appAreas"][number];
type BootstrapProduct = BootstrapResponse["products"][number];
type BootstrapScreen = BootstrapResponse["screens"][number];
type BootstrapFeatureRequest = BootstrapResponse["featureRequests"][number];
type BootstrapScreenFeedback = BootstrapResponse["screenFeedback"][number];
type BootstrapKudos = BootstrapResponse["kudosQuotes"][number];

interface SeedSectionProps {
  title: string;
  count: number;
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  children: JSX.Element;
}

const LOAD_ERROR_MESSAGE = "Failed to load data.";
const PAGE_SIZE = 10;

const coerceNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const truncateText = (value: unknown, maxLength: number): { display: string; full?: string } => {
  const text = value == null ? "" : String(value);
  if (text.length <= maxLength) return { display: text };
  return {
    display: `${text.slice(0, maxLength - 1)}…`,
    full: text,
  };
};

const formatLocalTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return `${parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} · ${parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
};

const isTimestampKey = (key: string): boolean => /(created|updated|submitted|revealed|opened|closed|start|end|cutoff|time|date|_at)$/i.test(key);

const isTimestampLike = (key: string, value: string): boolean => {
  if (!isTimestampKey(key)) return false;
  if (value.trim().length < 8) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime());
};

const seedScreenAreaSlug = (screen: BootstrapScreen): string => {
  const possible = [
    (screen as { screenCategory?: unknown }).screenCategory,
    (screen as { app?: unknown }).app,
    (screen as { appArea?: unknown }).appArea,
  ];
  const slug = possible.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof slug === "string" ? slug : "";
};

const resolveAppSectionLabel = (slug: string, labelBySlug: Map<string, string>): string => {
  if (!slug) return "—";
  return labelBySlug.get(slug) ?? slug;
};

const formatCellValue = (key: string, value: unknown): { display: string; full?: string; mono: boolean } => {
  if (value == null) return { display: "—", mono: false };
  if (typeof value === "boolean") return { display: value ? "Yes" : "No", mono: false };
  if (typeof value === "number") return { display: value.toLocaleString(), full: String(value), mono: true };
  if (typeof value === "string") {
    if (isTimestampLike(key, value)) {
      return { display: formatLocalTimestamp(value), full: value, mono: false };
    }
    const truncated = truncateText(value, 80);
    return { display: truncated.display || "—", full: truncated.full ?? value, mono: true };
  }
  try {
    const serialized = JSON.stringify(value);
    const truncated = truncateText(serialized, 80);
    return { display: truncated.display || "—", full: truncated.full ?? serialized, mono: true };
  } catch {
    return { display: "—", mono: false };
  }
};

const deriveTableColumns = (table: SeedTableDefinition): string[] => {
  if (Array.isArray(table.columns) && table.columns.length > 0) return table.columns;
  const keys = new Set<string>();
  for (const row of table.rows) {
    Object.keys(row ?? {}).forEach((key) => keys.add(key));
  }
  return Array.from(keys);
};

const toTotalPages = (rowCount: number): number => Math.max(1, Math.ceil(rowCount / PAGE_SIZE));

const clampPage = (page: number, rowCount: number): number => {
  const max = toTotalPages(rowCount);
  if (!Number.isFinite(page) || page < 1) return 1;
  if (page > max) return max;
  return Math.floor(page);
};

const paginateRows = <T,>(rows: T[], page: number): T[] => {
  const safePage = clampPage(page, rows.length);
  const start = (safePage - 1) * PAGE_SIZE;
  return rows.slice(start, start + PAGE_SIZE);
};

const PaginationControls = ({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
}): JSX.Element | null => {
  if (totalPages <= 1) return null;
  return (
    <div className="synthesis-tables-pagination">
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        Next
      </button>
    </div>
  );
};

const SeedSection = ({ title, count, page, totalPages, onPageChange, children }: SeedSectionProps): JSX.Element => (
  <details className="synthesis-tables-section">
    <summary>
      <span>{title}</span>
      <strong>({count})</strong>
    </summary>
    <div className="synthesis-tables-section-body">
      {children}
      <PaginationControls page={page} totalPages={totalPages} onPageChange={(nextPage) => onPageChange(clampPage(nextPage, count))} />
    </div>
  </details>
);

export const SynthesisTablesPage = (): JSX.Element => {
  const [activeTab, setActiveTab] = useState<TablesTabId>("seed");
  const [bootstrapData, setBootstrapData] = useState<BootstrapResponse | null>(null);
  const [tables, setTables] = useState<SeedTableDefinition[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [seedPages, setSeedPages] = useState<Record<string, number>>({});
  const [dbPages, setDbPages] = useState<Record<string, number>>({});
  const [greeterSessions, setGreeterSessions] = useState<GreeterSessionRecord[]>([]);
  const [greeterTotal, setGreeterTotal] = useState(0);

  const loadData = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const [bootstrapPayload, adminTables, greeterSessionsResult] = await Promise.all([
        dataApi.getBootstrap(),
        dataApi.getAdminTables(),
        greeterApi.getSessions().catch(() => ({ sessions: [], total: 0 })),
      ]);
      setBootstrapData(bootstrapPayload);
      setTables(adminTables);
      setGreeterSessions(
        (Array.isArray(greeterSessionsResult.sessions) ? greeterSessionsResult.sessions : [])
          .slice()
          .sort((a, b) => new Date(String(b.completed_at ?? "")).getTime() - new Date(String(a.completed_at ?? "")).getTime()),
      );
      setGreeterTotal(Math.max(0, Number(greeterSessionsResult.total ?? 0)));
      setLastLoadedAt(new Date());
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0
        ? error.message
        : LOAD_ERROR_MESSAGE;
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const appAreas = bootstrapData?.appAreas ?? [];
  const products = bootstrapData?.products ?? [];
  const screens = bootstrapData?.screens ?? [];
  const featureRequests = bootstrapData?.featureRequests ?? [];
  const screenFeedback = bootstrapData?.screenFeedback ?? [];
  const kudosQuotes = bootstrapData?.kudosQuotes ?? [];

  const appAreaLabelBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const area of appAreas) {
      map.set(String(area.id), String(area.label));
    }
    return map;
  }, [appAreas]);

  const screenById = useMemo(() => {
    const map = new Map<string, BootstrapScreen>();
    for (const screen of screens) {
      map.set(String(screen.id), screen);
    }
    return map;
  }, [screens]);

  const appSections = useMemo(() => {
    return appAreas.map((area: BootstrapAppArea) => {
      const slug = String(area.id);
      const screenCount = screens.filter((screen) => seedScreenAreaSlug(screen) === slug).length;
      return {
        name: String(area.label),
        slug,
        screenCount,
      };
    });
  }, [appAreas, screens]);
  const pagedAppSections = useMemo(
    () => paginateRows(appSections, seedPages["app-sections"] ?? 1),
    [appSections, seedPages],
  );

  const featureRequestsByVotes = useMemo(() => {
    return featureRequests
      .slice()
      .sort((a: BootstrapFeatureRequest, b: BootstrapFeatureRequest) => coerceNumber(b.votes) - coerceNumber(a.votes));
  }, [featureRequests]);
  const pagedProducts = useMemo(() => paginateRows(products, seedPages.products ?? 1), [products, seedPages]);
  const pagedScreens = useMemo(() => paginateRows(screens, seedPages.screens ?? 1), [screens, seedPages]);
  const pagedFeatureRequests = useMemo(
    () => paginateRows(featureRequestsByVotes, seedPages["feature-requests"] ?? 1),
    [featureRequestsByVotes, seedPages],
  );
  const pagedScreenFeedback = useMemo(
    () => paginateRows(screenFeedback, seedPages["screen-feedback"] ?? 1),
    [screenFeedback, seedPages],
  );
  const pagedKudos = useMemo(() => paginateRows(kudosQuotes, seedPages.kudos ?? 1), [kudosQuotes, seedPages]);
  const pagedGreeterSessions = useMemo(
    () => paginateRows(greeterSessions, seedPages["greeter-sessions"] ?? 1),
    [greeterSessions, seedPages],
  );

  const tableSummary = useMemo(() => {
    const totalRows = tables.reduce((sum, table) => sum + table.rows.length, 0);
    return {
      tables: tables.length,
      rows: totalRows,
    };
  }, [tables]);

  const filteredTables = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    if (!normalized) return tables;
    return tables.filter((table) => table.id.toLowerCase().includes(normalized));
  }, [filter, tables]);

  const lastLoadedLabel = lastLoadedAt ? formatLocalTimestamp(lastLoadedAt.toISOString()) : "--";

  const renderSeedTableState = (rows: unknown[], emptyMessage: string, table: JSX.Element): JSX.Element => {
    if (rows.length === 0) {
      return <p className="synthesis-tables-empty">{emptyMessage}</p>;
    }
    return table;
  };

  const renderLoading = loading && !bootstrapData && tables.length === 0;
  const setSeedPage = useCallback((key: string, nextPage: number, rowCount: number): void => {
    setSeedPages((current) => ({ ...current, [key]: clampPage(nextPage, rowCount) }));
  }, []);
  const setDbPage = useCallback((key: string, nextPage: number, rowCount: number): void => {
    setDbPages((current) => ({ ...current, [key]: clampPage(nextPage, rowCount) }));
  }, []);

  return (
    <section className="synthesis-tables-page">
      <header className="synthesis-page-card synthesis-tables-header">
        <div>
          <h2>Data inspection</h2>
          <p>Read-only validation of startup seed content and live database rows.</p>
          <p className="synthesis-tables-last-loaded">Last loaded: {lastLoadedLabel}</p>
        </div>
        <button
          type="button"
          className="synthesis-tables-refresh"
          onClick={() => {
            void loadData(true);
          }}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="synthesis-page-card synthesis-tables-tabs" role="tablist" aria-label="Data inspection tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "seed"}
          className={activeTab === "seed" ? "is-active" : ""}
          onClick={() => setActiveTab("seed")}
        >
          Seed data
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "database"}
          className={activeTab === "database" ? "is-active" : ""}
          onClick={() => setActiveTab("database")}
        >
          Database tables
        </button>
      </div>

      {error && <p className="synthesis-page-card synthesis-tables-error">{error}</p>}

      {renderLoading ? (
        <section className="synthesis-page-card synthesis-tables-loading" aria-live="polite">
          <p>Loading data...</p>
          <div className="synthesis-tables-loading-row" aria-hidden="true" />
          <div className="synthesis-tables-loading-row" aria-hidden="true" />
          <div className="synthesis-tables-loading-row" aria-hidden="true" />
        </section>
      ) : activeTab === "seed" ? (
        <div className="synthesis-tables-seed-grid">
          <SeedSection
            title="App sections"
            count={appSections.length}
            page={clampPage(seedPages["app-sections"] ?? 1, appSections.length)}
            totalPages={toTotalPages(appSections.length)}
            onPageChange={(nextPage) => setSeedPage("app-sections", nextPage, appSections.length)}
          >
            {renderSeedTableState(
              appSections,
              "No app sections loaded.",
              <div className="synthesis-tables-scroll-wrap">
                <table className="synthesis-data-table">
                  <thead>
                    <tr>
                      <th>Area name</th>
                      <th>Slug</th>
                      <th>Screen count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAppSections.map((section) => (
                      <tr key={section.slug}>
                        <td>{section.name}</td>
                        <td className="is-mono">{section.slug}</td>
                        <td>{section.screenCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>,
            )}
          </SeedSection>

          <SeedSection
            title="Products"
            count={products.length}
            page={clampPage(seedPages.products ?? 1, products.length)}
            totalPages={toTotalPages(products.length)}
            onPageChange={(nextPage) => setSeedPage("products", nextPage, products.length)}
          >
            {renderSeedTableState(
              products,
              "No products loaded.",
              <div className="synthesis-tables-scroll-wrap">
                <table className="synthesis-data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Subcategory</th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedProducts.map((product: BootstrapProduct) => (
                      <tr key={String(product.id)}>
                        <td className="is-mono">{String(product.id)}</td>
                        <td>{String(product.name)}</td>
                        <td>{product.status ? String(product.status) : "—"}</td>
                        <td>{String(product.subcategory ?? "—")}</td>
                        <td>{String(product.category ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>,
            )}
          </SeedSection>

          <SeedSection
            title="Screens"
            count={screens.length}
            page={clampPage(seedPages.screens ?? 1, screens.length)}
            totalPages={toTotalPages(screens.length)}
            onPageChange={(nextPage) => setSeedPage("screens", nextPage, screens.length)}
          >
            {renderSeedTableState(
              screens,
              "No screens loaded.",
              <div className="synthesis-tables-scroll-wrap">
                <table className="synthesis-data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>App section</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedScreens.map((screen: BootstrapScreen) => {
                      const description = truncateText(screen.description ?? "", 60);
                      const appSlug = seedScreenAreaSlug(screen);
                      return (
                        <tr key={String(screen.id)}>
                          <td className="is-mono">{String(screen.id)}</td>
                          <td>{String(screen.name)}</td>
                          <td>{resolveAppSectionLabel(appSlug, appAreaLabelBySlug)}</td>
                          <td title={description.full ?? undefined}>{description.display || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>,
            )}
          </SeedSection>

          <SeedSection
            title="Seed feature requests"
            count={featureRequestsByVotes.length}
            page={clampPage(seedPages["feature-requests"] ?? 1, featureRequestsByVotes.length)}
            totalPages={toTotalPages(featureRequestsByVotes.length)}
            onPageChange={(nextPage) => setSeedPage("feature-requests", nextPage, featureRequestsByVotes.length)}
          >
            {renderSeedTableState(
              featureRequestsByVotes,
              "No seed feature requests loaded.",
              <div className="synthesis-tables-scroll-wrap">
                <table className="synthesis-data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Title</th>
                      <th>Votes</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedFeatureRequests.map((request: BootstrapFeatureRequest) => {
                      const title = truncateText(request.title, 80);
                      return (
                        <tr key={String(request.id)}>
                          <td className="is-mono">{String(request.id)}</td>
                          <td title={title.full ?? undefined}>{title.display || "—"}</td>
                          <td>{coerceNumber(request.votes).toLocaleString()}</td>
                          <td>{request.status ? String(request.status) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>,
            )}
          </SeedSection>

          <SeedSection
            title="Seed screen feedback"
            count={screenFeedback.length}
            page={clampPage(seedPages["screen-feedback"] ?? 1, screenFeedback.length)}
            totalPages={toTotalPages(screenFeedback.length)}
            onPageChange={(nextPage) => setSeedPage("screen-feedback", nextPage, screenFeedback.length)}
          >
            {renderSeedTableState(
              screenFeedback,
              "No seed screen feedback loaded.",
              <div className="synthesis-tables-scroll-wrap">
                <table className="synthesis-data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Screen name</th>
                      <th>App section</th>
                      <th>Type</th>
                      <th>Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedScreenFeedback.map((entry: BootstrapScreenFeedback) => {
                      const text = truncateText(entry.text ?? "", 60);
                      const screen = entry.screenId != null ? screenById.get(String(entry.screenId)) : undefined;
                      const appSlug = typeof entry.app === "string" && entry.app.trim().length > 0
                        ? entry.app
                        : screen
                          ? seedScreenAreaSlug(screen)
                          : "";
                      const resolvedScreenName = String(entry.screenName ?? screen?.name ?? "—");
                      return (
                        <tr key={String(entry.id)}>
                          <td className="is-mono">{String(entry.id)}</td>
                          <td>{resolvedScreenName}</td>
                          <td>{resolveAppSectionLabel(appSlug, appAreaLabelBySlug)}</td>
                          <td>{String(entry.type ?? "—")}</td>
                          <td title={text.full ?? undefined}>{text.display || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>,
            )}
          </SeedSection>

          <SeedSection
            title="Seed kudos"
            count={kudosQuotes.length}
            page={clampPage(seedPages.kudos ?? 1, kudosQuotes.length)}
            totalPages={toTotalPages(kudosQuotes.length)}
            onPageChange={(nextPage) => setSeedPage("kudos", nextPage, kudosQuotes.length)}
          >
            {renderSeedTableState(
              kudosQuotes,
              "No seed kudos loaded.",
              <div className="synthesis-tables-scroll-wrap">
                <table className="synthesis-data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Text</th>
                      <th>Role</th>
                      <th>Consent public</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedKudos.map((quote: BootstrapKudos) => {
                      const text = truncateText(quote.text, 80);
                      return (
                        <tr key={String(quote.id)}>
                          <td className="is-mono">{String(quote.id)}</td>
                          <td title={text.full ?? undefined}>{text.display || "—"}</td>
                          <td>{String(quote.role ?? "—")}</td>
                          <td>{quote.consentPublic ? "Yes" : "No"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>,
            )}
          </SeedSection>

          <SeedSection
            title="Greeter sessions"
            count={greeterTotal}
            page={clampPage(seedPages["greeter-sessions"] ?? 1, greeterSessions.length)}
            totalPages={toTotalPages(greeterSessions.length)}
            onPageChange={(nextPage) => setSeedPage("greeter-sessions", nextPage, greeterSessions.length)}
          >
            {renderSeedTableState(
              greeterSessions,
              "No greeter sessions recorded for this event yet.",
              <div className="synthesis-tables-scroll-wrap">
                <table className="synthesis-data-table">
                  <thead>
                    <tr>
                      <th>Completed</th>
                      <th>Q1</th>
                      <th>Q2</th>
                      <th>Q3</th>
                      <th>Q4</th>
                      <th>Primary route</th>
                      <th>Secondary route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedGreeterSessions.map((session) => (
                      <tr key={String(session.session_id)}>
                        <td>{formatLocalTimestamp(session.completed_at)}</td>
                        <td>{session.answer_q1 ?? "—"}</td>
                        <td>{session.answer_q2 ?? "—"}</td>
                        <td>{session.answer_q3 ?? "—"}</td>
                        <td>{session.answer_q4 ?? "—"}</td>
                        <td>{[session.primary_category, session.primary_title].filter(Boolean).join(" · ") || "—"}</td>
                        <td>{[session.secondary_category, session.secondary_title].filter(Boolean).join(" · ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>,
            )}
          </SeedSection>
        </div>
      ) : (
        <div className="synthesis-tables-db-grid">
          <section className="synthesis-page-card synthesis-tables-summary-bar">
            <strong>{tableSummary.tables.toLocaleString()} tables</strong>
            <span>·</span>
            <strong>{tableSummary.rows.toLocaleString()} total rows</strong>
          </section>

          <section className="synthesis-page-card synthesis-tables-filter">
            <label htmlFor="synthesis-table-filter">Filter tables by name</label>
            <div className="synthesis-tables-filter-input-wrap">
              <input
                id="synthesis-table-filter"
                type="text"
                placeholder="Search table name"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setFilter("")}
                disabled={filter.length === 0}
                aria-label="Clear table name filter"
              >
                Clear
              </button>
            </div>
          </section>

          <section className="synthesis-tables-db-list">
            {filteredTables.map((table) => {
              const columns = deriveTableColumns(table);
              return (
                <details key={table.id} className="synthesis-db-panel">
                  <summary>
                    <strong>{table.id}</strong>
                    <span>{table.rows.length.toLocaleString()} rows</span>
                    <span>{columns.length.toLocaleString()} columns</span>
                  </summary>
                  <div className="synthesis-tables-section-body">
                    {table.rows.length === 0 ? (
                      <p className="synthesis-tables-empty">No rows in this table.</p>
                    ) : (
                      <div className="synthesis-tables-scroll-wrap">
                        {(() => {
                          const page = clampPage(dbPages[table.id] ?? 1, table.rows.length);
                          const pagedRows = paginateRows(table.rows, page);
                          return (
                            <>
                        <table className="synthesis-data-table synthesis-db-data-table">
                          <thead>
                            <tr>
                              {columns.map((column) => (
                                <th key={`${table.id}-column-${column}`}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pagedRows.map((row, rowIndex) => (
                              <tr key={`${table.id}-row-${(page - 1) * PAGE_SIZE + rowIndex}`}>
                                {columns.map((column) => {
                                  const formatted = formatCellValue(column, row?.[column]);
                                  return (
                                    <td
                                      key={`${table.id}-row-${(page - 1) * PAGE_SIZE + rowIndex}-${column}`}
                                      className={formatted.mono || column.toLowerCase().includes("id") ? "is-mono" : undefined}
                                      title={formatted.full}
                                    >
                                      {formatted.display}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <PaginationControls
                          page={page}
                          totalPages={toTotalPages(table.rows.length)}
                          onPageChange={(nextPage) => setDbPage(table.id, nextPage, table.rows.length)}
                        />
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}

            {filteredTables.length === 0 && (
              <p className="synthesis-page-card synthesis-tables-empty">No tables match this filter.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
};
