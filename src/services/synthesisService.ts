import type { SynthesisRequest, SynthesisResponse, SynthesisStreamChunk, SynthesisStreamEvent } from "../types/synthesis";
import { buildSynthesisAuthHeaders } from "./synthesisAuth";

const SYNTHESIS_API_BASE = import.meta.env.VITE_SYNTHESIS_API_BASE_URL;
const SYNTHESIS_STREAM_PATH = "/api/synthesis/stream";
const AI_DEBUG_LOGS = String(import.meta.env.VITE_AI_DEBUG_LOGS ?? "false").toLowerCase() === "true";

const normalizeSynthesisBase = (value: string): string => String(value).replace(/\/+$/u, "");

const resolveSynthesisUrl = (): string => {
  if (!SYNTHESIS_API_BASE) {
    return SYNTHESIS_STREAM_PATH;
  }
  const base = normalizeSynthesisBase(String(SYNTHESIS_API_BASE));
  if (base.endsWith("/api")) {
    return `${base}/synthesis/stream`;
  }
  return `${base}${SYNTHESIS_STREAM_PATH}`;
};

const fallbackSynthesisUrl = (): string => SYNTHESIS_STREAM_PATH;

const parseSseEvent = (line: string): SynthesisStreamEvent | null => {
  try {
    return JSON.parse(line) as SynthesisStreamEvent;
  } catch {
    return null;
  }
};

const toErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `Synthesis API error (${response.status})`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      return json.error || json.message || fallback;
    } catch {
      return text.slice(0, 400);
    }
  } catch {
    return fallback;
  }
};

export const streamSynthesis = async function* (
  request: SynthesisRequest,
): AsyncGenerator<SynthesisStreamChunk, SynthesisResponse> {
  let response: Response;
  const primaryUrl = resolveSynthesisUrl();
  const fallbackUrl = fallbackSynthesisUrl();
  try {
    response = await fetch(primaryUrl, {
      method: "POST",
      headers: buildSynthesisAuthHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(request),
    });
  } catch {
    // Fallback to same-origin API path if configured base URL is unreachable.
    try {
      if (AI_DEBUG_LOGS) {
        console.warn(`[AI][Synthesis] Primary endpoint unreachable (${primaryUrl}); retrying ${fallbackUrl}`);
      }
      response = await fetch(fallbackUrl, {
        method: "POST",
        headers: buildSynthesisAuthHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(request),
      });
    } catch {
      throw new Error("Unable to reach synthesis service. Check server/API connectivity and try again.");
    }
  }

  if ((!response.ok || !response.body) && primaryUrl !== fallbackUrl) {
    if (AI_DEBUG_LOGS) {
      console.warn(`[AI][Synthesis] Primary endpoint returned ${response.status}; retrying ${fallbackUrl}`);
    }
    try {
      response = await fetch(fallbackUrl, {
        method: "POST",
        headers: buildSynthesisAuthHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(request),
      });
    } catch {
      // keep primary response for downstream error handling
    }
  }

  if (!response.ok || !response.body) {
    const message = await toErrorMessage(response);
    throw new Error(message);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let finalMode = request.outputMode;
  let finalMarkdown = "";
  let generatedAt = new Date().toISOString();
  let gotDoneEvent = false;

  const processFrame = async (frame: string): Promise<SynthesisStreamChunk[]> => {
    const chunks: SynthesisStreamChunk[] = [];
    const lines = frame
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6).trim())
      .filter(Boolean);
    for (const line of lines) {
      const event = parseSseEvent(line);
      if (!event) continue;
      if (event.type === "phase2_token") {
        chunks.push({ token: event.token, done: false, event });
        continue;
      }
      if (event.type === "provider_call") {
        if (AI_DEBUG_LOGS) {
          console.groupCollapsed(`[AI][Synthesis][${event.phase}] ${event.provider.toUpperCase()} call`);
          console.info("Endpoint:", event.endpoint);
          console.info("Model:", event.model);
          console.info("Max tokens:", event.maxTokens);
          console.info("Temperature:", event.temperature);
          console.groupEnd();
        }
        chunks.push({ token: "", done: false, event });
        continue;
      }
      if (event.type === "debug_prompt") {
        if (AI_DEBUG_LOGS) {
          console.groupCollapsed(`[AI][Synthesis][${event.phase}] ${event.provider.toUpperCase()} full payload`);
          const payload = event.payload as { readableMessages?: string };
          if (payload?.readableMessages) {
            console.info("Readable prompt/messages:\n" + payload.readableMessages);
          }
          console.info("Raw request payload:\n" + JSON.stringify(event.payload, null, 2));
          console.groupEnd();
        }
        chunks.push({ token: "", done: false, event });
        continue;
      }
      if (event.type === "done") {
        finalMode = event.outputMode;
        finalMarkdown = event.finalOutput;
        generatedAt = event.generatedAt;
        gotDoneEvent = true;
        chunks.push({ token: "", done: true, event });
        continue;
      }
      if (event.type === "error") {
        const code = event.code ? `${event.code}: ` : "";
        throw new Error(`${code}${event.message}`);
      }
      chunks.push({ token: "", done: false, event });
    }
    return chunks;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const chunks = await processFrame(frame);
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  }

  if (buffer.trim().length > 0) {
    const chunks = await processFrame(buffer);
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  if (!gotDoneEvent) {
    throw new Error("Synthesis stream ended unexpectedly before completion. Please try again.");
  }

  return {
    mode: finalMode,
    markdown: finalMarkdown,
    generatedAt,
  };
};

export const getSynthesisEndpointInfo = (): string => {
  if (!SYNTHESIS_API_BASE) {
    return "Configured endpoint: /api/synthesis/stream";
  }
  return `Configured endpoint: ${String(SYNTHESIS_API_BASE).replace(/\/$/, "")}`;
};
