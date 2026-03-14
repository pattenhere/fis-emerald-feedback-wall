import { memo, useMemo, useState } from "react";
import { ADMIN_SEED_TABLES } from "../../state/adminSeedData";
import { PaginationControls } from "../pagination/PaginationControls";
import { usePagination } from "../pagination/usePagination";

const PAGE_SIZE = 12;

export const SystemAdministratorPage = memo((): JSX.Element => {
  const [tableId, setTableId] = useState(ADMIN_SEED_TABLES[0]?.id ?? "");
  const [page, setPage] = useState(1);

  const selectedTable = useMemo(
    () => ADMIN_SEED_TABLES.find((table) => table.id === tableId) ?? ADMIN_SEED_TABLES[0],
    [tableId],
  );

  const columns = useMemo(() => Object.keys(selectedTable?.rows[0] ?? {}), [selectedTable]);
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
          {ADMIN_SEED_TABLES.map((table) => {
            const columnCount = Object.keys(table.rows[0] ?? {}).length;
            return (
              <button
                key={table.id}
                type="button"
                className={`sysadmin-table-item ${table.id === selectedTable.id ? "is-active" : ""}`}
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
        <header className="sysadmin-main-head">
          <div>
            <p className="sysadmin-block-title">Seed Data</p>
            <h2>{selectedTable.label}</h2>
            <p>{selectedTable.rows.length} rows in canonical seed snapshot.</p>
          </div>
          <span className="sysadmin-page-pill">Page {pagination.page} of {pagination.totalPages}</span>
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
              {pagination.pageItems.map((row, rowIndex) => (
                <tr key={`${selectedTable.id}-${pagination.startItem + rowIndex}`}>
                  {columns.map((column) => (
                    <td key={column}>{String(row[column] ?? "")}</td>
                  ))}
                </tr>
              ))}
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
      </article>
    </section>
  );
});
