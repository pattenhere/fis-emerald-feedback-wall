import { useEffect, useMemo, useState } from "react";
import { SIZE_HOUR_MIDPOINTS, type SizingResult } from "./types";

type TShirtSizingTotalsBarStatus = "green" | "amber" | "red";

export type TShirtSizingTotalsBarProps = {
  results: SizingResult[];
  totalItems: number;
  lastSavedAt?: string | null;
  onSave: (payload: { results: SizingResult[]; savedAt: string }) => void | Promise<void>;
};

const formatSavedTime = (savedAt?: string | null): string | null => {
  if (!savedAt) return null;
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getStatus = (hours: number): { status: TShirtSizingTotalsBarStatus; label: string } => {
  if (hours <= 6) return { status: "green", label: "Within budget" };
  if (hours <= 8) return { status: "amber", label: "Near limit" };
  return { status: "red", label: "Over budget — consider deferring an item" };
};

export const TShirtSizingTotalsBar = ({
  results,
  totalItems,
  lastSavedAt,
  onSave,
}: TShirtSizingTotalsBarProps): JSX.Element => {
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedConfirmation, setShowSavedConfirmation] = useState(false);

  const sizedResults = useMemo(() => results.filter((result) => result.size != null), [results]);

  const sizedCount = sizedResults.length;
  const estimatedHours = useMemo(
    () =>
      sizedResults.reduce((sum, result) => {
        if (!result.size) return sum;
        return sum + (SIZE_HOUR_MIDPOINTS[result.size] ?? 0);
      }, 0),
    [sizedResults],
  );

  const status = getStatus(estimatedHours);
  const lastSavedLabel = formatSavedTime(lastSavedAt);

  useEffect(() => {
    if (!showSavedConfirmation) return undefined;
    const timeoutId = window.setTimeout(() => setShowSavedConfirmation(false), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [showSavedConfirmation]);

  const handleSave = async () => {
    if (sizedCount === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const savedAt = new Date().toISOString();
      await Promise.resolve(onSave({ results, savedAt }));
      setShowSavedConfirmation(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="synthesis-tshirt-totals-bar" role="region" aria-label="T-shirt sizing totals">
      <div className="synthesis-tshirt-totals-bar__summary">
        <div className="synthesis-tshirt-totals-bar__counts">
          <strong>
            {sizedCount} of {totalItems} items sized
          </strong>
          <span>Estimated total: {estimatedHours.toFixed(1)}h</span>
        </div>

        <div className={`synthesis-tshirt-totals-bar__status synthesis-tshirt-totals-bar__status--${status.status}`}>
          <span className="synthesis-tshirt-totals-bar__status-dot" aria-hidden="true" />
          <span>{status.label}</span>
        </div>
      </div>

      <div className="synthesis-tshirt-totals-bar__actions">
        <div className="synthesis-tshirt-totals-bar__save-meta" aria-live="polite">
          {showSavedConfirmation ? (
            <span className="synthesis-tshirt-totals-bar__saved-confirmation">Saved</span>
          ) : lastSavedLabel ? (
            <span>Last saved: {lastSavedLabel}</span>
          ) : (
            <span>Not yet saved.</span>
          )}
        </div>

        <button
          type="button"
          className="synthesis-tshirt-totals-bar__save-button"
          onClick={handleSave}
          disabled={sizedCount === 0 || isSaving}
        >
          {isSaving ? "Saving..." : "Save sizing"}
        </button>
      </div>
    </div>
  );
};
