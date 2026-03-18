type InstitutionAIProvider = "openai" | "anthropic";

type InstitutionAIPromptMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface InstitutionAISearchRequest {
  provider: InstitutionAIProvider;
  messages: InstitutionAIPromptMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface InstitutionAISearchResponse {
  text: string;
  provider: InstitutionAIProvider;
  model: string;
}

const jsonHeaders = { "content-type": "application/json" };

const readJson = async <T,>(response: Response): Promise<T> => {
  const payload = (await response.json()) as T;
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload != null &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
};

export const requestInstitutionAISearch = async (
  request: InstitutionAISearchRequest,
): Promise<InstitutionAISearchResponse> => {
  const response = await fetch("/api/universe/search", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(request),
  });
  const payload = await readJson<{ text?: string; provider?: string; model?: string }>(response);
  return {
    text: String(payload.text ?? ""),
    provider: payload.provider === "anthropic" ? "anthropic" : "openai",
    model: String(payload.model ?? ""),
  };
};
