import { aiCall, AICallError } from "./aiCall";
import { AI_PROVIDER_CONFIG } from "../config/aiProvider";
import { dataApi } from "../services/dataApi";
import { APP_AREAS } from "../state/seedData";

const STOPWORDS = new Set([
  "a", "an", "the", "for", "and", "or", "but", "to", "of", "in", "on", "at", "is", "it", "be", "as", "by", "we",
  "with", "from", "that", "this", "into", "can", "should", "would", "could", "have", "has", "had", "not", "more",
  "better", "new", "our", "your",
]);

const SYSTEM_PROMPT = [
  "You summarise B2B conference feedback into 4 theme statements. Rules: output ONLY valid JSON, no prose, no markdown.",
  "Each theme: 1 sentence, max 20 words, observational and aggregate.",
  "Never mention: vote counts, submission counts, specific feature names, individual quotes, P0/P1/P2/priority/roadmap/build/urgent/must.",
  'Use plain business language. Schema: {"themes":["string","string","string","string"]}',
].join(" ");

const countWords = (value: string): number => {
  return value
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .length;
};

const normalizeTheme = (value: unknown): string => String(value ?? "").trim().replace(/\s+/gu, " ");

const toKeywordFragment = (value: string): string => {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .split(/\s+/u)
    .filter((word) => word && !STOPWORDS.has(word));
  return cleaned.slice(0, 3).join(" ");
};

const parseJsonResponse = (content: string): unknown => {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.replace(/^```json\s*/iu, "").replace(/^```\s*/u, "").replace(/\s*```$/u, "");
    return JSON.parse(fenced);
  }
};

const buildUserPrompt = (
  eventName: string,
  payload: {
    totalFeatureRequests: number;
    totalScreenFeedback: number;
    totalComments: number;
    screenFeedbackBySection: string;
    topFeatureKeywords: string;
  },
): string => {
  return [
    `Feedback summary for ${eventName}:`,
    `Feature requests: ${payload.totalFeatureRequests}`,
    `Screen feedback: ${payload.totalScreenFeedback}`,
    `Comments: ${payload.totalComments}`,
    `Feedback by area: ${payload.screenFeedbackBySection}`,
    `Top request keywords: ${payload.topFeatureKeywords}`,
    "Output the JSON object only.",
  ].join("\n");
};

export async function generateThemeSnapshot(eventName: string): Promise<{ themes: string[] }> {
  const bootstrap = await dataApi.getBootstrap();
  const featureRequests = bootstrap.featureRequests ?? [];
  const screenFeedback = bootstrap.screenFeedback ?? [];
  const comments = bootstrap.kudosQuotes ?? [];

  const areaLabelById = new Map(APP_AREAS.map((area) => [area.id, area.label]));
  const sectionCounts = new Map<string, number>();
  for (const item of screenFeedback) {
    const key = areaLabelById.get(item.app) ?? String(item.app ?? "Unknown");
    sectionCounts.set(key, (sectionCounts.get(key) ?? 0) + 1);
  }

  const screenFeedbackBySection = [...sectionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([section, count]) => `${section}: ${count}`)
    .join("\n");

  const topFeatureKeywords = featureRequests
    .slice()
    .sort((a, b) => Number(b.votes ?? 0) - Number(a.votes ?? 0))
    .slice(0, 5)
    .map((item) => toKeywordFragment(String(item.title ?? "")))
    .filter(Boolean)
    .join(" | ");

  const totalFeatureRequests = featureRequests.length;
  const totalScreenFeedback = screenFeedback.length;
  const totalComments = comments.length;

  console.log(
    `[themeSnapshot] Pre-computation complete: FR=${totalFeatureRequests} SF=${totalScreenFeedback} Comments=${totalComments}`,
  );

  const userPrompt = buildUserPrompt(eventName, {
    totalFeatureRequests,
    totalScreenFeedback,
    totalComments,
    screenFeedbackBySection: screenFeedbackBySection || "None",
    topFeatureKeywords: topFeatureKeywords || "None",
  });

  try {
    const response = await aiCall({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      model: AI_PROVIDER_CONFIG.fastModel,
      maxTokens: 300,
      temperature: 0.4,
      timeoutMs: 20_000,
      stream: false,
    });

    const parsed = parseJsonResponse(response.content) as { themes?: unknown };
    const themes = Array.isArray(parsed?.themes) ? parsed.themes.map((item) => normalizeTheme(item)) : [];

    if (
      themes.length !== 4 ||
      themes.some((theme) => !theme || countWords(theme) < 5 || countWords(theme) >= 25)
    ) {
      throw new Error("INVALID_RESPONSE");
    }

    return { themes };
  } catch (error) {
    if (error instanceof AICallError) {
      if (error.code === "timeout") throw new Error("TIMEOUT");
      if (error.code === "auth_failed") throw new Error("AUTH_FAILED");
      throw new Error("INVALID_RESPONSE");
    }
    if (error instanceof Error && error.message === "INVALID_RESPONSE") {
      throw error;
    }
    throw new Error("INVALID_RESPONSE");
  }
}
