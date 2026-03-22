import { aiCall } from "./aiCall";

export type Day2NarrativeSections = {
  opening: string;
  what_we_heard: string;
  what_we_built: string;
  what_we_deferred: string;
  closing: string;
};

export type Day2NarrativeContext = {
  eventName: string;
  ceremonyDate: string;
  day2RevealTime: string;
  totalInputs: number;
  topArea: string;
  p0ItemsBuilt: Array<{ title: string; size: string; notes: string }>;
  p0ItemsDeferred: Array<{ title: string; size: string; notes: string }>;
  topSignals: Array<{ title: string; rationale: string }>;
  competingPerspectivesCount: number;
};

export const DAY2_NARRATIVE_SYSTEM_PROMPT = [
  "You write facilitator scripts for B2B product conference reveals.",
  "Write in plain, direct, first-person plural ('we heard', 'we built').",
  "Tone: confident, honest, appreciative. Length: concise.",
  "Never imply production commitments. Always frame as prototype.",
  "Output ONLY the script sections as a JSON object. No prose outside JSON.",
  'Schema: {"opening":"string","what_we_heard":"string","what_we_built":"string","what_we_deferred":"string","closing":"string"}',
  "Each value: 2-4 sentences, plain text, no markdown.",
].join("\n");

const extractJsonPayload = (content: string): string => {
  const trimmed = String(content ?? "").trim();
  if (!trimmed) throw new Error("Narrative response was empty.");
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const objectMatch = candidate.match(/\{[\s\S]*\}/u);
  return (objectMatch?.[0] ?? candidate).trim();
};

const toText = (value: unknown): string => String(value ?? "").trim();

const parseNarrative = (raw: string): Day2NarrativeSections => {
  const parsed = JSON.parse(extractJsonPayload(raw)) as Partial<Day2NarrativeSections>;
  const opening = toText(parsed.opening);
  const whatWeHeard = toText(parsed.what_we_heard);
  const whatWeBuilt = toText(parsed.what_we_built);
  const whatWeDeferred = toText(parsed.what_we_deferred);
  const closing = toText(parsed.closing);
  if (!opening || !whatWeHeard || !whatWeBuilt || !whatWeDeferred || !closing) {
    throw new Error("Narrative response is missing one or more required sections.");
  }
  return {
    opening,
    what_we_heard: whatWeHeard,
    what_we_built: whatWeBuilt,
    what_we_deferred: whatWeDeferred,
    closing,
  };
};

const toBulletLines = (items: Array<string>): string => (items.length > 0 ? items.join("\n") : "- none");

const buildUserPrompt = (context: Day2NarrativeContext): string => {
  const competingLine = context.competingPerspectivesCount > 0
    ? `Note: ${context.competingPerspectivesCount} screens had competing perspectives.`
    : "";
  return [
    `Event: ${context.eventName}, ${context.ceremonyDate}`,
    `Total attendee inputs collected: ${context.totalInputs}`,
    `Most active product area: ${context.topArea}`,
    competingLine,
    "",
    "Top signals from synthesis:",
    toBulletLines(context.topSignals.map((s) => `- ${s.title}: ${s.rationale}`)),
    "",
    "Built overnight (XS/S items):",
    toBulletLines(context.p0ItemsBuilt.map((i) => `- ${i.title} (${i.size})${i.notes ? `: ${i.notes}` : ""}`)),
    "",
    "Deferred (M/L items — too large for overnight):",
    toBulletLines(context.p0ItemsDeferred.map((i) => `- ${i.title} (${i.size})${i.notes ? `: ${i.notes}` : ""}`)),
    "",
    `Day 2 reveal time: ${context.day2RevealTime}`,
    "",
    "Write the facilitator script sections as the JSON object.",
  ].filter(Boolean).join("\n");
};

export const generateDay2Narrative = async (context: Day2NarrativeContext): Promise<Day2NarrativeSections> => {
  const response = await aiCall({
    systemPrompt: DAY2_NARRATIVE_SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(context),
    model: "claude-sonnet-4-6",
    maxTokens: 800,
    temperature: 0.6,
    stream: false,
    timeoutMs: 30_000,
  });
  return parseNarrative(response.content);
};
