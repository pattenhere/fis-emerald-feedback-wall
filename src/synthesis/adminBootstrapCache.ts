import type { AdminBootstrapResponse } from "../services/dataApi";

const ADMIN_BOOTSTRAP_CACHE_KEY = "emerald.admin.bootstrap";

export const writeAdminBootstrapCache = (payload: AdminBootstrapResponse): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADMIN_BOOTSTRAP_CACHE_KEY, JSON.stringify(payload));
    window.sessionStorage.setItem(ADMIN_BOOTSTRAP_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures in private browsing / restricted environments.
  }
};

export const readAdminBootstrapCache = (): AdminBootstrapResponse | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.sessionStorage.getItem(ADMIN_BOOTSTRAP_CACHE_KEY) ??
      window.localStorage.getItem(ADMIN_BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as AdminBootstrapResponse;
  } catch {
    return null;
  }
};

export const patchAdminBootstrapCache = (patch: Partial<AdminBootstrapResponse>): void => {
  const current = readAdminBootstrapCache();
  if (!current) return;
  writeAdminBootstrapCache({
    ...current,
    ...patch,
  });
};
