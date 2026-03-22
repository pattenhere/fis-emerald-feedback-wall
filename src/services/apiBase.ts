const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/u, "");

const isLoopbackHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
};

const isCurrentHostLoopback = (): boolean => {
  if (typeof window === "undefined") return true;
  return isLoopbackHost(window.location.hostname);
};

export const resolveApiBase = (rawBase: string | undefined | null): string => {
  const candidate = trimTrailingSlashes(String(rawBase ?? "").trim());
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    if (isLoopbackHost(parsed.hostname) && !isCurrentHostLoopback()) {
      // In deployed environments, ignore accidental localhost compile-time values.
      return "";
    }
  } catch {
    // Ignore parse failures; caller falls back to same-origin path joins.
  }
  return candidate;
};

export const toApiUrl = (path: string, rawBase: string | undefined | null): string => {
  const base = resolveApiBase(rawBase);
  return base ? `${base}${path}` : path;
};
