import { aiCall } from "../../api/aiCall";
import { AI_PROVIDER_CONFIG } from "../../config/aiProvider";
import type { AIEstimate, TShirtSize } from "./types";

export type TShirtSizingEstimateInput = {
  title: string;
  rationale: string;
  evidenceSources: string[];
  feasibilityNote: string;
  alreadySizedItems: Array<{ title: string; size: TShirtSize }>;
  hoursRemaining: number;
};

const SYSTEM_PROMPT = [
  "You estimate software build effort for overnight conference prototypes.",
  "Sizes: XS < 1h, S 1-3h, M 3-6h, L > 6h. Total overnight budget: 8 hours.",
  "Output ONLY valid JSON. No prose. No markdown.",
  'Schema: {"size":"XS"|"S"|"M"|"L","hours_estimate":"string","rationale":"string max 30 words","risk":"string max 20 words"}',
].join(" ");

const VALID_SIZES: TShirtSize[] = ["XS", "S", "M", "L"];

const truncate = (value: string, maxLength: number): string => {
  const normalized = String(value ?? "").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const USER_PROMPT_TEMPLATE = (input: TShirtSizingEstimateInput): string =>
  [
    `Item: ${input.title}`,
    `Why selected: ${truncate(input.rationale, 200)}`,
    `Evidence: ${input.evidenceSources.join(", ") || "none"}`,
    input.feasibilityNote ? `Feasibility: ${input.feasibilityNote}` : "",
    `Hours remaining in 8h budget: ${input.hoursRemaining}h`,
    input.alreadySizedItems.length > 0
      ? `Already allocated: ${input.alreadySizedItems.map((item) => `${item.title} (${item.size})`).join(", ")}`
      : "",
    "Output the JSON object only.",
  ].join("\n");

const normalizeTShirtSize = (value: unknown): TShirtSize | null => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/gu, "");
  if (raw === "XS" || raw === "XSMALL" || raw === "EXTRASMALL") return "XS";
  if (raw === "S" || raw === "SMALL") return "S";
  if (raw === "M" || raw === "MEDIUM") return "M";
  if (raw === "L" || raw === "LARGE") return "L";
  return null;
};

const extractJsonPayload = (content: string): string => {
  const trimmed = String(content ?? "").trim();
  if (!trimmed) {
    throw new Error("AI response was empty.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const objectMatch = candidate.match(/\{[\s\S]*\}/u);
  return (objectMatch?.[0] ?? candidate).trim();
};

export const parseTShirtAIEstimate = (content: string): AIEstimate => {
  const payload = JSON.parse(extractJsonPayload(content)) as Partial<
    Record<keyof AIEstimate, unknown> & { hours_estimate?: unknown }
  >;
  const size = normalizeTShirtSize(payload.size);
  const hoursEstimate = String(payload.hours_estimate ?? payload.hoursEstimate ?? "").trim();
  const rationale = String(payload.rationale ?? "").trim();
  const risk = String(payload.risk ?? "").trim();

  if (!size || !VALID_SIZES.includes(size)) {
    throw new Error("AI response missing a valid size.");
  }
  if (!hoursEstimate || !rationale || !risk) {
    throw new Error("AI response missing required fields.");
  }

  return {
    size,
    hoursEstimate,
    rationale,
    risk,
  };
};

export async function estimateTShirtSizing(input: TShirtSizingEstimateInput): Promise<AIEstimate> {
  const response = await aiCall({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT_TEMPLATE(input),
    model: AI_PROVIDER_CONFIG.fastModel,
    maxTokens: 120,
    temperature: 0.2,
    stream: false,
  });

  return parseTShirtAIEstimate(response.content);
}
