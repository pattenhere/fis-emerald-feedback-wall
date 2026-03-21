import { useEffect, useState } from "react";
import type { SynthesisParameters, SynthesisParametersPatch } from "./types";

type OutputControlsSectionProps = {
  parameters: SynthesisParameters;
  readinessThreshold: number;
  disabledStates: {
    p0FocusOnly: boolean;
    emphasiseQuotes: boolean;
  };
  onPatch: (patch: SynthesisParametersPatch) => void;
};

export const OutputControlsSection = ({
  parameters,
  readinessThreshold,
  disabledStates,
  onPatch,
}: OutputControlsSectionProps): JSX.Element => {
  const [maxQuotesDraft, setMaxQuotesDraft] = useState(String(parameters.maxQuotes || 6));
  const [maxQuotesError, setMaxQuotesError] = useState<string | null>(null);
  const disableFullOutputOption = disabledStates.p0FocusOnly && parameters.p0FocusOnly;
  const disableP0OutputOption = disabledStates.p0FocusOnly && !parameters.p0FocusOnly;

  useEffect(() => {
    setMaxQuotesDraft(String(parameters.maxQuotes || 6));
  }, [parameters.maxQuotes]);

  return (
    <div className="synthesis-params-group">
      <article className="synthesis-params-card">
        <h4>Output focus</h4>
        <div className="synthesis-params-radio-list" role="radiogroup" aria-label="Output focus">
          <label className="synthesis-params-radio-row">
            <input
              type="radio"
              name="output-focus"
              checked={!parameters.p0FocusOnly}
              disabled={disableFullOutputOption}
              onChange={() => onPatch({ p0FocusOnly: false })}
            />
            <span>
              <strong>Full output</strong>
              <small>P0, P1, P2, patterns, and quotes.</small>
            </span>
          </label>
          <label className="synthesis-params-radio-row">
            <input
              type="radio"
              name="output-focus"
              checked={parameters.p0FocusOnly}
              disabled={disableP0OutputOption}
              onChange={() => onPatch({ p0FocusOnly: true })}
            />
            <span>
              <strong>P0 focus only</strong>
              <small>P0 and patterns only. P1, P2, and quotes suppressed. Recommended for ceremony.</small>
            </span>
          </label>
        </div>
      </article>

      <article className="synthesis-params-card">
        <div className="synthesis-params-row">
          <label htmlFor="quotes-toggle">Emphasise marketing-safe quotes</label>
          <input
            id="quotes-toggle"
            type="checkbox"
            checked={parameters.emphasiseQuotes}
            disabled={disabledStates.emphasiseQuotes}
            onChange={(event) => {
              const checked = event.target.checked;
              if (!checked) {
                onPatch({ emphasiseQuotes: false });
                return;
              }
              const parsed = Number(maxQuotesDraft);
              const nextMax = Number.isInteger(parsed) && parsed >= 3 && parsed <= 10 ? parsed : 6;
              setMaxQuotesDraft(String(nextMax));
              onPatch({ emphasiseQuotes: true, maxQuotes: nextMax });
            }}
          />
        </div>
        <p className="synthesis-params-helper">
          Increases verbatim consent-approved quotes in roadmap output. Only public-safe quotes are used.
        </p>
        {parameters.emphasiseQuotes && (
          <div className="synthesis-params-inline">
            <label htmlFor="max-quotes">Maximum quotes to include</label>
            <input
              id="max-quotes"
              type="number"
              min={3}
              max={10}
              step={1}
              value={maxQuotesDraft}
              onChange={(event) => {
                setMaxQuotesError(null);
                const next = event.target.value;
                setMaxQuotesDraft(next);
                const parsed = Number(next);
                if (Number.isInteger(parsed) && parsed >= 3 && parsed <= 10) {
                  onPatch({ maxQuotes: parsed });
                }
              }}
              onBlur={() => {
                const parsed = Number(maxQuotesDraft);
                if (!Number.isInteger(parsed) || parsed < 3 || parsed > 10) {
                  setMaxQuotesError("Must be 3–10.");
                  return;
                }
              }}
            />
          </div>
        )}
        {maxQuotesError && <p className="synthesis-params-error">{maxQuotesError}</p>}
      </article>

      <article className="synthesis-params-card">
        <h4>Readiness threshold</h4>
        <p className="synthesis-params-readonly">{readinessThreshold}</p>
        <p className="synthesis-params-helper">
          Minimum inputs before synthesis is recommended. Shown on the Run synthesis readiness bar.
        </p>
        <a className="synthesis-params-link" href="/admin/session-config">
          Edit in Session config →
        </a>
      </article>
    </div>
  );
};
