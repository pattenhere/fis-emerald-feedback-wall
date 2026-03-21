import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { getPostgresPool, isPostgresConfigured } from "./db/postgres/client.mjs";
import { buildSynthesisConfig, runSynthesis, toSynthesisSignals } from "./synthesisOrchestrator.mjs";
import { initRuntimeStore, readRuntimeStore, resetRuntimeStore, writeRuntimeStore } from "./runtimeStore.mjs";
import { runServerTextCompletion } from "./ai/providerClients.mjs";
import { getAIProviderHealth } from "./api/aiHealth.mjs";
import { aiCall as runServerAICall, AICallError as ServerAICallError } from "./api/aiCall.mjs";
import { loadConfigEnv } from "./config/loadConfigEnv.mjs";
import { BUNDLED_SEEDS } from "./bundledSeeds.mjs";
import {
  HttpError,
  createHttpError,
  createJsonBodyReader,
  createRateLimiter,
  toOptionalInt,
  toOptionalIso,
  toOptionalString,
  toRequiredString,
  toTrimmedString,
} from "./http/requestGuards.mjs";

const toInteger = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
};
const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

loadConfigEnv();

const port = Number(process.env.API_PORT ?? 8794);
const isVercelRuntime = String(process.env.VERCEL ?? "").toLowerCase() === "1" || String(process.env.VERCEL ?? "").toLowerCase() === "true";
const defaultDbPath = isVercelRuntime ? "/tmp/app.db" : "db/app.db";
const defaultRuntimeStorePath = isVercelRuntime ? "/tmp/flat-runtime-store.json" : "db/flat-runtime-store.json";
const dbPath = path.resolve(rootDir, process.env.FEEDBACK_DB_PATH ?? defaultDbPath);
const serverSeedDir = path.resolve(rootDir, "src/state/seeds");
const publicAssetsDir = path.resolve(rootDir, "public/assets");
const runtimeStorePath = path.resolve(rootDir, process.env.FLAT_RUNTIME_STORE_PATH ?? defaultRuntimeStorePath);
const configuredCorsOrigins = String(process.env.API_ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const hasPostgresUrl = String(process.env.POSTGRES_URL ?? "").trim().length > 0;
const parseDbEngine = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "postgres" ? "postgres" : "sqlite";
};
const dbEngine = parseDbEngine(process.env.FEEDBACK_DB_ENGINE ?? (hasPostgresUrl ? "postgres" : "sqlite"));
const parseDataSourceMode = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "db" || normalized === "database" ? "db" : "flat";
};
const rawDataSourceMode =
  process.env.FEEDBACK_DATA_SOURCE ??
  process.env.DATA_SOURCE ??
  process.env.VITE_DATA_SOURCE ??
  (isVercelRuntime && hasPostgresUrl ? "db" : "flat");
const requestedDataSourceMode = parseDataSourceMode(rawDataSourceMode);
const postgresConfigured = isPostgresConfigured();
const dataSourceMode = requestedDataSourceMode === "flat"
  ? "flat"
  : dbEngine === "postgres" && !postgresConfigured
    ? "flat"
    : requestedDataSourceMode;
const useDbDataSource = dataSourceMode === "db";
const usePostgresDb = useDbDataSource && dbEngine === "postgres";
const synthesisConfig = buildSynthesisConfig(process.env);
const synthesisPin = String(
  process.env.SYNTHESIS_PIN ??
  process.env.VITE_SYNTHESIS_PIN ??
  "",
).trim();
const DEFAULT_SYNTHESIS_SESSION_COUNTDOWN_SECONDS = 1800;
const DEFAULT_SYNTHESIS_MIN_SIGNALS = 30;
const toBoolEnv = (value, fallback) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return fallback;
};
const normalizeLocalTime = (value, fallback = "") => {
  const candidate = String(value ?? "").trim();
  if (!candidate) return fallback;
  const match = candidate.match(/^(\d{1,2}):(\d{2})$/u);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
const localTimeToIso = (timeValue, fallbackIso) => {
  const normalized = normalizeLocalTime(timeValue, "");
  if (!normalized) return fallbackIso;
  const [hoursRaw, minutesRaw] = normalized.split(":");
  const date = new Date();
  date.setHours(Number(hoursRaw), Number(minutesRaw), 0, 0);
  return date.toISOString();
};
const toLocalHm = (isoValue) => {
  const parsed = new Date(String(isoValue ?? ""));
  if (!Number.isFinite(parsed.getTime())) return "";
  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
};
const slugifyEventName = (value) => {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40);
};
const configuredSessionCountdownSeconds = Number(
  process.env.SYNTHESIS_INPUT_WINDOW_SECONDS ??
  process.env.SYNTHESIS_COUNTDOWN_SECONDS ??
  process.env.VITE_SYNTHESIS_COUNTDOWN_SECONDS ??
  DEFAULT_SYNTHESIS_SESSION_COUNTDOWN_SECONDS,
);
const synthesisSessionCountdownSeconds = Number.isFinite(configuredSessionCountdownSeconds) && configuredSessionCountdownSeconds > 0
  ? configuredSessionCountdownSeconds
  : DEFAULT_SYNTHESIS_SESSION_COUNTDOWN_SECONDS;
const configuredInputCutoffRaw = String(
  process.env.SYNTHESIS_INPUT_CUTOFF_AT ??
  process.env.INPUT_WINDOW_CUTOFF_AT ??
  "",
).trim();
const configuredInputCutoffDate = new Date(configuredInputCutoffRaw);
const hasConfiguredInputCutoff = configuredInputCutoffRaw.length > 0 && Number.isFinite(configuredInputCutoffDate.getTime());
const fallbackInputCutoffAt = new Date(Date.now() + synthesisSessionCountdownSeconds * 1_000).toISOString();
const synthesisInputCutoffAt = hasConfiguredInputCutoff
  ? configuredInputCutoffDate.toISOString()
  : fallbackInputCutoffAt;
const configuredSynthesisMinSignals = Number(
  process.env.SYNTHESIS_MIN_SIGNALS ??
  process.env.SYNTHESIS_RECOMMENDED_MIN_SIGNALS ??
  DEFAULT_SYNTHESIS_MIN_SIGNALS,
);
const synthesisMinSignals = Number.isFinite(configuredSynthesisMinSignals) && configuredSynthesisMinSignals > 0
  ? Math.floor(configuredSynthesisMinSignals)
  : DEFAULT_SYNTHESIS_MIN_SIGNALS;
const synthesisSessionState = {
  inputCutoffAt: synthesisInputCutoffAt,
  wallWindowOpen: toBoolEnv(process.env.SYNTHESIS_WALL_WINDOW_OPEN, true),
  mobileWindowOpen: toBoolEnv(process.env.SYNTHESIS_MOBILE_WINDOW_OPEN, true),
  themesViewActive: toBoolEnv(process.env.SYNTHESIS_THEMES_VIEW_ACTIVE, false),
  synthesisMinSignals,
  mobileWindowCloseTime: normalizeLocalTime(process.env.SYNTHESIS_MOBILE_WINDOW_CLOSE_TIME, ""),
  eventName: String(process.env.SYNTHESIS_EVENT_NAME ?? "").trim(),
  eventSlug: String(process.env.SYNTHESIS_EVENT_SLUG ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/gu, "").slice(0, 40),
  ceremonyStartTimeLocal: normalizeLocalTime(process.env.SYNTHESIS_CEREMONY_START_TIME, ""),
  day2RevealTimeLocal: normalizeLocalTime(process.env.SYNTHESIS_DAY2_REVEAL_TIME, ""),
};
const DEFAULT_SYNTHESIS_PARAMETERS = Object.freeze({
  excludeBelowN: null,
  upweightSection: null,
  upweightMultiplier: 2,
  p0FocusOnly: false,
  emphasiseQuotes: false,
  maxQuotes: 6,
  competingMinEach: 3,
  competingMinSplitRatio: 0.4,
});
const normalizeRatio = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Number(numeric.toFixed(2));
  return Math.max(0.2, Math.min(0.8, rounded));
};
const synthesisParametersState = {
  ...DEFAULT_SYNTHESIS_PARAMETERS,
};
let synthesisParametersUpdatedAt = null;
const DEFAULT_AUTH_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const configuredAuthSessionTtlMs = Number(process.env.SYNTHESIS_AUTH_SESSION_TTL_MS ?? DEFAULT_AUTH_SESSION_TTL_MS);
const synthesisAuthSessionTtlMs =
  Number.isFinite(configuredAuthSessionTtlMs) && configuredAuthSessionTtlMs > 0
    ? Math.floor(configuredAuthSessionTtlMs)
    : DEFAULT_AUTH_SESSION_TTL_MS;
const synthesisAuthSecret = String(process.env.SYNTHESIS_AUTH_SECRET ?? synthesisPin ?? "").trim();
const synthesisAuthSecretKey = synthesisAuthSecret
  ? crypto.createHash("sha256").update(synthesisAuthSecret).digest()
  : null;
const aiCompleteRouteTimeoutMs = toPositiveInt(process.env.AI_COMPLETE_ROUTE_TIMEOUT_MS, 300_000);

const toBase64Url = (value) => Buffer.from(value).toString("base64url");
const fromBase64Url = (value) => Buffer.from(value, "base64url").toString("utf8");
const timingSafeStringEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left ?? ""));
  const rightBuffer = Buffer.from(String(right ?? ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
const signSynthesisTokenPayload = (payloadSegment) => {
  if (!synthesisAuthSecretKey) return "";
  return crypto.createHmac("sha256", synthesisAuthSecretKey).update(payloadSegment).digest("base64url");
};

const issueSynthesisAuthToken = () => {
  const expiresAt = Date.now() + synthesisAuthSessionTtlMs;
  const payload = toBase64Url(JSON.stringify({ exp: expiresAt }));
  const signature = signSynthesisTokenPayload(payload);
  const token = `${payload}.${signature}`;
  return { token, expiresAt };
};

const parseBearerToken = (request) => {
  const authorization = String(request.headers?.authorization ?? "");
  const match = authorization.match(/^Bearer\s+(.+)$/iu);
  return match ? match[1].trim() : "";
};

const isSynthesisAuthRequest = (pathname) => pathname === "/api/synthesis/auth";

const isProtectedAdminRoute = (pathname) => {
  if (pathname.startsWith("/api/admin/")) return true;
  if (pathname.startsWith("/api/inputs/")) return true;
  if (pathname === "/api/session/config") return true;
  if (pathname.startsWith("/api/synthesis/")) return !isSynthesisAuthRequest(pathname);
  return false;
};

const hasValidSynthesisAuthToken = (request) => {
  if (!synthesisAuthSecretKey) return false;
  const token = parseBearerToken(request);
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expectedSignature = signSynthesisTokenPayload(payload);
  if (!expectedSignature || !timingSafeStringEqual(signature, expectedSignature)) return false;
  try {
    const decoded = JSON.parse(fromBase64Url(payload));
    const exp = Number(decoded?.exp);
    return Number.isFinite(exp) && exp > Date.now();
  } catch {
    return false;
  }
};

if (dbEngine === "postgres") {
  if (!postgresConfigured) {
    // eslint-disable-next-line no-console
    console.warn("[api] FEEDBACK_DB_ENGINE=postgres but POSTGRES_URL is not configured. Falling back to flat data source.");
  } else {
    // eslint-disable-next-line no-console
    console.info("[api] FEEDBACK_DB_ENGINE=postgres detected. Postgres-backed handlers enabled for DB mode.");
  }
}

const withPostgresClient = async (work) => {
  const pool = await getPostgresPool();
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
};

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
initRuntimeStore(runtimeStorePath);
const runtimeConfig = readRuntimeStore(runtimeStorePath);
const persistedSessionConfig = runtimeConfig?.sessionConfig && typeof runtimeConfig.sessionConfig === "object"
  ? runtimeConfig.sessionConfig
  : {};
synthesisSessionState.inputCutoffAt =
  typeof persistedSessionConfig.inputCutoffAt === "string" && Number.isFinite(new Date(persistedSessionConfig.inputCutoffAt).getTime())
    ? new Date(persistedSessionConfig.inputCutoffAt).toISOString()
    : synthesisSessionState.inputCutoffAt;
synthesisSessionState.wallWindowOpen =
  typeof persistedSessionConfig.wallWindowOpen === "boolean" ? persistedSessionConfig.wallWindowOpen : synthesisSessionState.wallWindowOpen;
synthesisSessionState.mobileWindowOpen =
  typeof persistedSessionConfig.mobileWindowOpen === "boolean" ? persistedSessionConfig.mobileWindowOpen : synthesisSessionState.mobileWindowOpen;
synthesisSessionState.themesViewActive =
  typeof persistedSessionConfig.themesViewActive === "boolean" ? persistedSessionConfig.themesViewActive : synthesisSessionState.themesViewActive;
synthesisSessionState.synthesisMinSignals =
  typeof persistedSessionConfig.synthesisMinSignals === "number"
    ? Math.max(10, Math.min(500, toInteger(persistedSessionConfig.synthesisMinSignals, synthesisSessionState.synthesisMinSignals)))
    : synthesisSessionState.synthesisMinSignals;
synthesisSessionState.mobileWindowCloseTime = normalizeLocalTime(
  persistedSessionConfig.mobileWindowCloseTime,
  synthesisSessionState.mobileWindowCloseTime,
);
synthesisSessionState.eventName =
  typeof persistedSessionConfig.eventName === "string" ? persistedSessionConfig.eventName.trim().slice(0, 80) : synthesisSessionState.eventName;
synthesisSessionState.eventSlug =
  typeof persistedSessionConfig.eventSlug === "string"
    ? persistedSessionConfig.eventSlug.trim().toLowerCase().replace(/[^a-z0-9-]/gu, "").slice(0, 40)
    : synthesisSessionState.eventSlug;
synthesisSessionState.ceremonyStartTimeLocal = normalizeLocalTime(
  persistedSessionConfig.ceremonyStartTimeLocal,
  synthesisSessionState.ceremonyStartTimeLocal,
);
synthesisSessionState.day2RevealTimeLocal = normalizeLocalTime(
  persistedSessionConfig.day2RevealTimeLocal,
  synthesisSessionState.day2RevealTimeLocal,
);
const persistedSynthesisParameters =
  runtimeConfig?.synthesisParameters && typeof runtimeConfig.synthesisParameters === "object"
    ? runtimeConfig.synthesisParameters
    : null;
if (persistedSynthesisParameters) {
  const excludeBelowN = Number(persistedSynthesisParameters.excludeBelowN);
  synthesisParametersState.excludeBelowN =
    Number.isInteger(excludeBelowN) && excludeBelowN >= 1 && excludeBelowN <= 10 ? excludeBelowN : null;

  const upweightSection = String(persistedSynthesisParameters.upweightSection ?? "").trim();
  synthesisParametersState.upweightSection = upweightSection || null;

  const upweightMultiplier = Number(persistedSynthesisParameters.upweightMultiplier);
  synthesisParametersState.upweightMultiplier =
    Number.isInteger(upweightMultiplier) && upweightMultiplier >= 2 && upweightMultiplier <= 4
      ? upweightMultiplier
      : DEFAULT_SYNTHESIS_PARAMETERS.upweightMultiplier;

  synthesisParametersState.p0FocusOnly = Boolean(persistedSynthesisParameters.p0FocusOnly);
  synthesisParametersState.emphasiseQuotes = Boolean(persistedSynthesisParameters.emphasiseQuotes);

  const maxQuotes = Number(persistedSynthesisParameters.maxQuotes);
  synthesisParametersState.maxQuotes =
    Number.isInteger(maxQuotes) && maxQuotes >= 3 && maxQuotes <= 10 ? maxQuotes : DEFAULT_SYNTHESIS_PARAMETERS.maxQuotes;

  const competingMinEach = Number(persistedSynthesisParameters.competingMinEach);
  synthesisParametersState.competingMinEach =
    Number.isInteger(competingMinEach) && competingMinEach >= 2 && competingMinEach <= 10
      ? competingMinEach
      : DEFAULT_SYNTHESIS_PARAMETERS.competingMinEach;

  synthesisParametersState.competingMinSplitRatio = normalizeRatio(
    persistedSynthesisParameters.competingMinSplitRatio,
    DEFAULT_SYNTHESIS_PARAMETERS.competingMinSplitRatio,
  );
}
synthesisParametersUpdatedAt =
  typeof runtimeConfig?.synthesisParametersUpdatedAt === "string" && runtimeConfig.synthesisParametersUpdatedAt.trim()
    ? runtimeConfig.synthesisParametersUpdatedAt
    : null;

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const nowIso = () => new Date().toISOString();
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, "\"\"")}"`;
const loadJsonSeed = (filename) => {
  const filePath = path.join(serverSeedDir, filename);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const bundled = BUNDLED_SEEDS[filename];
    if (Array.isArray(bundled)) {
      // eslint-disable-next-line no-console
      console.warn(`[api] failed to load seed file ${filePath}; using bundled fallback for ${filename}.`);
      return bundled;
    }
    // eslint-disable-next-line no-console
    console.warn(`[api] failed to load seed file ${filePath}`, error);
    return [];
  }
};
const LEGACY_APP_TO_LABEL = {
  "digital-experience": "Digital Experience",
  origination: "Origination",
  "credit-risk": "Credit & Risk",
  servicing: "Servicing",
  "monitoring-controls": "Monitoring & Controls",
  "syndication-complex-lending": "Syndication / Complex Lending",
  "analytics-inquiry": "Analytics & Inquiry",
  "platform-services": "Platform Services",
};

const appLabelFromId = (appId) => LEGACY_APP_TO_LABEL[String(appId)] ?? String(appId ?? "Unspecified");

const normalizeRole = (value) => {
  const role = String(value ?? "unspecified").toLowerCase().trim();
  if (["ops", "eng", "product", "finance", "exec", "unspecified"].includes(role)) return role;
  return "unspecified";
};

const normalizeFeedbackType = (value) => {
  const normalized = String(value ?? "issue").toLowerCase().replaceAll("_", "-").trim();
  if (normalized === "workswell" || normalized === "works-well") return "works-well";
  if (normalized === "missingelement" || normalized === "missing-element") return "missing";
  if (normalized === "pain-point") return "issue";
  if (["issue", "suggestion", "missing", "works-well"].includes(normalized)) return normalized;
  throw createHttpError(400, "feedback type must be one of: issue, suggestion, missing, works-well.");
};

const VALID_APP_AREAS = new Set([
  "digital-experience",
  "origination",
  "credit-risk",
  "servicing",
  "monitoring-controls",
  "syndication-complex-lending",
  "analytics-inquiry",
  "platform-services",
]);

const normalizeAppAreaInput = (value) => {
  const candidate = toTrimmedString(value, "servicing");
  if (VALID_APP_AREAS.has(candidate)) return candidate;
  return toAppArea(candidate);
};

const validateFeatureRequestPayload = (body) => {
  return {
    productId: toOptionalInt(body.productId, { field: "productId", min: 0, max: 1_000_000 }) ?? 0,
    title: toRequiredString(body.title, { field: "title", maxLength: 240 }),
    description: toOptionalString(body.description, 2_000),
    workflowContext: toOptionalString(body.workflowContext, 2_000),
    status: toOptionalString(body.status, 40) ?? "open",
    createdAt: toOptionalIso(body.createdAt, "createdAt") ?? nowIso(),
    legacyRequestCode: toOptionalString(body.legacyRequestCode, 120),
    origin: (toOptionalString(body.origin, 20) ?? "kiosk").toLowerCase() === "mobile" ? "mobile" : "kiosk",
    sessionId: toOptionalString(body.sessionId, 120) ?? "web",
  };
};

const validateFeatureUpvotePayload = (body) => ({
  sessionId: toOptionalString(body.sessionId, 120) ?? `web-${Date.now()}`,
});

const validateKudosPayload = (body) => ({
  productId: toOptionalInt(body.productId, { field: "productId", min: 0, max: 1_000_000 }) ?? 0,
  text: toRequiredString(body.text, { field: "text", maxLength: 2_000 }),
  role: normalizeRole(body.role),
  consentPublic: Boolean(body.consentPublic),
  createdAt: toOptionalIso(body.createdAt, "createdAt") ?? nowIso(),
});

const validateScreenFeedbackPayload = (body) => ({
  productId: toOptionalInt(body.productId, { field: "productId", min: 0, max: 1_000_000 }) ?? 0,
  featureId: toOptionalInt(body.featureId, { field: "featureId", min: 0, max: 1_000_000 }),
  screenId: toOptionalInt(body.screenId, { field: "screenId", min: 0, max: 1_000_000 }),
  type: normalizeFeedbackType(body.type),
  text: toOptionalString(body.text, 2_000),
  role: normalizeRole(body.role),
  createdAt: toOptionalIso(body.createdAt, "createdAt") ?? nowIso(),
  app: normalizeAppAreaInput(body.app),
  screenName: toOptionalString(body.screenName, 200),
});

const validateCardSortPayload = (body) => {
  const conceptTitle = toRequiredString(body.conceptTitle, { field: "conceptTitle", maxLength: 200 });
  const tier = toRequiredString(body.tier, { field: "tier", maxLength: 20 }).toLowerCase();
  if (!["high", "medium", "low"].includes(tier)) {
    throw createHttpError(400, "tier must be one of: high, medium, low.");
  }
  return {
    conceptTitle,
    tier,
    role: toOptionalString(body.role, 40) ?? "unspecified",
  };
};

const validateSessionConfigPatchPayload = (body) => {
  const allowedKeys = new Set([
    "wallWindowOpen",
    "mobileWindowOpen",
    "themesViewActive",
    "synthesisMinSignals",
    "inputCutoffAt",
    "mobileWindowCloseTime",
    "eventName",
    "eventSlug",
    "ceremonyStartTimeLocal",
    "day2RevealTimeLocal",
  ]);
  for (const key of Object.keys(body ?? {})) {
    if (!allowedKeys.has(key)) {
      throw createHttpError(400, `Unsupported session config field: ${key}`);
    }
  }
  const payload = {};
  if ("wallWindowOpen" in body) payload.wallWindowOpen = Boolean(body.wallWindowOpen);
  if ("mobileWindowOpen" in body) payload.mobileWindowOpen = Boolean(body.mobileWindowOpen);
  if ("themesViewActive" in body) payload.themesViewActive = Boolean(body.themesViewActive);
  if ("synthesisMinSignals" in body) {
    payload.synthesisMinSignals = toOptionalInt(body.synthesisMinSignals, {
      field: "synthesisMinSignals",
      min: 10,
      max: 500,
    });
  }
  if ("inputCutoffAt" in body) {
    payload.inputCutoffAt = toOptionalIso(body.inputCutoffAt, "inputCutoffAt");
  }
  if ("mobileWindowCloseTime" in body) {
    const normalized = normalizeLocalTime(body.mobileWindowCloseTime, "");
    if (!normalized) {
      throw createHttpError(400, "mobileWindowCloseTime must be HH:MM.");
    }
    payload.mobileWindowCloseTime = normalized;
  }
  if ("eventName" in body) {
    payload.eventName = toOptionalString(body.eventName, 80) ?? "";
  }
  if ("eventSlug" in body) {
    const slug = String(toOptionalString(body.eventSlug, 40) ?? "").toLowerCase();
    if (slug && !/^[a-z0-9-]{1,40}$/u.test(slug)) {
      throw createHttpError(400, "eventSlug must match /^[a-z0-9-]{1,40}$/.");
    }
    payload.eventSlug = slug;
  }
  if ("ceremonyStartTimeLocal" in body) {
    const normalized = normalizeLocalTime(body.ceremonyStartTimeLocal, "");
    if (!normalized) {
      throw createHttpError(400, "ceremonyStartTimeLocal must be HH:MM.");
    }
    payload.ceremonyStartTimeLocal = normalized;
  }
  if ("day2RevealTimeLocal" in body) {
    const normalized = normalizeLocalTime(body.day2RevealTimeLocal, "");
    if (!normalized) {
      throw createHttpError(400, "day2RevealTimeLocal must be HH:MM.");
    }
    payload.day2RevealTimeLocal = normalized;
  }
  return payload;
};

const validateSynthesisParametersPatchPayload = (body) => {
  const allowedKeys = new Set([
    "excludeBelowN",
    "upweightSection",
    "upweightMultiplier",
    "p0FocusOnly",
    "emphasiseQuotes",
    "maxQuotes",
    "competingMinEach",
    "competingMinSplitRatio",
  ]);
  for (const key of Object.keys(body ?? {})) {
    if (!allowedKeys.has(key)) {
      throw createHttpError(400, `Unsupported synthesis parameter field: ${key}`);
    }
  }

  const payload = {};

  if ("excludeBelowN" in body) {
    if (body.excludeBelowN == null || body.excludeBelowN === "") {
      payload.excludeBelowN = null;
    } else {
      const parsed = toOptionalInt(body.excludeBelowN, { field: "excludeBelowN", min: 1, max: 10 });
      if (parsed == null) throw createHttpError(400, "excludeBelowN must be 1-10 or null.");
      payload.excludeBelowN = parsed;
    }
  }

  if ("upweightSection" in body) {
    const next = String(body.upweightSection ?? "").trim();
    payload.upweightSection = next || null;
  }

  if ("upweightMultiplier" in body) {
    const parsed = toOptionalInt(body.upweightMultiplier, { field: "upweightMultiplier", min: 2, max: 4 });
    if (parsed == null) throw createHttpError(400, "upweightMultiplier must be 2-4.");
    payload.upweightMultiplier = parsed;
  }

  if ("p0FocusOnly" in body) payload.p0FocusOnly = Boolean(body.p0FocusOnly);
  if ("emphasiseQuotes" in body) payload.emphasiseQuotes = Boolean(body.emphasiseQuotes);

  if ("maxQuotes" in body) {
    const parsed = toOptionalInt(body.maxQuotes, { field: "maxQuotes", min: 3, max: 10 });
    if (parsed == null) throw createHttpError(400, "maxQuotes must be 3-10.");
    payload.maxQuotes = parsed;
  }

  if ("competingMinEach" in body) {
    const parsed = toOptionalInt(body.competingMinEach, { field: "competingMinEach", min: 2, max: 10 });
    if (parsed == null) throw createHttpError(400, "competingMinEach must be 2-10.");
    payload.competingMinEach = parsed;
  }

  if ("competingMinSplitRatio" in body) {
    const numeric = Number(body.competingMinSplitRatio);
    if (!Number.isFinite(numeric) || numeric < 0.2 || numeric > 0.8) {
      throw createHttpError(400, "competingMinSplitRatio must be 0.20-0.80.");
    }
    payload.competingMinSplitRatio = Number(numeric.toFixed(2));
  }

  return payload;
};

const stripLocationFieldsFromRecord = (record) => {
  if (!record || typeof record !== "object") {
    return false;
  }
  let modified = false;
  if ("appSection" in record) {
    delete record.appSection;
    modified = true;
  }
  if ("screenName" in record) {
    delete record.screenName;
    modified = true;
  }
  if ("app" in record) {
    delete record.app;
    modified = true;
  }
  return modified;
};

const migrateRuntimeStoreLocationFields = () => {
  const runtime = readRuntimeStore(runtimeStorePath);
  let featureModified = 0;
  let kudosModified = 0;

  if (Array.isArray(runtime.featureRequests)) {
    for (const row of runtime.featureRequests) {
      if (stripLocationFieldsFromRecord(row)) {
        featureModified += 1;
      }
    }
  }
  if (Array.isArray(runtime.kudos)) {
    for (const row of runtime.kudos) {
      if (stripLocationFieldsFromRecord(row)) {
        kudosModified += 1;
      }
    }
  }

  if (featureModified > 0 || kudosModified > 0) {
    writeRuntimeStore(runtimeStorePath, runtime);
  }

  // eslint-disable-next-line no-console
  console.info(`[Migration] Stripped location fields from ${featureModified} FR records, ${kudosModified} Kudos records.`);
  return { featureModified, kudosModified };
};

const migrateDbLocationFields = async () => {
  if (!useDbDataSource) {
    return { featureModified: 0, kudosModified: 0 };
  }

  if (usePostgresDb) {
    const counts = await withPostgresClient(async (client) => {
      const featureResult = await client.query(
        "UPDATE feature_requests SET app_area = NULL, screen_name = NULL WHERE app_area IS NOT NULL OR screen_name IS NOT NULL",
      );
      const kudosResult = await client.query(
        "UPDATE kudos SET app_area = NULL, screen_name = NULL WHERE app_area IS NOT NULL OR screen_name IS NOT NULL",
      );
      return {
        featureModified: Number(featureResult.rowCount ?? 0),
        kudosModified: Number(kudosResult.rowCount ?? 0),
      };
    });
    // eslint-disable-next-line no-console
    console.info(`[Migration] Stripped location fields from ${counts.featureModified} FR records, ${counts.kudosModified} Kudos records.`);
    return counts;
  }

  const featureResult = db.prepare(
    "UPDATE feature_requests SET APP_AREA = NULL, SCREEN_NAME = NULL WHERE APP_AREA IS NOT NULL OR SCREEN_NAME IS NOT NULL",
  ).run();
  const kudosResult = db.prepare(
    "UPDATE kudos SET APP_AREA = NULL, SCREEN_NAME = NULL WHERE APP_AREA IS NOT NULL OR SCREEN_NAME IS NOT NULL",
  ).run();
  const counts = {
    featureModified: Number(featureResult.changes ?? 0),
    kudosModified: Number(kudosResult.changes ?? 0),
  };
  // eslint-disable-next-line no-console
  console.info(`[Migration] Stripped location fields from ${counts.featureModified} FR records, ${counts.kudosModified} Kudos records.`);
  return counts;
};

const getFlatCoreSeeds = () => {
  const screenLibrary = loadJsonSeed("screenLibrary.seed.json");
  validateScreenLibraryAssetPaths(screenLibrary);
  return {
    appAreas: loadJsonSeed("appAreas.seed.json"),
    products: loadJsonSeed("products.seed.json"),
    productFeatures: loadJsonSeed("productFeatures.seed.json"),
    screenLibrary,
    cardSortConcepts: loadJsonSeed("cardSortConcepts.seed.json"),
    categories: loadJsonSeed("categories.seed.json"),
    subcategories: loadJsonSeed("subcategories.seed.json"),
    institutionProfiles: loadJsonSeed("institutionProfiles.seed.json"),
    productFeatureCategories: loadJsonSeed("productFeatureCategories.seed.json"),
  };
};

const withSeedScreenAssets = (screensRows) => {
  const core = getFlatCoreSeeds();
  const byLegacyCode = new Map(core.screenLibrary.map((screen) => [String(screen.id ?? ""), screen]));
  const byName = new Map(core.screenLibrary.map((screen) => [String(screen.name ?? "").toLowerCase(), screen]));

  return screensRows.map((screen) => {
    const matchedScreen =
      byLegacyCode.get(String(screen.legacyScreenCode ?? "")) ??
      byName.get(String(screen.name ?? "").toLowerCase());
    const assets = Array.isArray(matchedScreen?.assets)
      ? matchedScreen.assets
          .filter((asset) => typeof asset === "string" && asset.trim().length > 0)
          .map((asset) => String(asset))
      : Array.isArray(screen.assets)
        ? screen.assets
            .filter((asset) => typeof asset === "string" && asset.trim().length > 0)
            .map((asset) => String(asset))
        : [];
    return {
      ...screen,
      thumbnailAssetPath: String(matchedScreen?.thumbnailAssetPath ?? screen.thumbnailAssetPath ?? "splash-wall-hero.png"),
      assets,
    };
  });
};

const ASSET_PATH_PATTERN = /^[a-z0-9-_/]+\/\d{2}-[a-z0-9-]+\.(png|jpg)$/i;
const LEGACY_ASSET_PATH_PATTERN = /^[a-z0-9-_/]+\/\d{2}[ _-][a-z0-9][a-z0-9 ._-]*\.(png|jpg)$/i;
const SCREEN_FILE_EXTENSIONS = new Set([".png", ".jpg"]);
let hasLoggedScreenAssetValidation = false;

const toRelativeAssetPath = (value) => String(value ?? "").replace(/^\/+/u, "").replace(/^assets\//u, "").trim();

const validateScreenLibraryAssetPaths = (screenLibraryRows) => {
  if (hasLoggedScreenAssetValidation) return;
  hasLoggedScreenAssetValidation = true;

  for (const row of screenLibraryRows) {
    const screenName = String(row.name ?? row.id ?? "unknown-screen");
    const thumbnail = String(row.thumbnailAssetPath ?? "").trim();
    if (!thumbnail) {
      // eslint-disable-next-line no-console
      console.warn(`[seed-validator] screen "${screenName}" is missing thumbnailAssetPath`);
    } else {
      const thumbnailRelative = toRelativeAssetPath(thumbnail);
      const thumbnailPath = path.resolve(publicAssetsDir, thumbnailRelative);
      if (!fs.existsSync(thumbnailPath)) {
        // eslint-disable-next-line no-console
        console.warn(`[seed-validator] missing thumbnail asset for "${screenName}": ${thumbnail}`);
      }
    }

    const assets = row.assets;
    if (!Array.isArray(assets)) {
      // eslint-disable-next-line no-console
      console.warn(`[seed-validator] screen "${screenName}" has invalid assets field (expected array)`);
      continue;
    }
    if (assets.length === 0) {
      continue;
    }
    if (assets.length > 20) {
      // eslint-disable-next-line no-console
      console.warn(`[seed-validator] screen "${screenName}" has ${assets.length} assets (max 20)`);
    }
    for (const assetPathRaw of assets) {
      const assetPath = String(assetPathRaw ?? "").trim();
      if (!ASSET_PATH_PATTERN.test(assetPath) && !LEGACY_ASSET_PATH_PATTERN.test(assetPath)) {
        // eslint-disable-next-line no-console
        console.warn(`[seed-validator] screen "${screenName}" asset path violates naming convention: ${assetPath}`);
      }
      const filename = path.basename(assetPath);
      if (filename.length > 64) {
        // eslint-disable-next-line no-console
        console.warn(`[seed-validator] screen "${screenName}" asset filename exceeds 64 chars: ${filename}`);
      }
      const extension = path.extname(filename).toLowerCase();
      if (!SCREEN_FILE_EXTENSIONS.has(extension)) {
        // eslint-disable-next-line no-console
        console.warn(`[seed-validator] screen "${screenName}" asset extension must be .png or .jpg: ${assetPath}`);
      }
      const assetRelative = toRelativeAssetPath(assetPath);
      const absolutePath = path.resolve(publicAssetsDir, assetRelative);
      if (!fs.existsSync(absolutePath)) {
        // eslint-disable-next-line no-console
        console.warn(`[seed-validator] missing asset for "${screenName}": ${assetPath}`);
      }
    }
  }
};

const getFlatSignalSeeds = () => ({
  featureRequests: loadJsonSeed("featureRequests.seed.json"),
  kudos: loadJsonSeed("kudos.seed.json"),
  screenFeedback: loadJsonSeed("screenFeedback.seed.json"),
});

const mergeFeatureRequestsWithVoteIncrements = (seedRows, runtimeStore) => {
  const increments = runtimeStore.featureRequestVoteIncrements ?? {};
  const merged = [...seedRows, ...(Array.isArray(runtimeStore.featureRequests) ? runtimeStore.featureRequests : [])]
    .map((row, index) => {
      const id = String(row.id ?? `fr-runtime-${index + 1}`);
      const addedVotes = Number(increments[id] ?? 0);
      const nextRow = {
        ...row,
        id,
        votes: Math.max(0, Number(row.votes ?? 0) + Math.max(0, addedVotes)),
      };
      stripLocationFieldsFromRecord(nextRow);
      return nextRow;
    });
  return merged;
};

const buildFlatMergedSignals = () => {
  const runtimeStore = readRuntimeStore(runtimeStorePath);
  const signalSeeds = getFlatSignalSeeds();
  const mergedKudos = [...signalSeeds.kudos, ...(Array.isArray(runtimeStore.kudos) ? runtimeStore.kudos : [])]
    .map((row) => {
      const nextRow = { ...row };
      stripLocationFieldsFromRecord(nextRow);
      return nextRow;
    });
  return {
    featureRequests: mergeFeatureRequestsWithVoteIncrements(signalSeeds.featureRequests, runtimeStore),
    screenFeedback: [...signalSeeds.screenFeedback, ...(Array.isArray(runtimeStore.screenFeedback) ? runtimeStore.screenFeedback : [])],
    kudos: mergedKudos,
    cardSortResults: Array.isArray(runtimeStore.cardSortResults) ? runtimeStore.cardSortResults : [],
  };
};

const getFlatFeatureRequestVoteCount = (featureRequestId) => {
  const idAsString = String(featureRequestId ?? "");
  const mergedSignals = buildFlatMergedSignals();
  const row = mergedSignals.featureRequests.find((request) => String(request.id) === idAsString);
  return Math.max(0, Number(row?.votes ?? 0));
};
const CATEGORY_DESCRIPTIONS = {
  Lending: "Lending Product Ecosystem",
};
const SUBCATEGORY_NAME_OVERRIDES = {
  "Origination Solutions": "Origination",
  "Servicing Solutions": "Servicing",
  "Specialty Lending Solutions": "Specialty Lending",
};
const ERD_TABLES = [
  "categories",
  "subcategories",
  "products",
  "features",
  "screens",
  "feature_areas",
  "feature_requests",
  "feature_request_votes",
  "feedback",
  "kudos",
];

const findExistingTableName = (logicalName) => {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND lower(name) = lower(?)
    LIMIT 1
  `).get(logicalName);
  return row?.name ?? null;
};

const getTableColumns = (tableName) => {
  if (!tableName) return [];
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => String(row.name));
};

const ensureExpectedTableShape = (logicalName, expectedColumns) => {
  const existingName = findExistingTableName(logicalName);
  if (!existingName) return;
  const columns = new Set(getTableColumns(existingName));
  const hasExpectedShape = expectedColumns.every((column) => columns.has(column));
  if (hasExpectedShape) return;
  const renamed = `${existingName}_legacy_${Date.now()}`;
  db.exec(`ALTER TABLE ${quoteIdentifier(existingName)} RENAME TO ${quoteIdentifier(renamed)};`);
  // eslint-disable-next-line no-console
  console.warn(`[api] archived legacy table ${existingName} -> ${renamed}`);
};

const renameColumnIfExists = (tableName, from, to) => {
  const existingName = findExistingTableName(tableName);
  if (!existingName) return;
  const columns = new Set(getTableColumns(existingName));
  if (!columns.has(from) || columns.has(to)) return;
  db.exec(`ALTER TABLE ${quoteIdentifier(existingName)} RENAME COLUMN ${quoteIdentifier(from)} TO ${quoteIdentifier(to)};`);
};

[
  ["categories", "CategoryID", "CATEGORY_ID"],
  ["categories", "CategoryName", "CATEGORY_NAME"],
  ["categories", "Description", "DESCRIPTION"],
  ["subcategories", "SubcategoryID", "SUBCATEGORY_ID"],
  ["subcategories", "CategoryID", "CATEGORY_ID"],
  ["subcategories", "SubcategoryName", "SUBCATEGORY_NAME"],
  ["subcategories", "Description", "DESCRIPTION"],
  ["products", "ProductID", "PRODUCT_ID"],
  ["products", "SubcategoryID", "SUBCATEGORY_ID"],
  ["products", "ProductName", "PRODUCT_NAME"],
  ["products", "Description", "DESCRIPTION"],
  ["products", "ProductStatus", "PRODUCT_STATUS"],
  ["products", "LegacyProductCode", "LEGACY_PRODUCT_CODE"],
  ["features", "FeatureID", "FEATURE_ID"],
  ["features", "ProductID", "PRODUCT_ID"],
  ["features", "FeatureName", "FEATURE_NAME"],
  ["features", "FeatureDescription", "FEATURE_DESCRIPTION"],
  ["features", "FeatureStatus", "FEATURE_STATUS"],
  ["features", "ModuleName", "MODULE_NAME"],
  ["features", "LegacyFeatureCode", "LEGACY_FEATURE_CODE"],
  ["screens", "ScreenID", "SCREEN_ID"],
  ["screens", "ProductID", "PRODUCT_ID"],
  ["screens", "ScreenName", "SCREEN_NAME"],
  ["screens", "ScreenCategory", "SCREEN_CATEGORY"],
  ["screens", "ScreenDescription", "SCREEN_DESCRIPTION"],
  ["screens", "LegacyScreenCode", "LEGACY_SCREEN_CODE"],
  ["feature_requests", "FeatureRequestID", "FEATURE_REQUEST_ID"],
  ["feature_requests", "ProductID", "PRODUCT_ID"],
  ["feature_requests", "ConvertedFeatureID", "CONVERTED_FEATURE_ID"],
  ["feature_requests", "Title", "TITLE"],
  ["feature_requests", "Description", "DESCRIPTION"],
  ["feature_requests", "WorkflowContext", "WORKFLOW_CONTEXT"],
  ["feature_requests", "Status", "STATUS"],
  ["feature_requests", "CreatedAt", "CREATED_AT"],
  ["feature_requests", "LegacyRequestCode", "LEGACY_REQUEST_CODE"],
  ["feature_requests", "AppArea", "APP_AREA"],
  ["feature_requests", "ScreenID", "SCREEN_ID"],
  ["feature_requests", "ScreenName", "SCREEN_NAME"],
  ["feature_requests", "Origin", "ORIGIN"],
  ["feature_request_votes", "VoteID", "VOTE_ID"],
  ["feature_request_votes", "FeatureRequestID", "FEATURE_REQUEST_ID"],
  ["feature_request_votes", "SessionID", "SESSION_ID"],
  ["feature_request_votes", "VoteValue", "VOTE_VALUE"],
  ["feature_request_votes", "CreatedAt", "CREATED_AT"],
  ["feedback", "FeedbackID", "FEEDBACK_ID"],
  ["feedback", "ProductID", "PRODUCT_ID"],
  ["feedback", "FeatureID", "FEATURE_ID"],
  ["feedback", "ScreenID", "SCREEN_ID"],
  ["feedback", "FeedbackType", "FEEDBACK_TYPE"],
  ["feedback", "FeedbackText", "FEEDBACK_TEXT"],
  ["feedback", "Role", "ROLE"],
  ["feedback", "CreatedAt", "CREATED_AT"],
  ["feedback", "AppArea", "APP_AREA"],
  ["feedback", "ScreenName", "SCREEN_NAME"],
  ["kudos", "KudosID", "KUDOS_ID"],
  ["kudos", "ProductID", "PRODUCT_ID"],
  ["kudos", "FeatureID", "FEATURE_ID"],
  ["kudos", "ScreenID", "SCREEN_ID"],
  ["kudos", "QuoteText", "QUOTE_TEXT"],
  ["kudos", "Role", "ROLE"],
  ["kudos", "ConsentPublic", "CONSENT_PUBLIC"],
  ["kudos", "CreatedAt", "CREATED_AT"],
  ["kudos", "AppArea", "APP_AREA"],
  ["kudos", "ScreenName", "SCREEN_NAME"],
].forEach(([tableName, from, to]) => renameColumnIfExists(tableName, from, to));

[
  ["categories", ["CATEGORY_ID", "CATEGORY_NAME", "DESCRIPTION"]],
  ["subcategories", ["SUBCATEGORY_ID", "CATEGORY_ID", "SUBCATEGORY_NAME", "DESCRIPTION"]],
  ["products", ["PRODUCT_ID", "SUBCATEGORY_ID", "PRODUCT_NAME", "DESCRIPTION", "PRODUCT_STATUS", "LEGACY_PRODUCT_CODE"]],
  ["features", ["FEATURE_ID", "PRODUCT_ID", "FEATURE_NAME", "FEATURE_DESCRIPTION", "FEATURE_STATUS", "MODULE_NAME", "LEGACY_FEATURE_CODE"]],
  ["screens", ["SCREEN_ID", "PRODUCT_ID", "SCREEN_NAME", "SCREEN_CATEGORY", "SCREEN_DESCRIPTION", "LEGACY_SCREEN_CODE"]],
  ["feature_areas", ["FEATURE_AREA_ID", "FEATURE_AREA_NAME", "PRODUCT_ID"]],
  ["feature_requests", ["FEATURE_REQUEST_ID", "PRODUCT_ID", "CONVERTED_FEATURE_ID", "TITLE", "DESCRIPTION", "WORKFLOW_CONTEXT", "STATUS", "CREATED_AT"]],
  ["feature_request_votes", ["VOTE_ID", "FEATURE_REQUEST_ID", "SESSION_ID", "VOTE_VALUE", "CREATED_AT"]],
  ["feedback", ["FEEDBACK_ID", "PRODUCT_ID", "FEATURE_ID", "SCREEN_ID", "FEEDBACK_TYPE", "FEEDBACK_TEXT", "ROLE", "CREATED_AT"]],
  ["kudos", ["KUDOS_ID", "PRODUCT_ID", "FEATURE_ID", "SCREEN_ID", "QUOTE_TEXT", "ROLE", "CONSENT_PUBLIC", "CREATED_AT"]],
].forEach(([tableName, expectedColumns]) => ensureExpectedTableShape(tableName, expectedColumns));

db.transaction(() => {
  db.pragma("foreign_keys = OFF");
  const existing = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
  `).all().map((row) => String(row.name));
  const keep = new Set(ERD_TABLES.map((name) => name.toLowerCase()));
  for (const tableName of existing) {
    if (keep.has(tableName.toLowerCase())) {
      continue;
    }
    db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)};`);
    // eslint-disable-next-line no-console
    console.warn(`[api] dropped non-ERD table ${tableName}`);
  }
  db.pragma("foreign_keys = ON");
})();

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    CATEGORY_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    CATEGORY_NAME TEXT NOT NULL UNIQUE,
    DESCRIPTION TEXT
  );

  CREATE TABLE IF NOT EXISTS subcategories (
    SUBCATEGORY_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    CATEGORY_ID INTEGER NOT NULL,
    SUBCATEGORY_NAME TEXT NOT NULL,
    DESCRIPTION TEXT,
    UNIQUE (CATEGORY_ID, SUBCATEGORY_NAME),
    FOREIGN KEY (CATEGORY_ID) REFERENCES categories(CATEGORY_ID)
  );

  CREATE TABLE IF NOT EXISTS products (
    PRODUCT_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    SUBCATEGORY_ID INTEGER NOT NULL,
    PRODUCT_NAME TEXT NOT NULL,
    DESCRIPTION TEXT,
    PRODUCT_STATUS TEXT NOT NULL DEFAULT 'active',
    LEGACY_PRODUCT_CODE TEXT UNIQUE,
    UNIQUE (SUBCATEGORY_ID, PRODUCT_NAME),
    FOREIGN KEY (SUBCATEGORY_ID) REFERENCES subcategories(SUBCATEGORY_ID)
  );

  CREATE TABLE IF NOT EXISTS features (
    FEATURE_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    FEATURE_NAME TEXT NOT NULL,
    FEATURE_DESCRIPTION TEXT,
    FEATURE_STATUS TEXT,
    MODULE_NAME TEXT,
    LEGACY_FEATURE_CODE TEXT UNIQUE,
    UNIQUE (PRODUCT_ID, FEATURE_NAME),
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID)
  );

  CREATE TABLE IF NOT EXISTS screens (
    SCREEN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    SCREEN_NAME TEXT NOT NULL,
    SCREEN_CATEGORY TEXT,
    SCREEN_DESCRIPTION TEXT,
    LEGACY_SCREEN_CODE TEXT UNIQUE,
    UNIQUE (PRODUCT_ID, SCREEN_NAME),
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID)
  );

  CREATE TABLE IF NOT EXISTS feature_areas (
    FEATURE_AREA_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    FEATURE_AREA_NAME TEXT NOT NULL,
    PRODUCT_ID INTEGER NOT NULL,
    UNIQUE (PRODUCT_ID, FEATURE_AREA_NAME),
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID)
  );

  CREATE TABLE IF NOT EXISTS feature_requests (
    FEATURE_REQUEST_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    CONVERTED_FEATURE_ID INTEGER,
    TITLE TEXT NOT NULL,
    DESCRIPTION TEXT,
    WORKFLOW_CONTEXT TEXT,
    STATUS TEXT NOT NULL DEFAULT 'open',
    CREATED_AT TEXT NOT NULL,
    LEGACY_REQUEST_CODE TEXT UNIQUE,
    APP_AREA TEXT,
    SCREEN_ID INTEGER,
    SCREEN_NAME TEXT,
    ORIGIN TEXT,
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID),
    FOREIGN KEY (CONVERTED_FEATURE_ID) REFERENCES features(FEATURE_ID),
    FOREIGN KEY (SCREEN_ID) REFERENCES screens(SCREEN_ID)
  );

  CREATE TABLE IF NOT EXISTS feature_request_votes (
    VOTE_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    FEATURE_REQUEST_ID INTEGER NOT NULL,
    SESSION_ID TEXT NOT NULL,
    VOTE_VALUE INTEGER NOT NULL CHECK (VOTE_VALUE IN (-1, 1)),
    CREATED_AT TEXT NOT NULL,
    FOREIGN KEY (FEATURE_REQUEST_ID) REFERENCES feature_requests(FEATURE_REQUEST_ID)
  );

  CREATE TABLE IF NOT EXISTS feedback (
    FEEDBACK_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    FEATURE_ID INTEGER,
    SCREEN_ID INTEGER,
    FEEDBACK_TYPE TEXT NOT NULL CHECK (FEEDBACK_TYPE IN ('issue','suggestion','missing','works-well')),
    FEEDBACK_TEXT TEXT,
    ROLE TEXT NOT NULL DEFAULT 'unspecified',
    CREATED_AT TEXT NOT NULL,
    APP_AREA TEXT,
    SCREEN_NAME TEXT,
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID),
    FOREIGN KEY (FEATURE_ID) REFERENCES features(FEATURE_ID),
    FOREIGN KEY (SCREEN_ID) REFERENCES screens(SCREEN_ID)
  );

  CREATE TABLE IF NOT EXISTS kudos (
    KUDOS_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    FEATURE_ID INTEGER,
    SCREEN_ID INTEGER,
    QUOTE_TEXT TEXT NOT NULL,
    ROLE TEXT NOT NULL,
    CONSENT_PUBLIC INTEGER NOT NULL DEFAULT 0,
    CREATED_AT TEXT NOT NULL,
    APP_AREA TEXT,
    SCREEN_NAME TEXT,
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID),
    FOREIGN KEY (FEATURE_ID) REFERENCES features(FEATURE_ID),
    FOREIGN KEY (SCREEN_ID) REFERENCES screens(SCREEN_ID)
  );

  CREATE INDEX IF NOT EXISTS idx_features_product ON features(PRODUCT_ID);
  CREATE INDEX IF NOT EXISTS idx_screens_product ON screens(PRODUCT_ID);
  CREATE INDEX IF NOT EXISTS idx_feature_areas_product ON feature_areas(PRODUCT_ID);
  CREATE INDEX IF NOT EXISTS idx_feature_requests_product_created ON feature_requests(PRODUCT_ID, CREATED_AT);
  CREATE INDEX IF NOT EXISTS idx_feature_request_votes_request ON feature_request_votes(FEATURE_REQUEST_ID);
  CREATE INDEX IF NOT EXISTS idx_feedback_product_feature_screen_created ON feedback(PRODUCT_ID, FEATURE_ID, SCREEN_ID, CREATED_AT);
  CREATE INDEX IF NOT EXISTS idx_kudos_product_feature_screen_created ON kudos(PRODUCT_ID, FEATURE_ID, SCREEN_ID, CREATED_AT);
`);

const configuredMaxBodyBytes = Number(process.env.API_MAX_BODY_BYTES ?? 256 * 1024);
const MAX_BODY_BYTES = Number.isFinite(configuredMaxBodyBytes) && configuredMaxBodyBytes > 0
  ? Math.floor(configuredMaxBodyBytes)
  : 256 * 1024;
const readBody = createJsonBodyReader(MAX_BODY_BYTES);

const resolveCorsAllowOrigin = (request) => {
  const requestOrigin = String(request?.headers?.origin ?? "").trim();
  if (configuredCorsOrigins.length === 0) {
    return requestOrigin || "*";
  }
  if (configuredCorsOrigins.includes("*")) {
    return requestOrigin || "*";
  }
  if (requestOrigin && configuredCorsOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return configuredCorsOrigins[0];
};

const buildCorsHeaders = (request, methods = "GET,POST,PATCH,DELETE,OPTIONS") => ({
  "access-control-allow-origin": resolveCorsAllowOrigin(request),
  "access-control-allow-methods": methods,
  "access-control-allow-headers": "content-type,authorization",
  vary: "origin",
});

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...buildCorsHeaders(response.req),
  });
  response.end(JSON.stringify(payload));
};

const createRequestAbortController = (request, response) => {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
    cleanup();
  };
  const cleanup = () => {
    request.off("aborted", abort);
    response.off("close", abort);
    response.off("finish", cleanup);
  };
  request.on("aborted", abort);
  response.on("close", abort);
  response.on("finish", cleanup);
  return { controller, cleanup };
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const WRITE_RATE_LIMIT_MAX = Math.max(10, Number(process.env.API_RATE_LIMIT_WRITES_PER_MINUTE ?? 180));
const SYNTHESIS_RATE_LIMIT_MAX = Math.max(3, Number(process.env.API_RATE_LIMIT_SYNTHESIS_PER_MINUTE ?? 20));
const AUTH_RATE_LIMIT_MAX = Math.max(3, Number(process.env.API_RATE_LIMIT_AUTH_PER_MINUTE ?? 30));
const applyRateLimit = createRateLimiter();
const checkRateLimit = ({ request, bucket, max, windowMs = RATE_LIMIT_WINDOW_MS }) =>
  applyRateLimit({ request, bucket, max, windowMs });

const toAppArea = (value) => {
  if (value === "Digital Experience") return "digital-experience";
  if (value === "Origination") return "origination";
  if (value === "Credit & Risk" || value === "Customer Risk & Credit") return "credit-risk";
  if (value === "Servicing" || value === "SBA & Re-Amort, Servicing") return "servicing";
  if (value === "Monitoring & Controls") return "monitoring-controls";
  if (value === "Syndication / Complex Lending" || value === "Syndication") return "syndication-complex-lending";
  if (value === "Analytics & Inquiry") return "analytics-inquiry";
  return "platform-services";
};

const resolveProductByLegacyCode = db.prepare("SELECT PRODUCT_ID AS ProductID FROM products WHERE LEGACY_PRODUCT_CODE = ?");
const resolveFeatureByLegacyCode = db.prepare("SELECT FEATURE_ID AS FeatureID, PRODUCT_ID AS ProductID, FEATURE_NAME AS FeatureName, MODULE_NAME AS ModuleName FROM features WHERE LEGACY_FEATURE_CODE = ?");
const resolveScreenByLegacyCode = db.prepare("SELECT SCREEN_ID AS ScreenID, PRODUCT_ID AS ProductID, SCREEN_NAME AS ScreenName, SCREEN_CATEGORY AS ScreenCategory FROM screens WHERE LEGACY_SCREEN_CODE = ?");
const resolveFeatureByName = db.prepare("SELECT FEATURE_ID AS FeatureID, PRODUCT_ID AS ProductID, FEATURE_NAME AS FeatureName, MODULE_NAME AS ModuleName FROM features WHERE lower(FEATURE_NAME) = lower(?)");
const resolveScreenByName = db.prepare("SELECT SCREEN_ID AS ScreenID, PRODUCT_ID AS ProductID, SCREEN_NAME AS ScreenName, SCREEN_CATEGORY AS ScreenCategory FROM screens WHERE lower(SCREEN_NAME) = lower(?)");

const buildAdminTablesDb = () => {
  const tableNames = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all()
    .map((row) => String(row.name))
    .filter((name) => ERD_TABLES.includes(name.toLowerCase()));

  return tableNames.map((tableName) => {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => String(row.name));
    const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all();
    return { id: tableName, label: tableName, columns, rows };
  });
};

const bootstrapPayloadDb = () => {
  const products = db.prepare(`
    SELECT p.PRODUCT_ID AS id, p.PRODUCT_NAME AS name, p.PRODUCT_STATUS AS status, p.DESCRIPTION AS description,
      p.LEGACY_PRODUCT_CODE AS legacyProductCode, s.SUBCATEGORY_NAME AS subcategory, c.CATEGORY_NAME AS category
    FROM products p
    JOIN subcategories s ON s.SUBCATEGORY_ID = p.SUBCATEGORY_ID
    JOIN categories c ON c.CATEGORY_ID = s.CATEGORY_ID
    ORDER BY p.PRODUCT_ID
  `).all();

  const features = db.prepare(`
    SELECT f.FEATURE_ID AS id, f.PRODUCT_ID AS productId, f.FEATURE_NAME AS name, f.FEATURE_DESCRIPTION AS description,
      f.FEATURE_STATUS AS status, f.MODULE_NAME AS moduleName, f.LEGACY_FEATURE_CODE AS legacyFeatureCode
    FROM features f
    ORDER BY f.FEATURE_ID
  `).all();

  const screenRows = db.prepare(`
    SELECT s.SCREEN_ID AS id, s.PRODUCT_ID AS productId, s.SCREEN_NAME AS name, s.SCREEN_CATEGORY AS screenCategory,
      s.SCREEN_DESCRIPTION AS description, s.LEGACY_SCREEN_CODE AS legacyScreenCode
    FROM screens s
    ORDER BY s.SCREEN_ID
  `).all();
  const screens = withSeedScreenAssets(screenRows);

  const featureRequests = db.prepare(`
    SELECT fr.FEATURE_REQUEST_ID AS id, fr.PRODUCT_ID AS productId, fr.CONVERTED_FEATURE_ID AS convertedFeatureId,
      fr.SCREEN_ID AS screenId, fr.TITLE AS title, fr.DESCRIPTION AS description,
      fr.WORKFLOW_CONTEXT AS workflowContext, fr.STATUS AS status, fr.CREATED_AT AS createdAt, fr.LEGACY_REQUEST_CODE AS legacyRequestCode,
      fr.ORIGIN AS origin, COALESCE(SUM(frv.VOTE_VALUE), 0) AS votes
    FROM feature_requests fr
    LEFT JOIN feature_request_votes frv ON frv.FEATURE_REQUEST_ID = fr.FEATURE_REQUEST_ID
    GROUP BY fr.FEATURE_REQUEST_ID
    ORDER BY fr.CREATED_AT DESC
  `).all();

  const feedback = db.prepare(`
    SELECT FEEDBACK_ID AS id, PRODUCT_ID AS productId, FEATURE_ID AS featureId, SCREEN_ID AS screenId, APP_AREA AS app,
      SCREEN_NAME AS screenName, FEEDBACK_TYPE AS type, FEEDBACK_TEXT AS text, ROLE AS role, CREATED_AT AS createdAt
    FROM feedback ORDER BY CREATED_AT DESC
  `).all();

  const kudos = db.prepare(`
    SELECT KUDOS_ID AS id, PRODUCT_ID AS productId, FEATURE_ID AS featureId, SCREEN_ID AS screenId,
      QUOTE_TEXT AS text, ROLE AS role, CONSENT_PUBLIC AS consentPublic, CREATED_AT AS createdAt
    FROM kudos ORDER BY CREATED_AT DESC
  `).all();

  const tables = buildAdminTablesDb();

  return { products, features, screens, featureRequests, screenFeedback: feedback, kudosQuotes: kudos, appAreas: [], cardSortConcepts: [], adminTables: tables };
};

const buildAdminTablesPostgresFromClient = async (client) => {
  const names = (
    await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
    )
  ).rows
    .map((row) => String(row.table_name))
    .filter((name) => ERD_TABLES.includes(name.toLowerCase()));

  const tables = [];
  for (const tableName of names) {
    const columnRows = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName],
    );
    const rowData = await client.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
    tables.push({
      id: tableName,
      label: tableName,
      columns: columnRows.rows.map((row) => String(row.column_name)),
      rows: rowData.rows,
    });
  }
  return tables;
};

const buildAdminTablesPostgres = async () =>
  withPostgresClient(async (client) => buildAdminTablesPostgresFromClient(client));

const bootstrapPayloadPostgres = async () =>
  withPostgresClient(async (client) => {
    const products = (
      await client.query(`
        SELECT p.product_id AS id, p.product_name AS name, p.product_status AS status, p.description AS description,
          p.legacy_product_code AS "legacyProductCode", s.subcategory_name AS subcategory, c.category_name AS category
        FROM products p
        JOIN subcategories s ON s.subcategory_id = p.subcategory_id
        JOIN categories c ON c.category_id = s.category_id
        ORDER BY p.product_id
      `)
    ).rows;

    const features = (
      await client.query(`
        SELECT f.feature_id AS id, f.product_id AS "productId", f.feature_name AS name, f.feature_description AS description,
          f.feature_status AS status, f.module_name AS "moduleName", f.legacy_feature_code AS "legacyFeatureCode"
        FROM features f
        ORDER BY f.feature_id
      `)
    ).rows;

    const screenRows = (
      await client.query(`
        SELECT s.screen_id AS id, s.product_id AS "productId", s.screen_name AS name, s.screen_category AS "screenCategory",
          s.screen_description AS description, s.legacy_screen_code AS "legacyScreenCode"
        FROM screens s
        ORDER BY s.screen_id
      `)
    ).rows;
    const screens = withSeedScreenAssets(screenRows);

    const featureRequests = (
      await client.query(`
        SELECT fr.feature_request_id AS id, fr.product_id AS "productId", fr.converted_feature_id AS "convertedFeatureId",
          fr.screen_id AS "screenId", fr.title AS title, fr.description AS description,
          fr.workflow_context AS "workflowContext", fr.status AS status, fr.created_at AS "createdAt", fr.legacy_request_code AS "legacyRequestCode",
          fr.origin AS origin, COALESCE(SUM(frv.vote_value), 0) AS votes
        FROM feature_requests fr
        LEFT JOIN feature_request_votes frv ON frv.feature_request_id = fr.feature_request_id
        GROUP BY fr.feature_request_id
        ORDER BY fr.created_at DESC
      `)
    ).rows;

    const screenFeedback = (
      await client.query(`
        SELECT feedback_id AS id, product_id AS "productId", feature_id AS "featureId", screen_id AS "screenId", app_area AS app,
          screen_name AS "screenName", feedback_type AS type, feedback_text AS text, role AS role, created_at AS "createdAt"
        FROM feedback
        ORDER BY created_at DESC
      `)
    ).rows;

    const kudosQuotes = (
      await client.query(`
        SELECT kudos_id AS id, product_id AS "productId", feature_id AS "featureId", screen_id AS "screenId",
          quote_text AS text, role AS role, consent_public AS "consentPublic", created_at AS "createdAt"
        FROM kudos
        ORDER BY created_at DESC
      `)
    ).rows;

    const adminTables = await buildAdminTablesPostgresFromClient(client);

    return { products, features, screens, featureRequests, screenFeedback, kudosQuotes, appAreas: [], cardSortConcepts: [], adminTables: adminTables };
  });

const toFlatBootstrap = () => {
  const core = getFlatCoreSeeds();
  const merged = buildFlatMergedSignals();
  const productIdByLegacy = new Map();
  const products = core.products.map((row, index) => {
    const id = index + 1;
    productIdByLegacy.set(String(row.id), id);
    return {
      id,
      name: String(row.name ?? ""),
      status: "active",
      description: String(row.name ?? ""),
      legacyProductCode: String(row.id ?? ""),
      category: String(row.category ?? ""),
      subcategory: String(row.subcategory ?? ""),
    };
  });

  const categoryLabelById = new Map(
    core.productFeatureCategories.map((row) => [String(row.id ?? ""), String(row.category ?? "Platform Services")]),
  );
  const features = core.productFeatures.map((row, index) => ({
    id: index + 1,
    productId: productIdByLegacy.get(String(row.product_id ?? "")) ?? products[0]?.id ?? 1,
    name: String(row.name ?? ""),
    description: String(row.description ?? `Capture feedback for ${String(row.name ?? "")}.`),
    status: String(row.status ?? "planned"),
    moduleName: categoryLabelById.get(String(row.feature_category_id ?? "")) ?? "Platform Services",
    legacyFeatureCode: String(row.id ?? ""),
  }));

  const featureByName = new Map(features.map((row) => [row.name.toLowerCase(), row]));
  const screenLibraryByLegacy = new Map(
    core.screenLibrary.map((screen) => [String(screen.id ?? ""), screen]),
  );
  const screenLibraryByName = new Map(
    core.screenLibrary.map((screen) => [String(screen.name ?? "").toLowerCase(), screen]),
  );
  // Use product feature rows as canonical screen list so PRD-005 retains full 51 features.
  const screenRows = core.productFeatures.length > 0 ? core.productFeatures : core.screenLibrary;
  const screens = screenRows.map((row, index) => {
    const name = String(row.name ?? "");
    const matchedFeature = featureByName.get(name.toLowerCase());
    const matchedScreenLibrary =
      screenLibraryByLegacy.get(String(row.id ?? "")) ?? screenLibraryByName.get(name.toLowerCase());
    const app = String(
      matchedScreenLibrary?.app ?? row.app ?? toAppArea(matchedFeature?.moduleName ?? "Platform Services"),
    );
    return {
      id: index + 1,
      productId: matchedFeature?.productId ?? products[0]?.id ?? 1,
      name,
      screenCategory: app,
      description: String(matchedScreenLibrary?.description ?? row.description ?? ""),
      legacyScreenCode: String(matchedScreenLibrary?.id ?? row.id ?? `screen-${index + 1}`),
      thumbnailAssetPath: String(matchedScreenLibrary?.thumbnailAssetPath ?? "splash-wall-hero.png"),
      assets: Array.isArray(matchedScreenLibrary?.assets)
        ? matchedScreenLibrary.assets
            .filter((asset) => typeof asset === "string" && asset.trim().length > 0)
            .map((asset) => String(asset))
        : [],
    };
  });

  const screenByLegacy = new Map(screens.map((screen) => [String(screen.legacyScreenCode), screen]));
  const screenByName = new Map(screens.map((screen) => [String(screen.name).toLowerCase(), screen]));

  const resolveScreen = (screenId, screenName) => {
    if (screenId != null) {
      const byLegacy = screenByLegacy.get(String(screenId));
      if (byLegacy) return byLegacy;
      const byId = screens.find((screen) => Number(screen.id) === Number(screenId));
      if (byId) return byId;
    }
    if (screenName) {
      return screenByName.get(String(screenName).toLowerCase());
    }
    return screens[0];
  };

  const featureRequests = merged.featureRequests.map((row, index) => {
    const screen = row.screenId != null || row.screenName ? resolveScreen(row.screenId, row.screenName) : null;
    const explicitProductId = Number(row.productId);
    return {
      id: String(row.id ?? `fr-${index + 1}`),
      productId: Number.isFinite(explicitProductId) ? explicitProductId : screen?.productId ?? products[0]?.id ?? 1,
      convertedFeatureId: null,
      screenId: row.screenId == null ? null : screen?.id ?? row.screenId,
      title: String(row.title ?? ""),
      description: String(row.description ?? row.title ?? ""),
      workflowContext: row.workflowContext ?? null,
      status: String(row.status ?? "open"),
      createdAt: String(row.createdAt ?? nowIso()),
      legacyRequestCode: String(row.id ?? ""),
      origin: String(row.origin ?? "kiosk"),
      votes: Math.max(0, Number(row.votes ?? 0)),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const screenFeedback = merged.screenFeedback.map((row, index) => {
    const screen = resolveScreen(row.screenId, row.screenName);
    return {
      id: String(row.id ?? `sfb-${index + 1}`),
      productId: screen?.productId ?? products[0]?.id ?? 1,
      featureId: featureByName.get(String(screen?.name ?? row.screenName ?? "").toLowerCase())?.id,
      screenId: screen?.id,
      app: row.app ?? screen?.screenCategory ?? "servicing",
      screenName: screen?.name ?? String(row.screenName ?? ""),
      type: String(row.type ?? "suggestion"),
      text: row.text == null ? null : String(row.text),
      role: normalizeRole(row.role),
      createdAt: String(row.createdAt ?? nowIso()),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const kudosQuotes = merged.kudos.map((row, index) => {
    const screen = row.screenId != null || row.screenName ? resolveScreen(row.screenId, row.screenName) : null;
    const explicitProductId = Number(row.productId);
    return {
      id: String(row.id ?? `kd-${index + 1}`),
      productId: Number.isFinite(explicitProductId) ? explicitProductId : screen?.productId ?? products[0]?.id ?? 1,
      featureId: featureByName.get(String(screen?.name ?? row.screenName ?? "").toLowerCase())?.id,
      screenId: row.screenId == null ? null : screen?.id ?? row.screenId,
      text: String(row.text ?? ""),
      role: normalizeRole(row.role),
      consentPublic: Boolean(row.consentPublic ?? row.isPublicSafe),
      createdAt: String(row.createdAt ?? nowIso()),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return {
    appAreas: core.appAreas,
    cardSortConcepts: core.cardSortConcepts,
    products,
    features,
    screens,
    featureRequests,
    screenFeedback,
    kudosQuotes,
    adminTables: [],
  };
};

const buildAdminTables = async () => {
  if (!useDbDataSource) return toFlatBootstrap().adminTables;
  if (usePostgresDb) return buildAdminTablesPostgres();
  return buildAdminTablesDb();
};
const bootstrapPayload = async () => {
  if (!useDbDataSource) return toFlatBootstrap();
  if (usePostgresDb) return bootstrapPayloadPostgres();
  return bootstrapPayloadDb();
};

const reseed = (payload) => {
  const tables = Array.isArray(payload.tables) ? payload.tables : [];
  const screenLibrary = Array.isArray(payload.screenLibrary) ? payload.screenLibrary : [];
  const featureRequests = Array.isArray(payload.featureRequests) && payload.featureRequests.length > 0
    ? payload.featureRequests
    : loadJsonSeed("featureRequests.seed.json");
  const kudosQuotes = Array.isArray(payload.kudosQuotes) && payload.kudosQuotes.length > 0
    ? payload.kudosQuotes
    : loadJsonSeed("kudos.seed.json");
  const screenFeedback = Array.isArray(payload.screenFeedback) && payload.screenFeedback.length > 0
    ? payload.screenFeedback
    : loadJsonSeed("screenFeedback.seed.json");

  const findRows = (id) => tables.find((table) => table.id === id)?.rows ?? [];
  const productsRows = findRows("products");
  const productFeaturesRows = findRows("product_features");
  const productFeatureCategoriesRows = findRows("product_feature_categories");

  const categoryById = new Map(productFeatureCategoriesRows.map((row) => [String(row.id), String(row.category)]));

  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM feature_request_votes;
      DELETE FROM feature_requests;
      DELETE FROM feature_areas;
      DELETE FROM feedback;
      DELETE FROM kudos;
      DELETE FROM screens;
      DELETE FROM features;
      DELETE FROM products;
      DELETE FROM subcategories;
      DELETE FROM categories;
      DELETE FROM sqlite_sequence;
    `);

    const insertCategory = db.prepare("INSERT INTO categories (CATEGORY_NAME, DESCRIPTION) VALUES (?, ?)");
    const insertSubcategory = db.prepare("INSERT INTO subcategories (CATEGORY_ID, SUBCATEGORY_NAME, DESCRIPTION) VALUES (?, ?, ?)");
    const insertProduct = db.prepare("INSERT INTO products (SUBCATEGORY_ID, PRODUCT_NAME, DESCRIPTION, PRODUCT_STATUS, LEGACY_PRODUCT_CODE) VALUES (?, ?, ?, ?, ?)");
    const insertFeature = db.prepare("INSERT INTO features (PRODUCT_ID, FEATURE_NAME, FEATURE_DESCRIPTION, FEATURE_STATUS, MODULE_NAME, LEGACY_FEATURE_CODE) VALUES (?, ?, ?, ?, ?, ?)");
    const insertScreen = db.prepare("INSERT INTO screens (PRODUCT_ID, SCREEN_NAME, SCREEN_CATEGORY, SCREEN_DESCRIPTION, LEGACY_SCREEN_CODE) VALUES (?, ?, ?, ?, ?)");
    const insertFeatureArea = db.prepare("INSERT OR IGNORE INTO feature_areas (FEATURE_AREA_NAME, PRODUCT_ID) VALUES (?, ?)");
    const insertFeatureRequest = db.prepare(`
      INSERT INTO feature_requests (PRODUCT_ID, CONVERTED_FEATURE_ID, TITLE, DESCRIPTION, WORKFLOW_CONTEXT, STATUS, CREATED_AT, LEGACY_REQUEST_CODE, APP_AREA, SCREEN_ID, SCREEN_NAME, ORIGIN)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertVote = db.prepare("INSERT INTO feature_request_votes (FEATURE_REQUEST_ID, SESSION_ID, VOTE_VALUE, CREATED_AT) VALUES (?, ?, ?, ?)");
    const insertFeedback = db.prepare("INSERT INTO feedback (PRODUCT_ID, FEATURE_ID, SCREEN_ID, FEEDBACK_TYPE, FEEDBACK_TEXT, ROLE, CREATED_AT, APP_AREA, SCREEN_NAME) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertKudos = db.prepare("INSERT INTO kudos (PRODUCT_ID, FEATURE_ID, SCREEN_ID, QUOTE_TEXT, ROLE, CONSENT_PUBLIC, CREATED_AT, APP_AREA, SCREEN_NAME) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

    const categoryIdByName = new Map();
    const subcategoryIdByKey = new Map();
    const productIdByLegacyCode = new Map();
    const featureIdByLegacyCode = new Map();
    const featureIdByName = new Map();
    const screenIdByLegacyCode = new Map();
    const screenByName = new Map();
    const featureRequestIdByLegacy = new Map();

    for (const row of productsRows) {
      const categoryName = String(row.category ?? "");
      const rawSubcategory = String(row.subcategory ?? "");
      const subcategoryName = SUBCATEGORY_NAME_OVERRIDES[rawSubcategory] ?? rawSubcategory;
      if (!categoryIdByName.has(categoryName)) {
        const description = CATEGORY_DESCRIPTIONS[categoryName] ?? `${categoryName} category`;
        const info = insertCategory.run(categoryName, description);
        categoryIdByName.set(categoryName, Number(info.lastInsertRowid));
      }
      const categoryId = categoryIdByName.get(categoryName);
      const subKey = `${categoryId}::${subcategoryName}`;
      if (!subcategoryIdByKey.has(subKey)) {
        const info = insertSubcategory.run(categoryId, subcategoryName, `${subcategoryName} subcategory`);
        subcategoryIdByKey.set(subKey, Number(info.lastInsertRowid));
      }
      const subcategoryId = subcategoryIdByKey.get(subKey);
      const legacyCode = String(row.id ?? "");
      const info = insertProduct.run(subcategoryId, String(row.name ?? ""), String(row.name ?? ""), "active", legacyCode);
      productIdByLegacyCode.set(legacyCode, Number(info.lastInsertRowid));
    }

    const defaultProductId = productIdByLegacyCode.get("PRD-005") ?? [...productIdByLegacyCode.values()][0];

    for (const row of productFeaturesRows) {
      const legacyCode = String(row.id ?? "");
      const productId = productIdByLegacyCode.get(String(row.product_id ?? "")) ?? defaultProductId;
      const categoryLabel = categoryById.get(String(row.feature_category_id ?? "")) ?? "Platform Services";
      insertFeatureArea.run(categoryLabel, productId);
      const name = String(row.name ?? "");
      const info = insertFeature.run(
        productId,
        name,
        String(row.description ?? `Capture feedback for ${name}.`),
        String(row.status ?? "planned"),
        categoryLabel,
        legacyCode,
      );
      const featureId = Number(info.lastInsertRowid);
      featureIdByLegacyCode.set(legacyCode, featureId);
      featureIdByName.set(name.toLowerCase(), featureId);
    }

    for (const row of screenLibrary) {
      const name = String(row.name ?? "");
      const legacyCode = String(row.id ?? "");
      const maybeFeatureId = featureIdByName.get(name.toLowerCase());
      const productId = maybeFeatureId
        ? db.prepare("SELECT PRODUCT_ID AS ProductID FROM features WHERE FEATURE_ID = ?").get(maybeFeatureId)?.ProductID ?? defaultProductId
        : defaultProductId;
      const info = insertScreen.run(
        productId,
        name,
        String(row.app ?? "platform-services"),
        String(row.description ?? ""),
        legacyCode,
      );
      const screenId = Number(info.lastInsertRowid);
      screenIdByLegacyCode.set(legacyCode, screenId);
      screenByName.set(name.toLowerCase(), { screenId, productId, screenName: name, app: String(row.app ?? "platform-services") });
    }

    for (const row of featureRequests) {
      const screen = row.screenId ? resolveScreenByLegacyCode.get(String(row.screenId)) : null;
      const byName = !screen && row.screenName ? resolveScreenByName.get(String(row.screenName)) : null;
      const screenId = screen?.ScreenID ?? byName?.ScreenID ?? null;
      const productId = screen?.ProductID ?? byName?.ProductID ?? defaultProductId;
      const convertedFeatureId = row.convertedFeatureId ?? null;
      const res = insertFeatureRequest.run(
        productId,
        convertedFeatureId,
        String(row.title ?? ""),
        String(row.description ?? row.title ?? ""),
        row.workflowContext == null ? null : String(row.workflowContext),
        String(row.status ?? "open"),
        String(row.createdAt ?? nowIso()),
        String(row.id ?? ""),
        null,
        screenId,
        null,
        row.origin == null ? null : String(row.origin),
      );
      const requestId = Number(res.lastInsertRowid);
      featureRequestIdByLegacy.set(String(row.id ?? ""), requestId);
      const voteCount = Math.max(0, Number(row.votes ?? 1));
      for (let i = 0; i < voteCount; i += 1) {
        insertVote.run(requestId, `seed-${requestId}-${i + 1}`, 1, String(row.createdAt ?? nowIso()));
      }
    }

    for (const row of screenFeedback) {
      const screen = row.screenId ? resolveScreenByLegacyCode.get(String(row.screenId)) : null;
      const byName = !screen && row.screenName ? resolveScreenByName.get(String(row.screenName)) : null;
      const screenId = screen?.ScreenID ?? byName?.ScreenID ?? null;
      const productId = screen?.ProductID ?? byName?.ProductID ?? defaultProductId;
      const feature = row.screenName ? resolveFeatureByName.get(String(row.screenName)) : null;
      const featureId = feature?.FeatureID ?? null;
      insertFeedback.run(
        productId,
        featureId,
        screenId,
        String(row.type ?? "issue"),
        row.text == null ? null : String(row.text),
        "unspecified",
        String(row.createdAt ?? nowIso()),
        String(row.app ?? screen?.ScreenCategory ?? byName?.ScreenCategory ?? "servicing"),
        String(row.screenName ?? screen?.ScreenName ?? byName?.ScreenName ?? ""),
      );
    }

    for (const row of kudosQuotes) {
      const screen = row.screenId ? resolveScreenByLegacyCode.get(String(row.screenId)) : null;
      const byName = !screen && row.screenName ? resolveScreenByName.get(String(row.screenName)) : null;
      const screenId = screen?.ScreenID ?? byName?.ScreenID ?? null;
      const productId = screen?.ProductID ?? byName?.ProductID ?? defaultProductId;
      const feature = row.screenName ? resolveFeatureByName.get(String(row.screenName)) : null;
      const featureId = feature?.FeatureID ?? null;
      insertKudos.run(
        productId,
        featureId,
        screenId,
        String(row.text ?? ""),
        String(row.role ?? "unspecified"),
        row.consentPublic ? 1 : 0,
        String(row.createdAt ?? nowIso()),
        null,
        null,
      );
    }
  });

  tx();
};

export const reseedPostgres = async () => {
  const flat = toFlatBootstrap();
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`
        TRUNCATE TABLE
          feature_request_votes,
          feature_requests,
          feature_areas,
          feedback,
          kudos,
          screens,
          features,
          products,
          subcategories,
          categories
        RESTART IDENTITY CASCADE;
      `);

      const categoryIdByName = new Map();
      const subcategoryIdByKey = new Map();
      const productDbIdByLocalId = new Map();
      const featureDbIdByLocalId = new Map();
      const screenDbIdByLocalId = new Map();

      for (const row of flat.products) {
        const categoryName = String(row.category ?? "Lending");
        let categoryId = categoryIdByName.get(categoryName);
        if (!categoryId) {
          const categoryInsert = await client.query(
            "INSERT INTO categories (category_name, description) VALUES ($1, $2) RETURNING category_id",
            [categoryName, CATEGORY_DESCRIPTIONS[categoryName] ?? `${categoryName} category`],
          );
          categoryId = Number(categoryInsert.rows[0]?.category_id);
          categoryIdByName.set(categoryName, categoryId);
        }

        const rawSubcategory = String(row.subcategory ?? "Servicing");
        const subcategoryName = SUBCATEGORY_NAME_OVERRIDES[rawSubcategory] ?? rawSubcategory;
        const subKey = `${categoryId}::${subcategoryName}`;
        let subcategoryId = subcategoryIdByKey.get(subKey);
        if (!subcategoryId) {
          const subcategoryInsert = await client.query(
            "INSERT INTO subcategories (category_id, subcategory_name, description) VALUES ($1, $2, $3) RETURNING subcategory_id",
            [categoryId, subcategoryName, `${subcategoryName} subcategory`],
          );
          subcategoryId = Number(subcategoryInsert.rows[0]?.subcategory_id);
          subcategoryIdByKey.set(subKey, subcategoryId);
        }

        const productInsert = await client.query(
          `INSERT INTO products (subcategory_id, product_name, description, product_status, legacy_product_code)
           VALUES ($1, $2, $3, $4, $5) RETURNING product_id`,
          [
            subcategoryId,
            String(row.name ?? ""),
            String(row.description ?? row.name ?? ""),
            String(row.status ?? "active"),
            String(row.legacyProductCode ?? ""),
          ],
        );
        productDbIdByLocalId.set(Number(row.id), Number(productInsert.rows[0]?.product_id));
      }

      for (const row of flat.features) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        const featureInsert = await client.query(
          `INSERT INTO features (product_id, feature_name, feature_description, feature_status, module_name, legacy_feature_code)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING feature_id`,
          [
            productId,
            String(row.name ?? ""),
            String(row.description ?? ""),
            String(row.status ?? "planned"),
            String(row.moduleName ?? "Platform Services"),
            String(row.legacyFeatureCode ?? ""),
          ],
        );
        featureDbIdByLocalId.set(Number(row.id), Number(featureInsert.rows[0]?.feature_id));
        await client.query(
          "INSERT INTO feature_areas (feature_area_name, product_id) VALUES ($1, $2) ON CONFLICT (product_id, feature_area_name) DO NOTHING",
          [String(row.moduleName ?? "Platform Services"), productId],
        );
      }

      for (const row of flat.screens) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        const screenInsert = await client.query(
          `INSERT INTO screens (product_id, screen_name, screen_category, screen_description, legacy_screen_code)
           VALUES ($1, $2, $3, $4, $5) RETURNING screen_id`,
          [
            productId,
            String(row.name ?? ""),
            String(row.screenCategory ?? "servicing"),
            String(row.description ?? ""),
            String(row.legacyScreenCode ?? ""),
          ],
        );
        screenDbIdByLocalId.set(Number(row.id), Number(screenInsert.rows[0]?.screen_id));
      }

      for (const row of flat.featureRequests) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        const featureRequestInsert = await client.query(
          `INSERT INTO feature_requests
           (product_id, converted_feature_id, title, description, workflow_context, status, created_at, legacy_request_code, app_area, screen_id, screen_name, origin)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12)
           RETURNING feature_request_id`,
          [
            productId,
            row.convertedFeatureId == null ? null : featureDbIdByLocalId.get(Number(row.convertedFeatureId)) ?? null,
            String(row.title ?? ""),
            String(row.description ?? ""),
            row.workflowContext == null ? null : String(row.workflowContext),
            String(row.status ?? "open"),
            String(row.createdAt ?? nowIso()),
            String(row.legacyRequestCode ?? row.id ?? ""),
            null,
            row.screenId == null ? null : screenDbIdByLocalId.get(Number(row.screenId)) ?? null,
            null,
            row.origin == null ? null : String(row.origin),
          ],
        );
        const requestId = Number(featureRequestInsert.rows[0]?.feature_request_id);
        const voteCount = Math.max(0, Number(row.votes ?? 0));
        for (let i = 0; i < voteCount; i += 1) {
          await client.query(
            "INSERT INTO feature_request_votes (feature_request_id, session_id, vote_value, created_at) VALUES ($1, $2, 1, $3::timestamptz)",
            [requestId, `seed-${requestId}-${i + 1}`, String(row.createdAt ?? nowIso())],
          );
        }
      }

      for (const row of flat.screenFeedback) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        await client.query(
          `INSERT INTO feedback
           (product_id, feature_id, screen_id, feedback_type, feedback_text, role, created_at, app_area, screen_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)`,
          [
            productId,
            row.featureId == null ? null : featureDbIdByLocalId.get(Number(row.featureId)) ?? null,
            row.screenId == null ? null : screenDbIdByLocalId.get(Number(row.screenId)) ?? null,
            String(row.type ?? "issue"),
            row.text == null ? null : String(row.text),
            String(row.role ?? "unspecified"),
            String(row.createdAt ?? nowIso()),
            String(row.app ?? "servicing"),
            row.screenName == null ? null : String(row.screenName),
          ],
        );
      }

      for (const row of flat.kudosQuotes) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        await client.query(
          `INSERT INTO kudos
           (product_id, feature_id, screen_id, quote_text, role, consent_public, created_at, app_area, screen_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)`,
          [
            productId,
            row.featureId == null ? null : featureDbIdByLocalId.get(Number(row.featureId)) ?? null,
            row.screenId == null ? null : screenDbIdByLocalId.get(Number(row.screenId)) ?? null,
            String(row.text ?? ""),
            String(row.role ?? "unspecified"),
            Boolean(row.consentPublic),
            String(row.createdAt ?? nowIso()),
            null,
            null,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
};

const appendFlatRuntimeFeatureRequest = (body) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const id = String(body.id ?? body.legacyRequestCode ?? `fr-runtime-${Date.now()}`);
  const entry = {
    id,
    title: String(body.title ?? ""),
    description: body.description == null ? undefined : String(body.description),
    workflowContext: body.workflowContext == null ? undefined : String(body.workflowContext),
    votes: Math.max(1, Number(body.votes ?? 1)),
    createdAt: String(body.createdAt ?? nowIso()),
    origin: String(body.origin ?? "kiosk"),
    role: normalizeRole(body.role),
  };
  runtime.featureRequests = Array.isArray(runtime.featureRequests) ? [entry, ...runtime.featureRequests] : [entry];
  writeRuntimeStore(runtimeStorePath, runtime);
  return id;
};

const incrementFlatRuntimeVote = (id) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const key = String(id ?? "");
  if (!runtime.featureRequestVoteIncrements || typeof runtime.featureRequestVoteIncrements !== "object") {
    runtime.featureRequestVoteIncrements = {};
  }
  runtime.featureRequestVoteIncrements[key] = Math.max(0, Number(runtime.featureRequestVoteIncrements[key] ?? 0) + 1);
  writeRuntimeStore(runtimeStorePath, runtime);
};

const appendFlatRuntimeKudos = (body) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const id = String(body.id ?? `kd-runtime-${Date.now()}`);
  const entry = {
    id,
    text: String(body.text ?? ""),
    role: normalizeRole(body.role),
    consentPublic: Boolean(body.consentPublic),
    createdAt: String(body.createdAt ?? nowIso()),
  };
  runtime.kudos = Array.isArray(runtime.kudos) ? [entry, ...runtime.kudos] : [entry];
  writeRuntimeStore(runtimeStorePath, runtime);
  return id;
};

const appendFlatRuntimeScreenFeedback = (body) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const id = String(body.id ?? `sfb-runtime-${Date.now()}`);
  const entry = {
    id,
    app: String(body.app ?? "servicing"),
    screenId: body.screenId ?? null,
    screenName: String(body.screenName ?? ""),
    type: String(body.type ?? "issue"),
    text: body.text == null ? undefined : String(body.text),
    followUpQuestion: body.followUpQuestion == null ? undefined : String(body.followUpQuestion),
    followUpResponse: body.followUpResponse == null ? undefined : String(body.followUpResponse),
    role: normalizeRole(body.role),
    createdAt: String(body.createdAt ?? nowIso()),
  };
  runtime.screenFeedback = Array.isArray(runtime.screenFeedback) ? [entry, ...runtime.screenFeedback] : [entry];
  writeRuntimeStore(runtimeStorePath, runtime);
  return id;
};

const upsertFlatRuntimeCardSort = (body) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const conceptTitle = String(body.conceptTitle ?? "");
  if (!conceptTitle) return;
  const nextEntry = {
    conceptTitle,
    tier: body.tier ?? null,
    reaction: body.reaction ?? (body.tier === "high" ? "excited" : "useful"),
    sessionRole: normalizeRole(body.sessionRole ?? body.role),
    updatedAt: String(body.updatedAt ?? nowIso()),
  };
  const existing = Array.isArray(runtime.cardSortResults) ? runtime.cardSortResults : [];
  const filtered = existing.filter((entry) => String(entry.conceptTitle ?? "") !== conceptTitle);
  runtime.cardSortResults = [nextEntry, ...filtered];
  writeRuntimeStore(runtimeStorePath, runtime);
};

const filterRowsForSynthesis = (rows) => {
  const featureRequests = (Array.isArray(rows.featureRequests) ? rows.featureRequests : [])
    .filter((item) => !isInputSoftDeleted("feature_request", item.id));
  const screenFeedback = (Array.isArray(rows.screenFeedback) ? rows.screenFeedback : [])
    .filter((item) => !isInputSoftDeleted("screen_feedback", item.id));
  const kudos = (Array.isArray(rows.kudos) ? rows.kudos : [])
    .filter((item) => !isInputSoftDeleted("kudos", item.id));
  return {
    featureRequests,
    screenFeedback,
    kudos,
    cardSortResults: Array.isArray(rows.cardSortResults) ? rows.cardSortResults : [],
  };
};

const loadSignalsForSynthesis = async () => {
  if (!useDbDataSource) {
    const flat = toFlatBootstrap();
    return toSynthesisSignals(filterRowsForSynthesis({
      featureRequests: flat.featureRequests,
      screenFeedback: flat.screenFeedback.map((item) => ({ ...item, appLabel: appLabelFromId(item.app) })),
      kudos: flat.kudosQuotes,
      cardSortResults: readRuntimeStore(runtimeStorePath).cardSortResults ?? [],
    }));
  }

  if (usePostgresDb) {
    const signalRows = await withPostgresClient(async (client) => {
      const featureRequests = (
        await client.query(`
          SELECT fr.feature_request_id AS id, fr.title AS title, fr.workflow_context AS "workflowContext",
            fr.origin AS origin, COALESCE(SUM(frv.vote_value), 0) AS votes
          FROM feature_requests fr
          LEFT JOIN feature_request_votes frv ON frv.feature_request_id = fr.feature_request_id
          GROUP BY fr.feature_request_id
        `)
      ).rows;

      const screenFeedback = (
        await client.query(`
          SELECT feedback_id AS id, app_area AS app, screen_name AS "screenName", feedback_type AS type,
            feedback_text AS text, role AS role
          FROM feedback
        `)
      ).rows.map((row) => ({ ...row, appLabel: appLabelFromId(row.app) }));

      const kudos = (
        await client.query(`
          SELECT kudos_id AS id, quote_text AS text, role AS role, consent_public AS "consentPublic"
          FROM kudos
        `)
      ).rows;
      return { featureRequests, screenFeedback, kudos };
    });
    const hasPostgresSignals =
      signalRows.featureRequests.length > 0 ||
      signalRows.screenFeedback.length > 0 ||
      signalRows.kudos.length > 0;
    if (!hasPostgresSignals) {
      const flat = toFlatBootstrap();
      return toSynthesisSignals(filterRowsForSynthesis({
        featureRequests: flat.featureRequests,
        screenFeedback: flat.screenFeedback.map((item) => ({ ...item, appLabel: appLabelFromId(item.app) })),
        kudos: flat.kudosQuotes,
        cardSortResults: readRuntimeStore(runtimeStorePath).cardSortResults ?? [],
      }));
    }

    return toSynthesisSignals(filterRowsForSynthesis({
      featureRequests: signalRows.featureRequests,
      screenFeedback: signalRows.screenFeedback,
      kudos: signalRows.kudos,
      cardSortResults: [],
    }));
  }

  const featureRequests = db.prepare(`
    SELECT fr.FEATURE_REQUEST_ID AS id, fr.TITLE AS title, fr.WORKFLOW_CONTEXT AS workflowContext,
      fr.ORIGIN AS origin, COALESCE(SUM(frv.VOTE_VALUE), 0) AS votes
    FROM feature_requests fr
    LEFT JOIN feature_request_votes frv ON frv.FEATURE_REQUEST_ID = fr.FEATURE_REQUEST_ID
    GROUP BY fr.FEATURE_REQUEST_ID
  `).all();

  const screenFeedback = db.prepare(`
    SELECT FEEDBACK_ID AS id, APP_AREA AS app, SCREEN_NAME AS screenName, FEEDBACK_TYPE AS type,
      FEEDBACK_TEXT AS text, ROLE AS role
    FROM feedback
  `).all().map((row) => ({ ...row, appLabel: appLabelFromId(row.app) }));

  const kudos = db.prepare(`
    SELECT KUDOS_ID AS id, QUOTE_TEXT AS text, ROLE AS role, CONSENT_PUBLIC AS consentPublic
    FROM kudos
  `).all();

  return toSynthesisSignals(filterRowsForSynthesis({
    featureRequests,
    screenFeedback,
    kudos,
    cardSortResults: [],
  }));
};

const sendSseEvent = (response, payload) => {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const hasher = (value) => crypto.createHash("sha256").update(String(value ?? "")).digest();

const timingSafePinMatch = (candidate, expected) => {
  const candidateHash = hasher(candidate);
  const expectedHash = hasher(expected);
  return crypto.timingSafeEqual(candidateHash, expectedHash);
};

const sanitizeModerationInputType = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "feature_request") return "feature_request";
  if (normalized === "screen_feedback") return "screen_feedback";
  if (normalized === "kudos") return "kudos";
  return null;
};

const buildModerationInputKey = (type, id) => {
  const safeType = sanitizeModerationInputType(type);
  if (!safeType) return null;
  return `${safeType}:${String(id ?? "").trim()}`;
};

const parseModerationRecordId = (recordId) => {
  const value = String(recordId ?? "").trim();
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const type = sanitizeModerationInputType(parts[0]);
  const id = String(parts[1] ?? "").trim();
  if (!type || !id) return null;
  return { type, id, key: `${type}:${id}` };
};

const getModerationStateMap = () => {
  const runtime = readRuntimeStore(runtimeStorePath);
  return runtime && typeof runtime.moderationInputStates === "object" && runtime.moderationInputStates
    ? runtime.moderationInputStates
    : {};
};

const readModerationState = (type, id) => {
  const key = buildModerationInputKey(type, id);
  if (!key) return null;
  const map = getModerationStateMap();
  const entry = map[key];
  if (!entry || typeof entry !== "object") return null;
  return entry;
};

const upsertModerationState = (type, id, patch) => {
  const key = buildModerationInputKey(type, id);
  if (!key) return null;
  const runtime = readRuntimeStore(runtimeStorePath);
  const map =
    runtime && typeof runtime.moderationInputStates === "object" && runtime.moderationInputStates
      ? runtime.moderationInputStates
      : {};
  const current = map[key] && typeof map[key] === "object" ? map[key] : {};
  map[key] = {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  };
  runtime.moderationInputStates = map;
  writeRuntimeStore(runtimeStorePath, runtime);
  return map[key];
};

const isInputSoftDeleted = (type, id) => {
  const state = readModerationState(type, id);
  return Boolean(state?.deletedAt);
};

const isInputFlagged = (type, id) => {
  const state = readModerationState(type, id);
  return Boolean(state?.flagged);
};

const toFlagReason = (value) => {
  const text = String(value ?? "").trim();
  if (text) return text;
  return "Flagged for facilitator review.";
};

const normalizeDedupKey = (value) => {
  const normalized = String(value ?? "")
    .replace(/\s*\[\d+\]\s*$/u, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ");
  return normalized;
};

const countDistinctBy = (items, keyFn) => {
  const unique = new Set();
  for (const item of items) {
    const key = normalizeDedupKey(keyFn(item));
    if (!key) continue;
    unique.add(key);
  }
  return unique.size;
};

const toLocalTimeLabel = (isoString) => {
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const buildCountsFromSignals = (signals) => {
  const featureRequests = (Array.isArray(signals.featureRequests) ? signals.featureRequests : [])
    .filter((item) => !isInputSoftDeleted("feature_request", item.id));
  const screenFeedback = (Array.isArray(signals.screenFeedback) ? signals.screenFeedback : [])
    .filter((item) => !isInputSoftDeleted("screen_feedback", item.id));
  const kudos = (Array.isArray(signals.kudos) ? signals.kudos : [])
    .filter((item) => !isInputSoftDeleted("kudos", item.id));
  const totalVotesCast = featureRequests.reduce((sum, item) => sum + Math.max(0, toInteger(item.votes, 0)), 0);
  const consentApprovedKudos = kudos.filter((item) => Boolean(item.consentPublic)).length;
  const distinctScreensCovered = countDistinctBy(screenFeedback, (item) => item.screenName);
  const uniqueFeatureRequests = countDistinctBy(featureRequests, (item) => item.title);
  const uniqueScreenFeedback = countDistinctBy(
    screenFeedback,
    (item) => item.text ?? `${item.screenName ?? ""}:${item.type ?? ""}:${item.role ?? ""}`,
  );
  const uniqueKudos = countDistinctBy(kudos, (item) => item.text);

  return {
    totalInputs: featureRequests.length + screenFeedback.length + kudos.length,
    featureRequests: featureRequests.length,
    screenFeedback: screenFeedback.length,
    kudos: kudos.length,
    totalVotesCast,
    consentApprovedKudos,
    distinctScreensCovered,
    uniqueFeatureRequests,
    uniqueScreenFeedback,
    uniqueKudos,
    uniqueInputs: uniqueFeatureRequests + uniqueScreenFeedback + uniqueKudos,
    updatedAt: nowIso(),
  };
};

const loadSignalRowsForOverview = async () => {
  if (!useDbDataSource) {
    return buildFlatMergedSignals();
  }

  if (usePostgresDb) {
    const rows = await withPostgresClient(async (client) => {
      const featureRequests = (
        await client.query(`
          SELECT fr.feature_request_id AS id,
            fr.title AS title,
            COALESCE(SUM(frv.vote_value), 0)::int AS votes
          FROM feature_requests fr
          LEFT JOIN feature_request_votes frv ON frv.feature_request_id = fr.feature_request_id
          GROUP BY fr.feature_request_id
        `)
      ).rows;
      const screenFeedback = (
        await client.query(`
          SELECT feedback_id AS id, screen_name AS "screenName", feedback_type AS type, feedback_text AS text, role AS role
          FROM feedback
        `)
      ).rows;
      const kudos = (
        await client.query(`
          SELECT kudos_id AS id, quote_text AS text, role AS role, consent_public AS "consentPublic"
          FROM kudos
        `)
      ).rows;
      return {
        featureRequests,
        screenFeedback,
        kudos,
      };
    });
    const hasPostgresSignals = rows.featureRequests.length > 0 || rows.screenFeedback.length > 0 || rows.kudos.length > 0;
    return hasPostgresSignals ? rows : buildFlatMergedSignals();
  }

  const featureRequests = db.prepare(`
    SELECT fr.FEATURE_REQUEST_ID AS id,
      fr.TITLE AS title,
      COALESCE(SUM(frv.VOTE_VALUE), 0) AS votes
    FROM feature_requests fr
    LEFT JOIN feature_request_votes frv ON frv.FEATURE_REQUEST_ID = fr.FEATURE_REQUEST_ID
    GROUP BY fr.FEATURE_REQUEST_ID
  `).all();
  const screenFeedback = db.prepare(`
    SELECT FEEDBACK_ID AS id, SCREEN_NAME AS screenName, FEEDBACK_TYPE AS type, FEEDBACK_TEXT AS text, ROLE AS role
    FROM feedback
  `).all();
  const kudos = db.prepare(`
    SELECT KUDOS_ID AS id, QUOTE_TEXT AS text, ROLE AS role, CONSENT_PUBLIC AS consentPublic
    FROM kudos
  `).all().map((row) => ({
    ...row,
    consentPublic: Boolean(row.consentPublic),
  }));

  return {
    featureRequests,
    screenFeedback,
    kudos,
  };
};

const sortBySubmittedAtAsc = (items) => {
  return items
    .slice()
    .sort((a, b) => {
      const aTs = new Date(String(a.submittedAt ?? "")).getTime();
      const bTs = new Date(String(b.submittedAt ?? "")).getTime();
      return aTs - bTs;
    });
};

const loadAllInputsForModeration = async () => {
  const toFlatModerationInputs = () => {
    const merged = buildFlatMergedSignals();
    const featureRequests = (Array.isArray(merged.featureRequests) ? merged.featureRequests : []).map((item) => ({
      id: item.id,
      type: "feature_request",
      text: String(item.title ?? item.description ?? ""),
      submittedAt: String(item.createdAt ?? nowIso()),
    }));
    const screenFeedback = (Array.isArray(merged.screenFeedback) ? merged.screenFeedback : []).map((item) => ({
      id: item.id,
      type: "screen_feedback",
      text: String(item.text ?? ""),
      submittedAt: String(item.createdAt ?? nowIso()),
    }));
    const kudos = (Array.isArray(merged.kudos) ? merged.kudos : []).map((item) => ({
      id: item.id,
      type: "kudos",
      text: String(item.text ?? ""),
      submittedAt: String(item.createdAt ?? nowIso()),
    }));
    return [...featureRequests, ...screenFeedback, ...kudos];
  };

  if (!useDbDataSource) {
    return toFlatModerationInputs();
  }

  if (usePostgresDb) {
    const rows = await withPostgresClient(async (client) => {
      const featureRequests = (
        await client.query(`
          SELECT feature_request_id AS id, title AS text, created_at AS "submittedAt"
          FROM feature_requests
        `)
      ).rows.map((row) => ({
        id: row.id,
        type: "feature_request",
        text: String(row.text ?? ""),
        submittedAt: String(row.submittedAt ?? nowIso()),
      }));
      const screenFeedback = (
        await client.query(`
          SELECT feedback_id AS id, feedback_text AS text, created_at AS "submittedAt"
          FROM feedback
        `)
      ).rows.map((row) => ({
        id: row.id,
        type: "screen_feedback",
        text: String(row.text ?? ""),
        submittedAt: String(row.submittedAt ?? nowIso()),
      }));
      const kudos = (
        await client.query(`
          SELECT kudos_id AS id, quote_text AS text, created_at AS "submittedAt"
          FROM kudos
        `)
      ).rows.map((row) => ({
        id: row.id,
        type: "kudos",
        text: String(row.text ?? ""),
        submittedAt: String(row.submittedAt ?? nowIso()),
      }));
      return [...featureRequests, ...screenFeedback, ...kudos];
    });
    return rows.length > 0 ? rows : toFlatModerationInputs();
  }

  const featureRequests = db.prepare(`
    SELECT FEATURE_REQUEST_ID AS id, TITLE AS text, CREATED_AT AS submittedAt
    FROM feature_requests
  `).all().map((row) => ({
    id: row.id,
    type: "feature_request",
    text: String(row.text ?? ""),
    submittedAt: String(row.submittedAt ?? nowIso()),
  }));
  const screenFeedback = db.prepare(`
    SELECT FEEDBACK_ID AS id, FEEDBACK_TEXT AS text, CREATED_AT AS submittedAt
    FROM feedback
  `).all().map((row) => ({
    id: row.id,
    type: "screen_feedback",
    text: String(row.text ?? ""),
    submittedAt: String(row.submittedAt ?? nowIso()),
  }));
  const kudos = db.prepare(`
    SELECT KUDOS_ID AS id, QUOTE_TEXT AS text, CREATED_AT AS submittedAt
    FROM kudos
  `).all().map((row) => ({
    id: row.id,
    type: "kudos",
    text: String(row.text ?? ""),
    submittedAt: String(row.submittedAt ?? nowIso()),
  }));
  return [...featureRequests, ...screenFeedback, ...kudos];
};

const getFlaggedInputs = async () => {
  const allInputs = await loadAllInputsForModeration();
  const map = getModerationStateMap();
  const flagged = [];
  for (const item of allInputs) {
    const key = buildModerationInputKey(item.type, item.id);
    if (!key) continue;
    const state = map[key];
    if (!state || !state.flagged || state.deletedAt) continue;
    flagged.push({
      id: key,
      type: item.type,
      text: item.text,
      flagReason: toFlagReason(state.flagReason),
      submittedAt: item.submittedAt,
    });
  }
  return sortBySubmittedAtAsc(flagged);
};

const buildSessionConfigPayload = () => {
  const cutoffDate = new Date(synthesisSessionState.inputCutoffAt);
  const cutoffAt = Number.isFinite(cutoffDate.getTime()) ? cutoffDate.toISOString() : nowIso();
  const remainingSeconds = Math.max(0, Math.ceil((new Date(cutoffAt).getTime() - Date.now()) / 1_000));
  const inputWindowOpen = synthesisSessionState.wallWindowOpen && remainingSeconds > 0;
  const mobileWindowCloseTimeLocal = normalizeLocalTime(
    synthesisSessionState.mobileWindowCloseTime,
    toLocalHm(cutoffAt),
  );
  return {
    inputCutoffAt: cutoffAt,
    inputWindowOpen,
    countdownSecondsRemaining: remainingSeconds,
    wallWindowOpen: synthesisSessionState.wallWindowOpen,
    mobileWindowOpen: synthesisSessionState.mobileWindowOpen,
    themesViewActive: synthesisSessionState.themesViewActive,
    synthesisMinSignals: Math.max(10, Math.min(500, toInteger(synthesisSessionState.synthesisMinSignals, DEFAULT_SYNTHESIS_MIN_SIGNALS))),
    mobileWindowCloseTime: localTimeToIso(mobileWindowCloseTimeLocal, cutoffAt),
    mobileWindowCloseTimeLocal,
    eventName: String(synthesisSessionState.eventName ?? "").trim(),
    eventSlug: String(synthesisSessionState.eventSlug ?? "").trim() || slugifyEventName(synthesisSessionState.eventName || ""),
    ceremonyStartTimeLocal: normalizeLocalTime(synthesisSessionState.ceremonyStartTimeLocal, ""),
    day2RevealTimeLocal: normalizeLocalTime(synthesisSessionState.day2RevealTimeLocal, ""),
    updatedAt: nowIso(),
  };
};

const buildSynthesisParametersPayload = () => {
  const usingDefaults = synthesisParametersUpdatedAt == null;
  return {
    parameters: {
      excludeBelowN: synthesisParametersState.excludeBelowN,
      upweightSection: synthesisParametersState.upweightSection,
      upweightMultiplier: synthesisParametersState.upweightMultiplier,
      p0FocusOnly: synthesisParametersState.p0FocusOnly,
      emphasiseQuotes: synthesisParametersState.emphasiseQuotes,
      maxQuotes: synthesisParametersState.maxQuotes,
      competingMinEach: synthesisParametersState.competingMinEach,
      competingMinSplitRatio: synthesisParametersState.competingMinSplitRatio,
    },
    updatedAt: synthesisParametersUpdatedAt,
    usingDefaults,
  };
};

const buildLatestSynthesisPhase1Payload = () => {
  const runtime = readRuntimeStore(runtimeStorePath);
  return {
    phase1Analysis: runtime.latestPhase1Analysis ?? null,
  };
};

const buildLatestTShirtSizingPayload = () => {
  const runtime = readRuntimeStore(runtimeStorePath);
  return {
    sizing: runtime.latestTShirtSizing ?? null,
  };
};

const buildLatestSynthesisOutputPayload = () => {
  const runtime = readRuntimeStore(runtimeStorePath);
  return {
    output: runtime.latestSynthesisOutput ?? null,
  };
};

const buildLatestSynthesisMetadataPayload = () => {
  const runtime = readRuntimeStore(runtimeStorePath);
  return {
    metadata: runtime.latestSynthesisMetadata ?? null,
  };
};

const buildSavedNarrativePayload = () => {
  const runtime = readRuntimeStore(runtimeStorePath);
  return {
    savedNarrative: runtime.savedNarrative ?? null,
  };
};

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const patchLatestSynthesisPhase1 = (body) => {
  const hasField = Object.prototype.hasOwnProperty.call(body ?? {}, "phase1Analysis");
  const phase1Analysis = hasField ? body.phase1Analysis : null;
  if (phase1Analysis != null && !isPlainObject(phase1Analysis)) {
    throw createHttpError(400, "phase1Analysis must be an object or null.");
  }

  const runtime = readRuntimeStore(runtimeStorePath);
  runtime.latestPhase1Analysis = phase1Analysis ?? null;
  writeRuntimeStore(runtimeStorePath, runtime);
  return {
    phase1Analysis: runtime.latestPhase1Analysis,
  };
};

const patchLatestTShirtSizing = (body) => {
  const hasField = Object.prototype.hasOwnProperty.call(body ?? {}, "sizing");
  const sizing = hasField ? body.sizing : null;
  if (sizing != null && !isPlainObject(sizing)) {
    throw createHttpError(400, "sizing must be an object or null.");
  }

  const runtime = readRuntimeStore(runtimeStorePath);
  runtime.latestTShirtSizing = sizing ?? null;
  writeRuntimeStore(runtimeStorePath, runtime);
  return {
    sizing: runtime.latestTShirtSizing,
  };
};

const patchLatestSynthesisOutput = (body) => {
  const hasField = Object.prototype.hasOwnProperty.call(body ?? {}, "output");
  const output = hasField ? body.output : null;
  if (output != null && typeof output !== "string") {
    throw createHttpError(400, "output must be a string or null.");
  }

  const runtime = readRuntimeStore(runtimeStorePath);
  runtime.latestSynthesisOutput = output ?? null;
  writeRuntimeStore(runtimeStorePath, runtime);
  return {
    output: runtime.latestSynthesisOutput,
  };
};

const patchLatestSynthesisMetadata = (body) => {
  const hasField = Object.prototype.hasOwnProperty.call(body ?? {}, "metadata");
  const metadata = hasField ? body.metadata : null;
  if (metadata != null && !isPlainObject(metadata)) {
    throw createHttpError(400, "metadata must be an object or null.");
  }

  const runtime = readRuntimeStore(runtimeStorePath);
  runtime.latestSynthesisMetadata = metadata ?? null;
  writeRuntimeStore(runtimeStorePath, runtime);
  return {
    metadata: runtime.latestSynthesisMetadata,
  };
};

const patchSavedNarrative = (body) => {
  const hasField = Object.prototype.hasOwnProperty.call(body ?? {}, "savedNarrative");
  const savedNarrative = hasField ? body.savedNarrative : null;
  if (savedNarrative != null && !isPlainObject(savedNarrative)) {
    throw createHttpError(400, "savedNarrative must be an object or null.");
  }

  const runtime = readRuntimeStore(runtimeStorePath);
  runtime.savedNarrative = savedNarrative ?? null;
  writeRuntimeStore(runtimeStorePath, runtime);
  return {
    savedNarrative: runtime.savedNarrative,
  };
};

const parseInputCountType = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "feature_request") return "feature_request";
  if (normalized === "screen_feedback") return "screen_feedback";
  if (normalized === "kudos") return "kudos";
  return null;
};

const validateAICallPayload = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHttpError(400, "JSON object required.");
  }
  const systemPrompt = toRequiredString(body.systemPrompt, { field: "systemPrompt", maxLength: 100_000 });
  const userPrompt = toRequiredString(body.userPrompt, { field: "userPrompt", maxLength: 100_000 });
  const model = toRequiredString(body.model, { field: "model", maxLength: 200 });
  const maxTokens = toOptionalInt(body.maxTokens, { field: "maxTokens", min: 1, max: 131_072 });
  if (maxTokens == null) {
    throw createHttpError(400, "maxTokens is required.");
  }
  const temperatureRaw = Number(body.temperature);
  if (!Number.isFinite(temperatureRaw) || temperatureRaw < 0 || temperatureRaw > 2) {
    throw createHttpError(400, "temperature must be between 0 and 2.");
  }
  return {
    systemPrompt,
    userPrompt,
    model,
    maxTokens: Number(maxTokens),
    temperature: temperatureRaw,
  };
};

const getInputCounts = async (type = null) => {
  const signals = await loadSignalRowsForOverview();
  const counts = buildCountsFromSignals(signals);
  if (type === "feature_request") {
    return { type, count: counts.featureRequests, updatedAt: counts.updatedAt };
  }
  if (type === "screen_feedback") {
    return { type, count: counts.screenFeedback, updatedAt: counts.updatedAt };
  }
  if (type === "kudos") {
    return { type, count: counts.kudos, updatedAt: counts.updatedAt };
  }
  return counts;
};

const getDedupCounts = async () => {
  const signals = await loadSignalRowsForOverview();
  const counts = buildCountsFromSignals(signals);
  return {
    uniqueInputs: counts.uniqueInputs,
    uniqueFeatureRequests: counts.uniqueFeatureRequests,
    distinctScreensCovered: counts.distinctScreensCovered,
    consentApprovedKudos: counts.consentApprovedKudos,
    totalVotesCast: counts.totalVotesCast,
    updatedAt: counts.updatedAt,
  };
};

const buildAdminBootstrapPayload = async () => {
  const [sessionConfig, synthesisParameters, inputsCount, dedupCounts, flaggedItems] = await Promise.all([
    Promise.resolve(buildSessionConfigPayload()),
    Promise.resolve(buildSynthesisParametersPayload()),
    getInputCounts(),
    getDedupCounts(),
    getFlaggedInputs(),
  ]);
  const runtime = readRuntimeStore(runtimeStorePath);

  return {
    sessionConfig,
    synthesisParameters,
    inputsCount,
    dedupCounts,
    latestPhase1Analysis: runtime.latestPhase1Analysis ?? null,
    latestTShirtSizing: runtime.latestTShirtSizing ?? null,
    savedNarrative: runtime.savedNarrative ?? null,
    moderation: {
      pendingCount: flaggedItems.length,
    },
    loadedAt: nowIso(),
  };
};

const patchSessionConfig = (body) => {
  const nextState = { ...synthesisSessionState };
  if (typeof body?.wallWindowOpen === "boolean") {
    nextState.wallWindowOpen = Boolean(body.wallWindowOpen);
  }
  if (typeof body?.mobileWindowOpen === "boolean") {
    nextState.mobileWindowOpen = Boolean(body.mobileWindowOpen);
  }
  if (typeof body?.themesViewActive === "boolean") {
    nextState.themesViewActive = Boolean(body.themesViewActive);
  }
  if (typeof body?.synthesisMinSignals === "number") {
    nextState.synthesisMinSignals = Math.max(10, Math.min(500, toInteger(body.synthesisMinSignals, synthesisSessionState.synthesisMinSignals)));
  }
  if (typeof body?.inputCutoffAt === "string" && body.inputCutoffAt) {
    const parsedCutoff = new Date(body.inputCutoffAt);
    nextState.inputCutoffAt = Number.isFinite(parsedCutoff.getTime())
      ? parsedCutoff.toISOString()
      : nextState.inputCutoffAt;
  }
  if (typeof body?.mobileWindowCloseTime === "string" && body.mobileWindowCloseTime) {
    nextState.mobileWindowCloseTime = normalizeLocalTime(body.mobileWindowCloseTime, nextState.mobileWindowCloseTime);
  }
  if (typeof body?.eventName === "string") {
    nextState.eventName = body.eventName.trim().slice(0, 80);
  }
  if (typeof body?.eventSlug === "string") {
    nextState.eventSlug = body.eventSlug.trim().toLowerCase().replace(/[^a-z0-9-]/gu, "").slice(0, 40);
  }
  if (typeof body?.ceremonyStartTimeLocal === "string" && body.ceremonyStartTimeLocal) {
    nextState.ceremonyStartTimeLocal = normalizeLocalTime(body.ceremonyStartTimeLocal, nextState.ceremonyStartTimeLocal);
  }
  if (typeof body?.day2RevealTimeLocal === "string" && body.day2RevealTimeLocal) {
    nextState.day2RevealTimeLocal = normalizeLocalTime(body.day2RevealTimeLocal, nextState.day2RevealTimeLocal);
  }
  synthesisSessionState.inputCutoffAt = nextState.inputCutoffAt;
  synthesisSessionState.wallWindowOpen = nextState.wallWindowOpen;
  synthesisSessionState.mobileWindowOpen = nextState.mobileWindowOpen;
  synthesisSessionState.themesViewActive = nextState.themesViewActive;
  synthesisSessionState.synthesisMinSignals = nextState.synthesisMinSignals;
  synthesisSessionState.mobileWindowCloseTime = nextState.mobileWindowCloseTime;
  synthesisSessionState.eventName = nextState.eventName;
  synthesisSessionState.eventSlug = nextState.eventSlug;
  synthesisSessionState.ceremonyStartTimeLocal = nextState.ceremonyStartTimeLocal;
  synthesisSessionState.day2RevealTimeLocal = nextState.day2RevealTimeLocal;
  const runtime = readRuntimeStore(runtimeStorePath);
  runtime.sessionConfig = {
    ...(runtime.sessionConfig && typeof runtime.sessionConfig === "object" ? runtime.sessionConfig : {}),
    inputCutoffAt: synthesisSessionState.inputCutoffAt,
    wallWindowOpen: synthesisSessionState.wallWindowOpen,
    mobileWindowOpen: synthesisSessionState.mobileWindowOpen,
    themesViewActive: synthesisSessionState.themesViewActive,
    synthesisMinSignals: synthesisSessionState.synthesisMinSignals,
    mobileWindowCloseTime: synthesisSessionState.mobileWindowCloseTime,
    eventName: synthesisSessionState.eventName,
    eventSlug: synthesisSessionState.eventSlug,
    ceremonyStartTimeLocal: synthesisSessionState.ceremonyStartTimeLocal,
    day2RevealTimeLocal: synthesisSessionState.day2RevealTimeLocal,
  };
  writeRuntimeStore(runtimeStorePath, runtime);
  return buildSessionConfigPayload();
};

const patchSynthesisParameters = (body) => {
  if ("excludeBelowN" in body) synthesisParametersState.excludeBelowN = body.excludeBelowN;
  if ("upweightSection" in body) synthesisParametersState.upweightSection = body.upweightSection;
  if ("upweightMultiplier" in body) synthesisParametersState.upweightMultiplier = body.upweightMultiplier;
  if ("p0FocusOnly" in body) synthesisParametersState.p0FocusOnly = body.p0FocusOnly;
  if ("emphasiseQuotes" in body) synthesisParametersState.emphasiseQuotes = body.emphasiseQuotes;
  if ("maxQuotes" in body) synthesisParametersState.maxQuotes = body.maxQuotes;
  if ("competingMinEach" in body) synthesisParametersState.competingMinEach = body.competingMinEach;
  if ("competingMinSplitRatio" in body) synthesisParametersState.competingMinSplitRatio = body.competingMinSplitRatio;

  synthesisParametersUpdatedAt = nowIso();
  const runtime = readRuntimeStore(runtimeStorePath);
  runtime.synthesisParameters = {
    ...synthesisParametersState,
  };
  runtime.synthesisParametersUpdatedAt = synthesisParametersUpdatedAt;
  writeRuntimeStore(runtimeStorePath, runtime);

  return buildSynthesisParametersPayload();
};

export const handleApiRequest = async (request, response) => {
  try {
    const { method = "GET", url = "/" } = request;
    const parsed = new URL(url, `http://localhost:${port}`);
    const pathname = parsed.pathname;

    if (method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (isProtectedAdminRoute(pathname) && !hasValidSynthesisAuthToken(request)) {
      sendJson(response, 401, {
        ok: false,
        error: "Unauthorized. Authenticate with the synthesis PIN first.",
      });
      return;
    }

    if (method === "GET" && (pathname === "/health" || pathname === "/api/health")) {
      const warnings = [];
      if (!synthesisPin) {
        warnings.push("SYNTHESIS_PIN is not configured; facilitator unlock is disabled.");
      }
      if (!synthesisAuthSecret) {
        warnings.push("SYNTHESIS_AUTH_SECRET is not configured; auth token signing falls back to SYNTHESIS_PIN.");
      }
      if (requestedDataSourceMode === "db" && dbEngine === "postgres" && !postgresConfigured) {
        warnings.push("Postgres requested but not configured; API is running in flat mode.");
      }
      if (isVercelRuntime && !usePostgresDb) {
        warnings.push("Using non-Postgres persistence on Vercel is ephemeral across instances.");
      }
      sendJson(response, 200, {
        ok: true,
        dbPath,
        dbEngine,
        dataSourceMode,
        requestedDataSourceMode,
        postgresConfigured,
        synthesisPinConfigured: synthesisPin.length > 0,
        synthesisAuthMode: synthesisAuthSecretKey ? "stateless-signed-token" : "disabled",
        runtimePersistence:
          isVercelRuntime && !usePostgresDb
            ? "ephemeral"
            : "durable",
        synthesisProvider: synthesisConfig.provider ?? null,
        synthesisPhase1TimeoutMs: Number(synthesisConfig.PHASE1_TIMEOUT_MS ?? 0),
        warnings,
      });
      return;
    }

    if (method === "GET" && pathname === "/api/bootstrap") {
      sendJson(response, 200, await bootstrapPayload());
      return;
    }

    if (method === "GET" && pathname === "/api/bootstrap-admin") {
      sendJson(response, 200, await buildAdminBootstrapPayload());
      return;
    }

    if (method === "POST" && pathname === "/api/universe/search") {
      checkRateLimit({ request, bucket: "universe-search", max: SYNTHESIS_RATE_LIMIT_MAX });
      const body = await readBody(request);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const completion = await runServerTextCompletion({
        messages,
        maxOutputTokens: body.maxOutputTokens,
        temperature: body.temperature,
      });
      sendJson(response, 200, {
        ok: true,
        provider: completion.provider,
        model: completion.model,
        text: completion.text,
      });
      return;
    }

    if (method === "POST" && pathname === "/api/ai/complete") {
      const rawBody = await readBody(request, { maxBytes: MAX_BODY_BYTES * 4 });
      const {
        systemPrompt,
        userPrompt,
        model,
        maxTokens,
        temperature,
      } = rawBody ?? {};
      // eslint-disable-next-line no-console
      console.log("[api/ai/complete] Request received:", JSON.stringify({
        model,
        maxTokens,
        temperature,
        systemPromptLength: typeof systemPrompt === "string" ? systemPrompt.length : null,
        userPromptLength: typeof userPrompt === "string" ? userPrompt.length : null,
      }));
      if (!systemPrompt || !userPrompt || !model || !maxTokens || temperature === undefined) {
        sendJson(response, 400, {
          error: "Missing required fields",
          received: Object.keys(rawBody ?? {}),
        });
        return;
      }
      
      console.log('[api/ai/complete] Calling Anthropic with key length:', 
        (process.env.ANTHROPIC_API_KEY ?? '').length);

      const body = validateAICallPayload(rawBody);
      const requestAbort = createRequestAbortController(request, response);
      let routeTimeout = null;
      const startedAt = Date.now();
      const waitingLog = setInterval(() => {
        console.log(`[api/ai/complete] still waiting on provider... ${Date.now() - startedAt}ms`);
      }, 5_000);
      try {
        
        console.log("[api/ai/complete] About to call runServerAICall with model:", body.model, "maxTokens:", body.maxTokens);
        const result = await Promise.race([
          runServerAICall({
            systemPrompt: body.systemPrompt,
            userPrompt: body.userPrompt,
            model: body.model,
            maxTokens: body.maxTokens,
            temperature: body.temperature,
            stream: false,
            signal: requestAbort.controller.signal,
          }),
          new Promise((_, reject) => {
            routeTimeout = setTimeout(() => {
              console.error(`[api/ai/complete] route timeout fired at ${aiCompleteRouteTimeoutMs}ms`);
              requestAbort.controller.abort();
              reject(createHttpError(504, "AI completion timed out at proxy route."));
            }, aiCompleteRouteTimeoutMs);
          }),
        ]);

        console.log("[api/ai/complete] runServerAICall returned, content length:", result.content.length);

        sendJson(response, 200, {
          content: result.content,
          provider: result.provider,
          model: body.model,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI completion failed.";
        const status = error instanceof HttpError ? error.statusCode : 500;
        sendJson(response, status, { error: message });
      } finally {
        clearInterval(waitingLog);
        if (routeTimeout) clearTimeout(routeTimeout);
        requestAbort.cleanup();
      }
      return;
    }

    if (method === "POST" && pathname === "/api/ai/stream") {
      const body = validateAICallPayload(await readBody(request, { maxBytes: MAX_BODY_BYTES * 4 }));
      const requestAbort = createRequestAbortController(request, response);
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...buildCorsHeaders(request, "POST,OPTIONS"),
      });
      response.write(": connected\n\n");
      try {
        
        console.log("[api/ai/complete] About to call runServerAICall with model:", body.model, "maxTokens:", body.maxTokens);

        await runServerAICall({
          systemPrompt: body.systemPrompt,
          userPrompt: body.userPrompt,
          model: body.model,
          maxTokens: body.maxTokens,
          temperature: body.temperature,
          stream: true,
          signal: requestAbort.controller.signal,
          onToken: (token) => {
            response.write(`data: ${JSON.stringify({ token })}\n\n`);
          },
        });
        console.log("[api/ai/stream] runServerAICall completed");

        response.write("data: [DONE]\n\n");
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI stream failed.";
        response.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      } finally {
        requestAbort.cleanup();
        response.end();
      }
      return;
    }

    if (method === "GET" && pathname === "/api/inputs/count") {
      const requestedType = parseInputCountType(parsed.searchParams.get("type"));
      sendJson(response, 200, await getInputCounts(requestedType));
      return;
    }

    if (method === "GET" && pathname === "/api/inputs/dedup-count") {
      sendJson(response, 200, await getDedupCounts());
      return;
    }

    if (method === "GET" && pathname === "/api/inputs/flagged") {
      const items = await getFlaggedInputs();
      sendJson(response, 200, items);
      return;
    }

    if (method === "GET" && pathname === "/api/session/config") {
      sendJson(response, 200, buildSessionConfigPayload());
      return;
    }

    if (method === "GET" && pathname === "/api/synthesis/parameters") {
      sendJson(response, 200, buildSynthesisParametersPayload());
      return;
    }

    if (method === "GET" && pathname === "/api/synthesis/phase1") {
      sendJson(response, 200, buildLatestSynthesisPhase1Payload());
      return;
    }

    if (method === "GET" && pathname === "/api/synthesis/sizing") {
      sendJson(response, 200, buildLatestTShirtSizingPayload());
      return;
    }

    if (method === "GET" && pathname === "/api/synthesis/output") {
      sendJson(response, 200, buildLatestSynthesisOutputPayload());
      return;
    }

    if (method === "GET" && pathname === "/api/synthesis/metadata") {
      sendJson(response, 200, buildLatestSynthesisMetadataPayload());
      return;
    }

    if (method === "GET" && pathname === "/api/synthesis/narrative") {
      sendJson(response, 200, buildSavedNarrativePayload());
      return;
    }

    if (method === "PATCH" && pathname === "/api/session/config") {
      checkRateLimit({ request, bucket: "session-config-patch", max: WRITE_RATE_LIMIT_MAX });
      const body = await readBody(request);
      const validated = validateSessionConfigPatchPayload(body);
      sendJson(response, 200, patchSessionConfig(validated));
      return;
    }

    if (method === "PATCH" && pathname === "/api/synthesis/parameters") {
      checkRateLimit({ request, bucket: "synthesis-parameters-patch", max: WRITE_RATE_LIMIT_MAX });
      const body = await readBody(request);
      const validated = validateSynthesisParametersPatchPayload(body);
      sendJson(response, 200, patchSynthesisParameters(validated));
      return;
    }

    if (method === "POST" && pathname === "/api/synthesis/phase1") {
      const body = await readBody(request);
      if (!isPlainObject(body)) {
        throw createHttpError(400, "JSON object required.");
      }
      sendJson(response, 200, patchLatestSynthesisPhase1(body));
      return;
    }

    if (method === "POST" && pathname === "/api/synthesis/sizing") {
      const body = await readBody(request);
      if (!isPlainObject(body)) {
        throw createHttpError(400, "JSON object required.");
      }
      sendJson(response, 200, patchLatestTShirtSizing(body));
      return;
    }

    if (method === "POST" && pathname === "/api/synthesis/output") {
      const body = await readBody(request);
      if (!isPlainObject(body)) {
        throw createHttpError(400, "JSON object required.");
      }
      sendJson(response, 200, patchLatestSynthesisOutput(body));
      return;
    }

    if (method === "POST" && pathname === "/api/synthesis/metadata") {
      const body = await readBody(request);
      if (!isPlainObject(body)) {
        throw createHttpError(400, "JSON object required.");
      }
      sendJson(response, 200, patchLatestSynthesisMetadata(body));
      return;
    }

    if (method === "POST" && pathname === "/api/synthesis/narrative") {
      const body = await readBody(request);
      if (!isPlainObject(body)) {
        throw createHttpError(400, "JSON object required.");
      }
      sendJson(response, 200, patchSavedNarrative(body));
      return;
    }

    if ((method === "PATCH" || method === "DELETE") && pathname.startsWith("/api/inputs/")) {
      checkRateLimit({ request, bucket: "moderation-write", max: WRITE_RATE_LIMIT_MAX });
      const parts = pathname.split("/");
      const idParam = decodeURIComponent(String(parts[3] ?? ""));
      if (!idParam || idParam === "flagged") {
        sendJson(response, 400, { error: "Invalid moderation input id." });
        return;
      }
      const parsedRecordId = parseModerationRecordId(idParam);
      if (!parsedRecordId) {
        sendJson(response, 400, { error: "Moderation id must be type:id." });
        return;
      }

      const allInputs = await loadAllInputsForModeration();
      const exists = allInputs.some(
        (item) =>
          sanitizeModerationInputType(item.type) === parsedRecordId.type &&
          String(item.id) === parsedRecordId.id,
      );
      if (!exists) {
        sendJson(response, 404, { error: "Input not found." });
        return;
      }

      if (method === "PATCH") {
        const body = await readBody(request);
        const nextFlagged = typeof body.flagged === "boolean" ? body.flagged : Boolean(body.flagged);
        const nextReason = toOptionalString(body.flagReason, 240);
        upsertModerationState(parsedRecordId.type, parsedRecordId.id, {
          flagged: nextFlagged,
          deletedAt: nextFlagged ? null : readModerationState(parsedRecordId.type, parsedRecordId.id)?.deletedAt ?? null,
          flagReason: nextReason ?? readModerationState(parsedRecordId.type, parsedRecordId.id)?.flagReason ?? "Flagged for facilitator review.",
        });
      }

      if (method === "DELETE") {
        upsertModerationState(parsedRecordId.type, parsedRecordId.id, {
          flagged: false,
          deletedAt: nowIso(),
          flagReason: readModerationState(parsedRecordId.type, parsedRecordId.id)?.flagReason ?? "Removed during moderation review.",
        });
      }

      const pendingItems = await getFlaggedInputs();
      sendJson(response, 200, {
        ok: true,
        id: parsedRecordId.key,
        pendingCount: pendingItems.length,
        moderationState: readModerationState(parsedRecordId.type, parsedRecordId.id),
      });
      return;
    }

    if (method === "POST" && pathname === "/api/synthesis/auth") {
      checkRateLimit({ request, bucket: "synthesis-auth", max: AUTH_RATE_LIMIT_MAX });
      const body = await readBody(request);
      const submittedPin = toTrimmedString(body.pin);
      if (!/^\d{4,6}$/u.test(submittedPin)) {
        throw createHttpError(400, "PIN must be 4 to 6 digits.");
      }

      if (!synthesisPin) {
        sendJson(response, 503, {
          ok: false,
          authenticated: false,
          error: "Synthesis PIN is not configured on the server.",
        });
        return;
      }

      if (!submittedPin || !timingSafePinMatch(submittedPin, synthesisPin)) {
        sendJson(response, 401, {
          ok: false,
          authenticated: false,
          error: "Invalid PIN.",
        });
        return;
      }

      const session = issueSynthesisAuthToken();
      sendJson(response, 200, {
        ok: true,
        authenticated: true,
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
      return;
    }

    if (method === "GET" && pathname === "/api/synthesis/providers/health") {
      const payload = await getAIProviderHealth();
      sendJson(response, 200, {
        reachable: Boolean(payload.reachable),
        provider: payload.provider,
        reason: payload.reason,
      });
      return;
    }

    if (method === "GET" && pathname === "/api/admin/tables") {
      sendJson(response, 200, { tables: await buildAdminTables() });
      return;
    }

    if (method === "POST" && pathname === "/api/admin/reseed") {
      checkRateLimit({ request, bucket: "admin-reseed", max: 5 });
      const payload = await readBody(request);
      if (useDbDataSource) {
        if (usePostgresDb) {
          await reseedPostgres();
        } else {
          reseed(payload);
        }
      } else {
        resetRuntimeStore(runtimeStorePath);
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (method === "POST" && pathname === "/api/feature-requests") {
      checkRateLimit({ request, bucket: "feature-request-create", max: WRITE_RATE_LIMIT_MAX });
      const body = validateFeatureRequestPayload(await readBody(request));
      let id;
      if (useDbDataSource) {
        if (usePostgresDb) {
          id = await withPostgresClient(async (client) => {
            const insertResult = await client.query(
              `
              INSERT INTO feature_requests (product_id, converted_feature_id, title, description, workflow_context, status, created_at, legacy_request_code, app_area, screen_id, screen_name, origin)
              VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12)
              RETURNING feature_request_id
              `,
              [
                body.productId,
                null,
                body.title,
                body.description,
                body.workflowContext,
                body.status,
                body.createdAt,
                body.legacyRequestCode,
                null,
                null,
                null,
                body.origin,
              ],
            );
            const requestId = Number(insertResult.rows[0]?.feature_request_id);
            await client.query(
              "INSERT INTO feature_request_votes (feature_request_id, session_id, vote_value, created_at) VALUES ($1, $2, 1, $3::timestamptz)",
              [requestId, body.sessionId, body.createdAt],
            );
            return requestId;
          });
        } else {
          const result = db.prepare(`
          INSERT INTO feature_requests (PRODUCT_ID, CONVERTED_FEATURE_ID, TITLE, DESCRIPTION, WORKFLOW_CONTEXT, STATUS, CREATED_AT, LEGACY_REQUEST_CODE, APP_AREA, SCREEN_ID, SCREEN_NAME, ORIGIN)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          body.productId,
          null,
          body.title,
          body.description,
          body.workflowContext,
          body.status,
          body.createdAt,
          body.legacyRequestCode,
          null,
          null,
          null,
          body.origin,
        );
        id = Number(result.lastInsertRowid);
        db.prepare("INSERT INTO feature_request_votes (FEATURE_REQUEST_ID, SESSION_ID, VOTE_VALUE, CREATED_AT) VALUES (?, ?, 1, ?)").run(
          id,
          body.sessionId,
          body.createdAt,
        );
        }
      } else {
        id = appendFlatRuntimeFeatureRequest(body);
      }
      sendJson(response, 200, { ok: true, id });
      return;
    }

    if (method === "POST" && pathname.startsWith("/api/feature-requests/") && pathname.endsWith("/upvote")) {
      checkRateLimit({ request, bucket: "feature-request-upvote", max: WRITE_RATE_LIMIT_MAX });
      const parts = pathname.split("/");
      const idParam = String(parts[3] ?? "");
      const body = validateFeatureUpvotePayload(await readBody(request));
      let votes = 0;
      if (useDbDataSource) {
        const id = Number(idParam);
        if (!Number.isFinite(id)) {
          sendJson(response, 400, { error: "Invalid feature request id" });
          return;
        }
        if (usePostgresDb) {
          votes = await withPostgresClient(async (client) => {
            const existsResult = await client.query(
              "SELECT 1 FROM feature_requests WHERE feature_request_id = $1 LIMIT 1",
              [id],
            );
            if (existsResult.rowCount === 0) {
              sendJson(response, 404, { error: `Feature request ${id} was not found` });
              return 0;
            }
            await client.query(
              "INSERT INTO feature_request_votes (feature_request_id, session_id, vote_value, created_at) VALUES ($1, $2, 1, $3::timestamptz)",
              [id, body.sessionId, nowIso()],
            );
            const votesResult = await client.query(
              "SELECT COALESCE(SUM(vote_value), 0)::int AS votes FROM feature_request_votes WHERE feature_request_id = $1",
              [id],
            );
            return Number(votesResult.rows[0]?.votes ?? 0);
          });
          if (response.writableEnded) return;
        } else {
          const requestExists = db.prepare("SELECT 1 FROM feature_requests WHERE FEATURE_REQUEST_ID = ? LIMIT 1").get(id);
          if (!requestExists) {
            sendJson(response, 404, { error: `Feature request ${id} was not found` });
            return;
          }
          db.prepare("INSERT INTO feature_request_votes (FEATURE_REQUEST_ID, SESSION_ID, VOTE_VALUE, CREATED_AT) VALUES (?, ?, 1, ?)").run(
            id,
            body.sessionId,
            nowIso(),
          );
          const votesRow = db.prepare(
            "SELECT COALESCE(SUM(VOTE_VALUE), 0) AS votes FROM feature_request_votes WHERE FEATURE_REQUEST_ID = ?",
          ).get(id);
          votes = Number(votesRow?.votes ?? 0);
        }
      } else {
        incrementFlatRuntimeVote(idParam);
        votes = getFlatFeatureRequestVoteCount(idParam);
      }
      sendJson(response, 200, { ok: true, votes });
      return;
    }

    if (method === "POST" && pathname === "/api/kudos") {
      checkRateLimit({ request, bucket: "kudos-create", max: WRITE_RATE_LIMIT_MAX });
      const body = validateKudosPayload(await readBody(request));
      if (useDbDataSource) {
        if (usePostgresDb) {
          const result = await withPostgresClient((client) =>
            client.query(
              `
              INSERT INTO kudos (product_id, feature_id, screen_id, quote_text, role, consent_public, created_at, app_area, screen_name)
              VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)
              RETURNING kudos_id
              `,
              [
                body.productId,
                null,
                null,
                body.text,
                body.role,
                body.consentPublic,
                body.createdAt,
                null,
                null,
              ],
            ),
          );
          sendJson(response, 200, { ok: true, id: Number(result.rows[0]?.kudos_id) });
        } else {
          const result = db.prepare(`
          INSERT INTO kudos (PRODUCT_ID, FEATURE_ID, SCREEN_ID, QUOTE_TEXT, ROLE, CONSENT_PUBLIC, CREATED_AT, APP_AREA, SCREEN_NAME)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          body.productId,
          null,
          null,
          body.text,
          body.role,
          body.consentPublic ? 1 : 0,
          body.createdAt,
          null,
          null,
        );
        sendJson(response, 200, { ok: true, id: Number(result.lastInsertRowid) });
        }
      } else {
        sendJson(response, 200, { ok: true, id: appendFlatRuntimeKudos(body) });
      }
      return;
    }

    if (method === "POST" && pathname === "/api/screen-feedback") {
      checkRateLimit({ request, bucket: "screen-feedback-create", max: WRITE_RATE_LIMIT_MAX });
      const body = validateScreenFeedbackPayload(await readBody(request));
      if (useDbDataSource) {
        if (usePostgresDb) {
          const result = await withPostgresClient((client) =>
            client.query(
              `
              INSERT INTO feedback (product_id, feature_id, screen_id, feedback_type, feedback_text, role, created_at, app_area, screen_name)
              VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)
              RETURNING feedback_id
              `,
              [
                body.productId,
                body.featureId,
                body.screenId,
                body.type,
                body.text,
                body.role,
                body.createdAt,
                body.app,
                body.screenName,
              ],
            ),
          );
          sendJson(response, 200, { ok: true, id: Number(result.rows[0]?.feedback_id) });
        } else {
          const result = db.prepare(`
          INSERT INTO feedback (PRODUCT_ID, FEATURE_ID, SCREEN_ID, FEEDBACK_TYPE, FEEDBACK_TEXT, ROLE, CREATED_AT, APP_AREA, SCREEN_NAME)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          body.productId,
          body.featureId,
          body.screenId,
          body.type,
          body.text,
          body.role,
          body.createdAt,
          body.app,
          body.screenName,
        );
        sendJson(response, 200, { ok: true, id: Number(result.lastInsertRowid) });
        }
      } else {
        sendJson(response, 200, { ok: true, id: appendFlatRuntimeScreenFeedback(body) });
      }
      return;
    }

    if (method === "POST" && pathname === "/api/card-sort") {
      checkRateLimit({ request, bucket: "card-sort-upsert", max: WRITE_RATE_LIMIT_MAX });
      const body = validateCardSortPayload(await readBody(request));
      if (!useDbDataSource) {
        upsertFlatRuntimeCardSort(body);
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (method === "POST" && pathname === "/api/synthesis/stream") {
      checkRateLimit({ request, bucket: "synthesis-stream", max: SYNTHESIS_RATE_LIMIT_MAX });
      const body = await readBody(request, { maxBytes: MAX_BODY_BYTES * 4 });
      const outputMode = String(body.outputMode ?? body.mode ?? "roadmap").toLowerCase();
      if (!["roadmap", "prd"].includes(outputMode)) {
        throw createHttpError(400, "outputMode must be one of: roadmap, prd.");
      }
      const macrosType = typeof body.macros;
      if (body.macros != null && (macrosType !== "object" || Array.isArray(body.macros))) {
        throw createHttpError(400, "macros must be an object when provided.");
      }
      const signals = await loadSignalsForSynthesis();
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        ...buildCorsHeaders(request, "POST,OPTIONS"),
      });
      response.write(": connected\n\n");
      let synthesisSucceeded = false;
      try {
        await runSynthesis({
          requestBody: body,
          signals,
          config: synthesisConfig,
          log: (message) => console.log(message),
          sendEvent: (event) => sendSseEvent(response, event),
        });
        synthesisSucceeded = true;
      } catch (error) {
        const code = error?.code ?? "ERR-06";
        const message = error instanceof Error ? error.message : "Synthesis failed";
        sendSseEvent(response, { type: "error", code, message });
      } finally {
        if (synthesisSucceeded) {
          synthesisSessionState.themesViewActive = true;
        }
        response.end();
      }
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof ServerAICallError) {
      sendJson(response, 500, { error: error.message });
      return;
    }
    if (error instanceof HttpError) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(response, 500, { error: message });
  }
};

const startupLocationMigrationPromise = (async () => {
  if (useDbDataSource) {
    await migrateDbLocationFields();
    return;
  }
  migrateRuntimeStoreLocationFields();
})().catch((error) => {
  // eslint-disable-next-line no-console
  console.warn("[Migration] Failed to strip location fields at startup.", error);
});

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectExecution) {
  startupLocationMigrationPromise
    .finally(() => {
      const server = http.createServer(handleApiRequest);
      server.listen(port, "127.0.0.1", () => {
        // eslint-disable-next-line no-console
        console.log(`[api] running on http://localhost:${port} · mode=${dataSourceMode} · dbEngine=${dbEngine} · db=${dbPath} · synthesisProvider=${synthesisConfig.provider ?? "none"}`);
      });
    });
}
