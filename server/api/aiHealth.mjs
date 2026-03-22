import { AI_PROVIDER_CONFIG } from "../config/aiProvider.mjs";

const mapReason = (status) => {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 404) return "endpoint_unavailable";
  return "unreachable";
};

export const getAIProviderHealth = async () => {
  if (!AI_PROVIDER_CONFIG.apiKey) {
    return {
      provider: AI_PROVIDER_CONFIG.provider,
      reachable: false,
      reason: "not_configured",
      checkedAt: new Date().toISOString(),
    };
  }

  const controller = new AbortController();
  //const timeout = setTimeout(() => controller.abort(), 5_000);
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    let response;
    if (AI_PROVIDER_CONFIG.provider === "anthropic") {
      // Anthropic `/v1/models` may return 404 in some environments. Use a lightweight valid API call instead.
      response = await fetch(`${AI_PROVIDER_CONFIG.baseURL}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": AI_PROVIDER_CONFIG.apiKey,
          "anthropic-version": AI_PROVIDER_CONFIG.anthropicVersion,
        },
        body: JSON.stringify({
          model: AI_PROVIDER_CONFIG.fastModel || AI_PROVIDER_CONFIG.defaultModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: controller.signal,
      });
    } else {
      response = await fetch(AI_PROVIDER_CONFIG.healthEndpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${AI_PROVIDER_CONFIG.apiKey}`,
        },
        signal: controller.signal,
      });
    }
    try {
      // Always consume/cancel the body so Undici can release the socket.
      await response.arrayBuffer();
    } catch {
      // Ignore body read errors for health checks.
    }

    if (response.ok) {
      return {
        provider: AI_PROVIDER_CONFIG.provider,
        reachable: true,
        checkedAt: new Date().toISOString(),
      };
    }

    // 4xx (except auth failures) still means we reached the provider and completed TLS/network.
    if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403) {
      return {
        provider: AI_PROVIDER_CONFIG.provider,
        reachable: true,
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      provider: AI_PROVIDER_CONFIG.provider,
      reachable: false,
      reason: mapReason(response.status),
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      provider: AI_PROVIDER_CONFIG.provider,
      reachable: false,
      reason: "unreachable",
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
};
