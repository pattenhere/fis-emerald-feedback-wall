import { memo, useEffect, useState } from "react";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const PaginationControls = memo(({
  page,
  totalPages,
  onPageChange,
}: PaginationControlsProps): JSX.Element => {
  const [jumpValue, setJumpValue] = useState(String(page));

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  const disabledPrev = page <= 1;
  const disabledNext = page >= totalPages;

  return (
    <div className="pagination-controls">
      <button
        type="button"
        className="secondary-btn"
        disabled={disabledPrev}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <span className="pagination-page">Page {page} / {totalPages}</span>
      <button
        type="button"
        className="secondary-btn"
        disabled={disabledNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
      <label className="pagination-jump">
        Jump
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(event) => setJumpValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const next = Number(jumpValue);
            if (Number.isFinite(next)) {
              onPageChange(Math.max(1, Math.min(totalPages, next)));
            }
          }}
        />
      </label>
    </div>
  );
});
