import type { AppArea } from "../../types/domain";

export type SynthesisParameters = {
  excludeBelowN: number | null;
  upweightSection: AppArea | null;
  upweightMultiplier: number;
  p0FocusOnly: boolean;
  emphasiseQuotes: boolean;
  maxQuotes: number;
  competingMinEach: number;
  competingMinSplitRatio: number;
};

export type SynthesisParametersPatch = Partial<SynthesisParameters>;

export const DEFAULT_SYNTHESIS_PARAMETERS: SynthesisParameters = {
  excludeBelowN: null,
  upweightSection: null,
  upweightMultiplier: 2,
  p0FocusOnly: false,
  emphasiseQuotes: false,
  maxQuotes: 6,
  competingMinEach: 3,
  competingMinSplitRatio: 0.4,
};

export const countActiveMacros = (parameters: SynthesisParameters): number => {
  return [
    parameters.excludeBelowN != null,
    parameters.upweightSection != null,
    parameters.p0FocusOnly,
    parameters.emphasiseQuotes,
  ].filter(Boolean).length;
};
