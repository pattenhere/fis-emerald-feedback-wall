import { aiCall } from "./aiCall";

type GreeterCategory = "ORIGINATION" | "SERVICING" | "RISK" | "PLATFORM" | string;

const SYSTEM_PROMPT = `You generate personalized feedback questions for conference demo stations. Questions should feel directly relevant to the attendee's role and priorities. Output ONLY valid JSON, no prose.
Schema: {"questions": ["string", "string", "string"]}
Each question: max 12 words, conversational, specific to their context.
Never use jargon like "leverage" or "synergy".`;

const fallbackQuestionsForCategory = (category: GreeterCategory): string[] => {
  const normalized = String(category ?? "").trim().toUpperCase();
  if (normalized === "ORIGINATION") {
    return [
      "How does this compare to your current origination process?",
      "What's missing from the application experience?",
      "Where do approvals get stuck today?",
    ];
  }
  if (normalized === "SERVICING") {
    return [
      "What would unified portfolio visibility change for your team?",
      "Where does context get lost in servicing today?",
      "What reporting do you wish you had in real time?",
    ];
  }
  if (normalized === "RISK") {
    return [
      "How do you currently manage covenant monitoring?",
      "Where does compliance overhead slow your team down?",
      "What would better risk visibility unlock for you?",
    ];
  }
  return [
    "What would a single platform view change for your team?",
    "Where do your systems create the most friction today?",
    "What does your ideal lending tech stack look like?",
  ];
};

const normalizeQuestions = (value: unknown, fallbackCategory: GreeterCategory): string[] => {
  const fallback = fallbackQuestionsForCategory(fallbackCategory);
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
  if (cleaned.length !== 3) return fallback;
  return cleaned;
};

export const generateGreeterFeedbackQuestions = async (input: {
  q1Answer: string;
  q2Answer: string;
  q3Answer: string;
  q4Answer: string;
  primaryTitle: string;
  primaryCategory: string;
  primaryProducts: string;
}): Promise<string[]> => {
  const fallback = fallbackQuestionsForCategory(input.primaryCategory);
  const userPrompt = `Attendee profile:
Role: ${input.q1Answer}
Lending segment: ${input.q2Answer}
Priority: ${input.q3Answer}
Biggest pain: ${input.q4Answer}

They are being routed to: ${input.primaryTitle} (${input.primaryCategory})
Products: ${input.primaryProducts}

Generate 3 feedback questions they should answer while at this demo.
Output JSON only.`;

  try {
    const result = await aiCall({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      model: "claude-haiku-4-5-20251001",
      temperature: 0.4,
      maxTokens: 200,
      timeoutMs: 8_000,
      stream: false,
    });

    const parsed = JSON.parse(result.content) as { questions?: unknown };
    return normalizeQuestions(parsed?.questions, input.primaryCategory);
  } catch {
    return fallback;
  }
};
