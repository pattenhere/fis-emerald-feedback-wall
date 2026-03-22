export type TShirtSize = "XS" | "S" | "M" | "L";

export type AIEstimate = {
  size: TShirtSize;
  hoursEstimate: string;
  rationale: string;
  risk: string;
};

export type SizingResult = {
  p0ItemTitle: string;
  size: TShirtSize | null;
  notes: string;
  aiEstimate: AIEstimate | null;
  savedAt: string;
};

export type TShirtSizingState = {
  size: TShirtSize | null;
  notes: string;
  aiEstimate: AIEstimate | null;
};

export const SIZE_HOUR_MIDPOINTS: Record<TShirtSize, number> = {
  XS: 0.5,
  S: 2,
  M: 4.5,
  L: 8,
};
