import { AI_PROVIDER_CONFIG } from "../config/aiProvider.mjs";

const mapReason = (status) => {
  if (status === 401 || status === 403) return "auth_failed";
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
    const headers =
      AI_PROVIDER_CONFIG.provider === "anthropic"
        ? {
            "x-api-key": AI_PROVIDER_CONFIG.apiKey,
            "anthropic-version": AI_PROVIDER_CONFIG.anthropicVersion,
          }
        : {
            Authorization: `Bearer ${AI_PROVIDER_CONFIG.apiKey}`,
          };

    const response = await fetch(AI_PROVIDER_CONFIG.healthEndpoint, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
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
