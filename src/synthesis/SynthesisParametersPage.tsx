import type { AppArea } from "../types/domain";
import { InputFiltersSection } from "./parameters/InputFiltersSection";
import { OutputControlsSection } from "./parameters/OutputControlsSection";
import { summarizeActiveParameters } from "./parameters/summary";
import type { SynthesisParameters, SynthesisParametersPatch } from "./parameters/types";

type AppSectionOption = { id: AppArea; label: string };

type SynthesisParametersPageProps = {
  parameters: SynthesisParameters;
  readinessThreshold: number;
  appSections: AppSectionOption[];
  lastSavedAt: string | null;
  usingDefaults: boolean;
  onPatch: (patch: SynthesisParametersPatch) => void;
};

export const SynthesisParametersPage = ({
  parameters,
  readinessThreshold,
  appSections,
  lastSavedAt,
  usingDefaults,
  onPatch,
}: SynthesisParametersPageProps): JSX.Element => {
  const sectionLookup = Object.fromEntries(appSections.map((item) => [item.id, item.label])) as Record<AppArea, string>;
  const activeSummaryLines = summarizeActiveParameters(parameters, sectionLookup);
  const activeMacroCount = [
    parameters.excludeBelowN != null,
    parameters.upweightSection != null,
    parameters.p0FocusOnly,
    parameters.emphasiseQuotes,
  ].filter(Boolean).length;
  const atMacroLimit = activeMacroCount >= 2;
  const disabledStates = {
    excludeLowSignal: atMacroLimit && parameters.excludeBelowN == null,
    upweightSection: atMacroLimit && parameters.upweightSection == null,
    p0FocusOnly: atMacroLimit,
    emphasiseQuotes: atMacroLimit && !parameters.emphasiseQuotes,
  };

  const lastSavedLabel = !lastSavedAt && usingDefaults
    ? "Using defaults."
    : lastSavedAt
      ? `Last saved: ${new Date(lastSavedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
      : "Using defaults.";

  return (
    <section className="synthesis-parameters-page">
      <header className="synthesis-page-card synthesis-parameters-header">
        <h2>Synthesis parameters</h2>
        <p>Configure how synthesis weighs and filters inputs. Settings take effect the next time synthesis runs.</p>
      </header>

      <section className="synthesis-page-card synthesis-parameters-section">
        <h3>Input filters</h3>
        <div className="synthesis-parameters-input-filters">
          <InputFiltersSection
            parameters={parameters}
            appSections={appSections}
            disabledStates={{
              excludeLowSignal: disabledStates.excludeLowSignal,
              upweightSection: disabledStates.upweightSection,
            }}
            onPatch={onPatch}
          />
        </div>
      </section>

      <section className="synthesis-page-card synthesis-parameters-section">
        <h3>Output controls</h3>
        <div
          className={`synthesis-parameters-macro-banner ${atMacroLimit ? "" : "is-hidden"}`}
          aria-hidden={!atMacroLimit}
        >
          Maximum 2 parameters active. Deactivate one to enable another.
        </div>
        <div className="synthesis-parameters-output-controls">
          <OutputControlsSection
            parameters={parameters}
            readinessThreshold={readinessThreshold}
            disabledStates={{
              p0FocusOnly: disabledStates.p0FocusOnly,
              emphasiseQuotes: disabledStates.emphasiseQuotes,
            }}
            onPatch={onPatch}
          />
        </div>
      </section>

      <section className="synthesis-page-card synthesis-parameters-summary">
        <h3>Active parameters</h3>
        <div className="synthesis-parameters-summary-content">
          {activeSummaryLines.length === 0 ? (
            <p className="empty-state">No parameters active — default synthesis behaviour.</p>
          ) : (
            <ul className="list-reset">
              {activeSummaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <p className="synthesis-parameters-saved">{lastSavedLabel}</p>
        </div>
      </section>
    </section>
  );
};
