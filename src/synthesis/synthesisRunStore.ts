export const SYNTHESIS_PHASE1_ANALYSIS_KEY = "synthesisPhase1Analysis";

export type SynthesisP0Item = {
  title: string;
  rationale: string;
  feasibilityNote: string | null;
  evidenceSources: string[];
};

export type SynthesisPhase1Analysis = {
  p0Items: SynthesisP0Item[];
};

const parsePhase1Analysis = (value: unknown): SynthesisPhase1Analysis | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<SynthesisPhase1Analysis>;
  if (!Array.isArray(row.p0Items)) return null;
  const p0Items = row.p0Items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<SynthesisP0Item>;
      if (typeof candidate.title !== "string" || typeof candidate.rationale !== "string") return null;
      return {
        title: candidate.title.trim(),
        rationale: candidate.rationale.trim(),
        feasibilityNote:
          candidate.feasibilityNote == null ? null : String(candidate.feasibilityNote).trim() || null,
        evidenceSources: Array.isArray(candidate.evidenceSources)
          ? candidate.evidenceSources.map((source) => String(source ?? "").trim()).filter(Boolean)
          : [],
      } satisfies SynthesisP0Item;
    })
    .filter((item): item is SynthesisP0Item => item != null && item.title.length > 0);

  return { p0Items };
};

export const readSynthesisPhase1Analysis = (): SynthesisPhase1Analysis | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SYNTHESIS_PHASE1_ANALYSIS_KEY);
  if (!raw) return null;
  try {
    return parsePhase1Analysis(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writeSynthesisPhase1Analysis = (analysis: SynthesisPhase1Analysis): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SYNTHESIS_PHASE1_ANALYSIS_KEY, JSON.stringify(analysis));
};
