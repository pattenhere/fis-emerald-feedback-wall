import { memo, useEffect, useMemo, useState } from "react";
import type { SeedTableDefinition } from "../../state/adminSeedData";
import { PaginationControls } from "../pagination/PaginationControls";
import { usePagination } from "../pagination/usePagination";

const PAGE_SIZE = 12;

interface SystemAdministratorPageProps {
  tables: SeedTableDefinition[];
  onReseed: () => Promise<void>;
  reseeding: boolean;
  dataSource: "db" | "flat";
  onBackToDashboard: () => void;
}

export const SystemAdministratorPage = memo(({
  tables,
  onReseed,
  reseeding,
  dataSource,
  onBackToDashboard,
}: SystemAdministratorPageProps): JSX.Element => {
  const [tableId, setTableId] = useState(tables[0]?.id ?? "");
  const [page, setPage] = useState(1);

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

  const columns = useMemo(
    () => selectedTable?.columns ?? Object.keys(selectedTable?.rows[0] ?? {}),
    [selectedTable],
  );
  const pagination = usePagination(selectedTable?.rows ?? [], page, PAGE_SIZE);

  const handleSelectTable = (id: string): void => {
    setTableId(id);
    setPage(1);
  };

  return (
    <section className="sysadmin-shell">
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
                <p className="sysadmin-source">Source: {dataSource === "db" ? "SQLite DB" : "Flat Files"}</p>
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
    </section>
  );
});
