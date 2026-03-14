type OpenAIRole = "system" | "user" | "assistant";

export interface OpenAITextMessage {
  role: OpenAIRole;
  content: string;
}

export interface OpenAITextRequest {
  messages: OpenAITextMessage[];
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface OpenAITextResponse {
  id?: string;
  model: string;
  text: string;
  raw: unknown;
}

export interface OpenAIStreamChunk {
  token: string;
  done: boolean;
}

const OPENAI_BASE_URL = (import.meta.env.VITE_OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
  /\/$/,
  "",
);
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL ?? "gpt-5-mini";
const OPENAI_PROJECT = import.meta.env.VITE_OPENAI_PROJECT;
const OPENAI_ORGANIZATION = import.meta.env.VITE_OPENAI_ORGANIZATION;

const ensureConfigured = (): void => {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured. Set VITE_OPENAI_API_KEY in your environment.");
  }
};

const buildHeaders = (): HeadersInit => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENAI_API_KEY ?? ""}`,
  };
  if (OPENAI_PROJECT) {
    headers["OpenAI-Project"] = OPENAI_PROJECT;
  }
  if (OPENAI_ORGANIZATION) {
    headers["OpenAI-Organization"] = OPENAI_ORGANIZATION;
  }
  return headers;
};

const toResponsesInput = (
  messages: OpenAITextMessage[],
): Array<{ role: OpenAIRole; content: Array<{ type: "input_text"; text: string }> }> => {
  return messages.map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }],
  }));
};

const extractText = (payload: unknown): string => {
  if (typeof payload !== "object" || payload === null) {
    return "";
  }

  const data = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const chunks: string[] = [];
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("");
};

export const isOpenAIConfigured = (): boolean => Boolean(OPENAI_API_KEY);

export const getOpenAIClientInfo = (): string => {
  if (!OPENAI_API_KEY) {
    return "OpenAI client not configured";
  }
  return `OpenAI Responses API ready (${OPENAI_BASE_URL})`;
};

export const createOpenAIText = async (request: OpenAITextRequest): Promise<OpenAITextResponse> => {
  ensureConfigured();

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      model: request.model ?? OPENAI_MODEL,
      input: toResponsesInput(request.messages),
      max_output_tokens: request.maxOutputTokens ?? 1400,
      temperature: request.temperature,
    }),
  });

  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${reason}`);
  }

  const data = (await response.json()) as { id?: string; model?: string };
  return {
    id: data.id,
    model: data.model ?? request.model ?? OPENAI_MODEL,
    text: extractText(data),
    raw: data,
  };
};

export const streamOpenAIText = async function* (
  request: OpenAITextRequest,
): AsyncGenerator<OpenAIStreamChunk, OpenAITextResponse> {
  ensureConfigured();

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      model: request.model ?? OPENAI_MODEL,
      input: toResponsesInput(request.messages),
      max_output_tokens: request.maxOutputTokens ?? 1400,
      temperature: request.temperature,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const reason = await response.text();
    throw new Error(`OpenAI stream request failed (${response.status}): ${reason}`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let fullText = "";
  let responseId = "";
  let model = request.model ?? OPENAI_MODEL;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split("\n\n");
    buffer = messages.pop() ?? "";

    for (const message of messages) {
      for (const line of message.split("\n")) {
        if (!line.startsWith("data: ")) {
          continue;
        }

        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") {
          continue;
        }

        let eventData: unknown;
        try {
          eventData = JSON.parse(raw);
        } catch {
          continue;
        }

        if (typeof eventData !== "object" || eventData === null) {
          continue;
        }

        const event = eventData as { type?: string; delta?: string; response?: { id?: string; model?: string } };
        if (event.response?.id) {
          responseId = event.response.id;
        }
        if (event.response?.model) {
          model = event.response.model;
        }

        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          fullText += event.delta;
          yield { token: event.delta, done: false };
        }
      }
    }
  }

  return {
    id: responseId || undefined,
    model,
    text: fullText,
    raw: { id: responseId || undefined, model, text: fullText },
  };
};

