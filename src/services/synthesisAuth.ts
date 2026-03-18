const SYNTHESIS_AUTH_FLAG_KEY = "emerald.synthesis.authenticated";
const SYNTHESIS_AUTH_TOKEN_KEY = "emerald.synthesis.auth.token";

const safeSessionStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const readSynthesisAuthFlag = (): boolean => {
  const storage = safeSessionStorage();
  if (!storage) return false;
  const flag = storage.getItem(SYNTHESIS_AUTH_FLAG_KEY) === "true";
  const token = storage.getItem(SYNTHESIS_AUTH_TOKEN_KEY);
  return flag && typeof token === "string" && token.trim().length > 0;
};

export const writeSynthesisAuthFlag = (authenticated: boolean): void => {
  const storage = safeSessionStorage();
  if (!storage) return;
  storage.setItem(SYNTHESIS_AUTH_FLAG_KEY, authenticated ? "true" : "false");
};

export const readSynthesisAuthToken = (): string | null => {
  const storage = safeSessionStorage();
  if (!storage) return null;
  const token = storage.getItem(SYNTHESIS_AUTH_TOKEN_KEY);
  if (!token || !token.trim()) return null;
  return token;
};

export const writeSynthesisAuthToken = (token: string): void => {
  const storage = safeSessionStorage();
  if (!storage) return;
  const trimmed = token.trim();
  if (!trimmed) {
    storage.removeItem(SYNTHESIS_AUTH_TOKEN_KEY);
    return;
  }
  storage.setItem(SYNTHESIS_AUTH_TOKEN_KEY, trimmed);
};

export const clearSynthesisAuthSession = (): void => {
  const storage = safeSessionStorage();
  if (!storage) return;
  storage.removeItem(SYNTHESIS_AUTH_FLAG_KEY);
  storage.removeItem(SYNTHESIS_AUTH_TOKEN_KEY);
};

export const buildSynthesisAuthHeaders = (headers?: HeadersInit): HeadersInit => {
  const base = new Headers(headers ?? {});
  const token = readSynthesisAuthToken();
  if (token) {
    base.set("authorization", `Bearer ${token}`);
  }
  return base;
};
