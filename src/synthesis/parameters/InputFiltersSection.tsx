import { useEffect, useMemo, useState } from "react";
import type { AppArea } from "../../types/domain";
import type { SynthesisParameters, SynthesisParametersPatch } from "./types";

type AppSectionOption = { id: AppArea; label: string };

type InputFiltersSectionProps = {
  parameters: SynthesisParameters;
  appSections: AppSectionOption[];
  disabledStates: {
    excludeLowSignal: boolean;
    upweightSection: boolean;
  };
  onPatch: (patch: SynthesisParametersPatch) => void;
};

export const InputFiltersSection = ({
  parameters,
  appSections,
  disabledStates,
  onPatch,
}: InputFiltersSectionProps): JSX.Element => {
  const [excludeDraft, setExcludeDraft] = useState(
    parameters.excludeBelowN == null ? "3" : String(parameters.excludeBelowN),
  );
  const [excludeError, setExcludeError] = useState<string | null>(null);
  const [multiplierDraft, setMultiplierDraft] = useState(String(parameters.upweightMultiplier || 2));
  const [multiplierError, setMultiplierError] = useState<string | null>(null);
  const [competingEachDraft, setCompetingEachDraft] = useState(String(parameters.competingMinEach));
  const [competingEachError, setCompetingEachError] = useState<string | null>(null);
  const [ratioDraft, setRatioDraft] = useState(String(Math.round(parameters.competingMinSplitRatio * 100)));
  const [ratioError, setRatioError] = useState<string | null>(null);

  useEffect(() => {
    setExcludeDraft(parameters.excludeBelowN == null ? "3" : String(parameters.excludeBelowN));
  }, [parameters.excludeBelowN]);

  useEffect(() => {
    setMultiplierDraft(String(parameters.upweightMultiplier || 2));
  }, [parameters.upweightMultiplier]);

  useEffect(() => {
    setCompetingEachDraft(String(parameters.competingMinEach));
  }, [parameters.competingMinEach]);

  useEffect(() => {
    setRatioDraft(String(Math.round(parameters.competingMinSplitRatio * 100)));
  }, [parameters.competingMinSplitRatio]);

  const isExcludeEnabled = parameters.excludeBelowN != null;
  const isUpweightEnabled = parameters.upweightSection != null;
  const showMultiplierWarning = Number(multiplierDraft) > 2;
  const ratioPercentLabel = useMemo(() => {
    const value = Number(ratioDraft);
    if (!Number.isFinite(value)) return "";
    return `${Math.round(value)}%`;
  }, [ratioDraft]);

  return (
    <div className="synthesis-params-group">
      <article className="synthesis-params-card">
        <div className="synthesis-params-row">
          <label htmlFor="exclude-toggle">Exclude low-signal screens</label>
          <input
            id="exclude-toggle"
            type="checkbox"
            checked={isExcludeEnabled}
            disabled={disabledStates.excludeLowSignal}
            onChange={(event) => {
              const checked = event.target.checked;
              setExcludeError(null);
              if (!checked) {
                onPatch({ excludeBelowN: null });
                return;
              }
              const nextValue = Number(excludeDraft || "3");
              const normalized = Number.isInteger(nextValue) && nextValue >= 1 && nextValue <= 10 ? nextValue : 3;
              setExcludeDraft(String(normalized));
              onPatch({ excludeBelowN: normalized });
            }}
          />
        </div>
        <p className="synthesis-params-helper">
          Screens with fewer than N submissions are excluded from synthesis. They are noted in the output but not analysed.
        </p>
        {isExcludeEnabled && (
          <div className="synthesis-params-inline">
            <label htmlFor="exclude-n">N</label>
            <input
              id="exclude-n"
              className="synthesis-params-number-input"
              type="number"
              min={1}
              max={10}
              step={1}
              value={excludeDraft}
              onChange={(event) => {
                setExcludeError(null);
                const next = event.target.value;
                setExcludeDraft(next);
                const parsed = Number(next);
                if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 10) {
                  onPatch({ excludeBelowN: parsed });
                }
              }}
              onBlur={() => {
                const parsed = Number(excludeDraft);
                if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
                  setExcludeError("Must be between 1 and 10.");
                  return;
                }
                setExcludeDraft(String(parsed));
              }}
            />
          </div>
        )}
        {isExcludeEnabled && excludeError && <p className="synthesis-params-error">{excludeError}</p>}
      </article>

      <article className="synthesis-params-card">
        <div className="synthesis-params-row">
          <label htmlFor="upweight-toggle">Upweight an app section</label>
          <input
            id="upweight-toggle"
            type="checkbox"
            checked={isUpweightEnabled}
            disabled={disabledStates.upweightSection}
            onChange={(event) => {
              const checked = event.target.checked;
              if (!checked) {
                onPatch({ upweightSection: null });
                return;
              }
              const first = appSections[0]?.id ?? null;
              const multiplierValue = Number(multiplierDraft);
              const nextMultiplier =
                Number.isInteger(multiplierValue) && multiplierValue >= 2 && multiplierValue <= 4 ? multiplierValue : 2;
              setMultiplierDraft(String(nextMultiplier));
              onPatch({
                upweightSection: parameters.upweightSection ?? first,
                upweightMultiplier: nextMultiplier,
              });
            }}
          />
        </div>
        <p className="synthesis-params-helper">
          Screen feedback from this section appears N times in the synthesis payload, increasing its weight.
        </p>
        {isUpweightEnabled && (
          <div className="synthesis-params-grid">
            <label>
              Section
              <select
                value={parameters.upweightSection ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value as AppArea;
                  onPatch({ upweightSection: nextValue || null });
                }}
              >
                <option value="">Select a section...</option>
                {appSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Multiplier
              <input
                className="synthesis-params-number-input"
                type="number"
                min={2}
                max={4}
                step={1}
                value={multiplierDraft}
                onChange={(event) => {
                  setMultiplierError(null);
                  const next = event.target.value;
                  setMultiplierDraft(next);
                  const parsed = Number(next);
                  if (Number.isInteger(parsed) && parsed >= 2 && parsed <= 4) {
                    onPatch({ upweightMultiplier: parsed });
                  }
                }}
                onBlur={() => {
                  const parsed = Number(multiplierDraft);
                  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 4) {
                    setMultiplierError("Must be between 2 and 4.");
                    return;
                  }
                  setMultiplierDraft(String(parsed));
                }}
              />
            </label>
          </div>
        )}
        {showMultiplierWarning && (
          <p className="synthesis-params-warning">High multipliers may skew output. Recommended: 2.</p>
        )}
        {isUpweightEnabled && multiplierError && <p className="synthesis-params-error">{multiplierError}</p>}
      </article>

      <article className="synthesis-params-card">
        <h4>Competing perspectives detection</h4>
        <div className="synthesis-params-competing-grid">
          <div className="synthesis-params-field-row">
            <div className="synthesis-params-field-copy">
              <label htmlFor="competing-min-each">Minimum submissions per polarity</label>
              <small>Both polarities need at least this many submissions for a screen to be flagged.</small>
              {competingEachError && <p className="synthesis-params-error">Must be 2–10.</p>}
            </div>
            <input
              id="competing-min-each"
              className="synthesis-params-number-input"
              type="number"
              min={2}
              max={10}
              step={1}
              value={competingEachDraft}
              onChange={(event) => {
                setCompetingEachError(null);
                const next = event.target.value;
                setCompetingEachDraft(next);
                const parsed = Number(next);
                if (Number.isInteger(parsed) && parsed >= 2 && parsed <= 10) {
                  onPatch({ competingMinEach: parsed });
                }
              }}
              onBlur={() => {
                const parsed = Number(competingEachDraft);
                if (!Number.isInteger(parsed) || parsed < 2 || parsed > 10) {
                  setCompetingEachError("invalid");
                  return;
                }
                setCompetingEachDraft(String(parsed));
              }}
            />
          </div>

          <div className="synthesis-params-field-row">
            <div className="synthesis-params-field-copy">
              <label htmlFor="competing-split-ratio">Minimum split ratio (%)</label>
              {ratioPercentLabel && <small>Interpretation: {ratioPercentLabel}</small>}
              <small>
                The minority side must represent at least this share of the majority side to flag a conflict.
              </small>
              {ratioError && <p className="synthesis-params-error">Must be 20%–100%.</p>}
            </div>
            <input
              id="competing-split-ratio"
              className="synthesis-params-number-input"
              type="number"
              min={20}
              max={100}
              step={1}
              value={ratioDraft}
              onChange={(event) => {
                setRatioError(null);
                const next = event.target.value;
                setRatioDraft(next);
                const parsed = Number(next);
                if (Number.isFinite(parsed) && parsed >= 20 && parsed <= 100) {
                  onPatch({ competingMinSplitRatio: Number((parsed / 100).toFixed(2)) });
                }
              }}
              onBlur={() => {
                const parsed = Number(ratioDraft);
                if (!Number.isFinite(parsed) || parsed < 20 || parsed > 100) {
                  setRatioError("invalid");
                  return;
                }
                setRatioDraft(String(Math.round(parsed)));
              }}
            />
          </div>
        </div>
      </article>
    </div>
  );
};
