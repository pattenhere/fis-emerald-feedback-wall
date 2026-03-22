import type { AppArea } from "../../types/domain";
import type { SynthesisParameters } from "./types";

type SectionLookup = Record<AppArea, string>;

export const summarizeActiveParameters = (
  parameters: SynthesisParameters,
  sectionLookup: SectionLookup,
): string[] => {
  const lines: string[] = [];
  if (parameters.excludeBelowN != null) {
    lines.push(`Screens with fewer than ${parameters.excludeBelowN} submissions excluded`);
  }
  if (parameters.upweightSection) {
    const sectionLabel = sectionLookup[parameters.upweightSection] ?? parameters.upweightSection;
    lines.push(`${sectionLabel} upweighted ${parameters.upweightMultiplier}\u00d7`);
  }
  if (parameters.p0FocusOnly) {
    lines.push("Output: P0 items and patterns only");
  }
  if (parameters.emphasiseQuotes) {
    lines.push(`Up to ${parameters.maxQuotes} marketing quotes included`);
  }
  return lines;
};
