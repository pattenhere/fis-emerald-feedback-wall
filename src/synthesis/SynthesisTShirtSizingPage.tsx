import { useCallback, useEffect, useMemo, useState } from "react";
import type { SynthesisP0Item } from "./synthesisRunStore";
import { TShirtSizingCard } from "./tshirt/TShirtSizingCard";
import { TShirtSizingTotalsBar } from "./tshirt/TShirtSizingTotalsBar";
import { readTShirtSizingResults, writeTShirtSizingResults } from "./tshirt/sizingResultsStore";
import type { SizingResult, TShirtSizingState } from "./tshirt/types";
import { synthesisModuleApi } from "../services/synthesisModuleApi";
import { patchAdminBootstrapCache } from "./adminBootstrapCache";

const SIZE_LEGEND = [
  { size: "XS", label: "Less than 1 hour" },
  { size: "S", label: "1-3 hours" },
  { size: "M", label: "3-6 hours" },
  { size: "L", label: "More than 6 hours" },
];
const MAX_OVERNIGHT_P0_ITEMS = 2;

export const SynthesisTShirtSizingPage = (): JSX.Element => {
  const [p0Items, setP0Items] = useState<SynthesisP0Item[]>([]);
  const [sizingByTitle, setSizingByTitle] = useState<Record<string, TShirtSizingState>>({});
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      synthesisModuleApi.getLatestPhase1Analysis(),
      synthesisModuleApi.getLatestTShirtSizing().catch(() => ({ sizing: null })),
    ])
      .then(([payload, sizingPayload]) => {
        const persisted =
          sizingPayload?.sizing ??
          readTShirtSizingResults();
        const persistedMap = new Map<string, SizingResult>();
        for (const row of persisted?.results ?? []) {
          if (!persistedMap.has(row.p0ItemTitle)) persistedMap.set(row.p0ItemTitle, row);
        }
        const p0Candidates = (payload.phase1Analysis?.p0Items ?? [])
          .map((item) => ({
            title: String(item.title ?? "").trim(),
            rationale: String(item.rationale ?? "").trim(),
            feasibilityNote: item.feasibilityNote == null ? null : String(item.feasibilityNote),
            evidenceSources: Array.isArray(item.evidenceSources)
              ? item.evidenceSources.map((entry) => String(entry ?? "").trim()).filter(Boolean)
              : [],
          }))
          .filter((item) => item.title.length > 0)
          .slice(0, MAX_OVERNIGHT_P0_ITEMS);
        const nextSizingByTitle = Object.fromEntries(
          p0Candidates.map((item) => {
            const persistedRow = persistedMap.get(item.title);
            return [
              item.title,
              {
                size: persistedRow?.size ?? null,
                notes: persistedRow?.notes ?? "",
                aiEstimate: persistedRow?.aiEstimate ?? null,
              } satisfies TShirtSizingState,
            ];
          }),
        ) as Record<string, TShirtSizingState>;
        setP0Items(p0Candidates);
        setSizingByTitle(nextSizingByTitle);
        setLastSavedAt(persisted?.savedAt ?? null);
        console.log(
          `[tshirt-sizing] Loaded ${p0Candidates.length} P0 items from Phase 1 analysis (max ${MAX_OVERNIGHT_P0_ITEMS}).`,
        );
      })
      .catch(() => {
        const persisted = readTShirtSizingResults();
        setP0Items([]);
        setSizingByTitle({});
        setLastSavedAt(persisted?.savedAt ?? null);
      });
  }, []);

  const hasP0Items = p0Items.length > 0;
  const sizingRows = useMemo(
    () =>
      p0Items.map((item) => {
        const row = sizingByTitle[item.title] ?? { size: null, notes: "", aiEstimate: null };
        return {
          p0ItemTitle: item.title,
          size: row.size,
          notes: row.notes,
          aiEstimate: row.aiEstimate,
          savedAt: lastSavedAt ?? "",
        } satisfies SizingResult;
      }),
    [lastSavedAt, p0Items, sizingByTitle],
  );

  const updateSizingState = useCallback((title: string, patch: Partial<TShirtSizingState>): void => {
    setSizingByTitle((current) => ({
      ...current,
      [title]: {
        size: "size" in patch ? (patch.size ?? null) : current[title]?.size ?? null,
        notes: "notes" in patch ? (patch.notes ?? "") : current[title]?.notes ?? "",
        aiEstimate: "aiEstimate" in patch ? (patch.aiEstimate ?? null) : current[title]?.aiEstimate ?? null,
      },
    }));
  }, []);

  const handleSaveSizing = useCallback(async (payload: { results: SizingResult[]; savedAt: string }): Promise<void> => {
    const nextRows = payload.results.map((row) => ({ ...row, savedAt: payload.savedAt }));
    const nextPayload = { results: nextRows, savedAt: payload.savedAt };
    await synthesisModuleApi.saveLatestTShirtSizing(nextPayload);
    writeTShirtSizingResults(nextPayload);
    patchAdminBootstrapCache({ latestTShirtSizing: nextPayload });
    setLastSavedAt(payload.savedAt);
    console.log("[tshirt-sizing] Saved results shape:", nextPayload);
  }, []);

  return (
    <section className="synthesis-tshirt-page">
      <header className="synthesis-page-card synthesis-tshirt-header">
        <h2>T-shirt sizing</h2>
        <p>
          Estimate overnight build effort for P0 candidates. Results are used to determine what gets built and what gets deferred.
        </p>
      </header>

      <section className="synthesis-page-card synthesis-tshirt-legend">
        <div className="synthesis-tshirt-legend-badges">
          {SIZE_LEGEND.map((entry) => (
            <div key={entry.size} className="synthesis-tshirt-legend-badge">
              <strong>{entry.size}</strong>
              <span>{entry.label}</span>
            </div>
          ))}
        </div>
        <p className="synthesis-tshirt-budget-copy">Total overnight budget: 8 hours across all items.</p>
      </section>

      {!hasP0Items ? (
        <section className="synthesis-page-card synthesis-tshirt-empty">
          <p>No P0 candidates found. Run synthesis first to generate items for sizing.</p>
          <a href="/facilitator/synthesis/run">Go to Run synthesis →</a>
        </section>
      ) : (
        <section className="synthesis-tshirt-card-list">
          {p0Items.map((item, index) => (
            <div key={`${item.title}::${index}`} className="synthesis-page-card synthesis-tshirt-card-shell">
              <TShirtSizingCard
                item={item}
                size={sizingByTitle[item.title]?.size ?? null}
                notes={sizingByTitle[item.title]?.notes ?? ""}
                aiEstimate={sizingByTitle[item.title]?.aiEstimate ?? null}
                alreadySizedItems={sizingRows.map((row) => ({
                  title: row.p0ItemTitle,
                  size: row.size,
                }))}
                onSizeChange={(size) => updateSizingState(item.title, { size })}
                onNotesChange={(notes) => updateSizingState(item.title, { notes })}
                onAIEstimateChange={(aiEstimate) => updateSizingState(item.title, { aiEstimate })}
              />
            </div>
          ))}
        </section>
      )}

      {hasP0Items ? (
        <TShirtSizingTotalsBar
          results={sizingRows}
          totalItems={p0Items.length}
          lastSavedAt={lastSavedAt}
          onSave={handleSaveSizing}
        />
      ) : null}
    </section>
  );
};
