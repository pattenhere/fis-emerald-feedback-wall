import { aiCall } from "./api/aiCall.mjs";
import { AI_PROVIDER_CONFIG } from "./config/aiProvider.mjs";

const DEFAULTS = {
  CONTEXT_WINDOW_TOKENS: 200_000,
  TOKEN_LIMIT_HEADROOM_PCT: 20,
  FEATURE_REQUEST_TOP_N: 20,
  FEATURE_REQUEST_TOP_N_REDUCED: 10,
  FREETEXT_PER_SCREEN_REDUCED: 3,
  COMPETING_MIN_EACH: 3,
  COMPETING_MIN_SPLIT_RATIO: 0.4,
  UPWEIGHT_MULTIPLIER: 2,
  PHASE1_TEMPERATURE: 0.3,
  PHASE2_TEMPERATURE: 0.4,
  PHASE1_MAX_TOKENS: 1300,
  PHASE2_MAX_TOKENS_ROADMAP: 1600,
  PHASE2_MAX_TOKENS_PRD: 1900,
  PHASE1_TIMEOUT_MS: 120000,
  PHASE2_STALL_WARNING_MS: 10000,
  PHASE2_STALL_TERMINATE_MS: 60000,
  MAX_PUBLIC_QUOTES_DEFAULT: 3,
  MAX_PUBLIC_QUOTES_EMPHASISED: 6,
  PHASE1_SCREEN_LIMIT: 8,
  SCREEN_THEME_LIMIT_PER_TAG: 4,
  SCREEN_THEME_EXAMPLES_PER_THEME: 1,
  FEATURE_THEME_LIMIT: 5,
};

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toBool = (value) => String(value ?? "").toLowerCase() === "true";
const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized.length > 0) return normalized;
  }
  return "";
};
export const buildSynthesisConfig = (env) => {
  const provider = AI_PROVIDER_CONFIG.apiKey ? AI_PROVIDER_CONFIG.provider : null;
  const model = firstNonEmpty(env.SYNTHESIS_MODEL, env.VITE_SYNTHESIS_MODEL, AI_PROVIDER_CONFIG.defaultModel);

  return {
    provider,
    model,
    fastModel: AI_PROVIDER_CONFIG.fastModel,
    baseURL: AI_PROVIDER_CONFIG.baseURL,
    healthEndpoint: AI_PROVIDER_CONFIG.healthEndpoint,
    debugPrompt: toBool(env.SYNTHESIS_DEBUG_PROMPT),
    CONTEXT_WINDOW_TOKENS: toNumber(env.SYNTHESIS_CONTEXT_WINDOW_TOKENS, DEFAULTS.CONTEXT_WINDOW_TOKENS),
    TOKEN_LIMIT_HEADROOM_PCT: toNumber(env.TOKEN_LIMIT_HEADROOM_PCT, DEFAULTS.TOKEN_LIMIT_HEADROOM_PCT),
    FEATURE_REQUEST_TOP_N: toNumber(env.FEATURE_REQUEST_TOP_N, DEFAULTS.FEATURE_REQUEST_TOP_N),
    FEATURE_REQUEST_TOP_N_REDUCED: toNumber(env.FEATURE_REQUEST_TOP_N_REDUCED, DEFAULTS.FEATURE_REQUEST_TOP_N_REDUCED),
    FREETEXT_PER_SCREEN_REDUCED: toNumber(env.FREETEXT_PER_SCREEN_REDUCED, DEFAULTS.FREETEXT_PER_SCREEN_REDUCED),
    COMPETING_MIN_EACH: toNumber(env.COMPETING_MIN_EACH, DEFAULTS.COMPETING_MIN_EACH),
    COMPETING_MIN_SPLIT_RATIO: toNumber(env.COMPETING_MIN_SPLIT_RATIO, DEFAULTS.COMPETING_MIN_SPLIT_RATIO),
    UPWEIGHT_MULTIPLIER: toNumber(env.UPWEIGHT_MULTIPLIER, DEFAULTS.UPWEIGHT_MULTIPLIER),
    PHASE1_TEMPERATURE: toNumber(env.PHASE1_TEMPERATURE, DEFAULTS.PHASE1_TEMPERATURE),
    PHASE2_TEMPERATURE: toNumber(env.PHASE2_TEMPERATURE, DEFAULTS.PHASE2_TEMPERATURE),
    PHASE1_MAX_TOKENS: toNumber(env.PHASE1_MAX_TOKENS, DEFAULTS.PHASE1_MAX_TOKENS),
    PHASE2_MAX_TOKENS_ROADMAP: toNumber(env.PHASE2_MAX_TOKENS_ROADMAP, DEFAULTS.PHASE2_MAX_TOKENS_ROADMAP),
    PHASE2_MAX_TOKENS_PRD: toNumber(env.PHASE2_MAX_TOKENS_PRD, DEFAULTS.PHASE2_MAX_TOKENS_PRD),
    PHASE1_TIMEOUT_MS: toNumber(env.PHASE1_TIMEOUT_MS, DEFAULTS.PHASE1_TIMEOUT_MS),
    PHASE2_STALL_WARNING_MS: toNumber(env.PHASE2_STALL_WARNING_MS, DEFAULTS.PHASE2_STALL_WARNING_MS),
    PHASE2_STALL_TERMINATE_MS: toNumber(env.PHASE2_STALL_TERMINATE_MS, DEFAULTS.PHASE2_STALL_TERMINATE_MS),
    MAX_PUBLIC_QUOTES_DEFAULT: toNumber(env.MAX_PUBLIC_QUOTES_DEFAULT, DEFAULTS.MAX_PUBLIC_QUOTES_DEFAULT),
    MAX_PUBLIC_QUOTES_EMPHASISED: toNumber(env.MAX_PUBLIC_QUOTES_EMPHASISED, DEFAULTS.MAX_PUBLIC_QUOTES_EMPHASISED),
    PHASE1_SCREEN_LIMIT: toNumber(env.PHASE1_SCREEN_LIMIT, DEFAULTS.PHASE1_SCREEN_LIMIT),
    SCREEN_THEME_LIMIT_PER_TAG: toNumber(env.SCREEN_THEME_LIMIT_PER_TAG, DEFAULTS.SCREEN_THEME_LIMIT_PER_TAG),
    SCREEN_THEME_EXAMPLES_PER_THEME: toNumber(env.SCREEN_THEME_EXAMPLES_PER_THEME, DEFAULTS.SCREEN_THEME_EXAMPLES_PER_THEME),
    FEATURE_THEME_LIMIT: toNumber(env.FEATURE_THEME_LIMIT, DEFAULTS.FEATURE_THEME_LIMIT),
    enableLocalFallback: toBool(env.SYNTHESIS_ENABLE_LOCAL_FALLBACK),
  };
};

const SYNTHESIS_INSTRUCTIONS = [
  "You are the synthesis engine for Emerald Feedback Wall (conference prototype).",
  "Ground analysis strictly in supplied signal payload.",
  "Respect privacy rules at all times:",
  "- You may quote verbatim only kudos marked public-safe.",
  "- Never quote private kudos verbatim.",
  "Apply role segmentation when role signals are present.",
  "Prioritize by volume, severity, and cross-screen impact.",
  "Keep output concise and deterministic; do not add narrative outside schema.",
  "Phase 1 is machine analysis only. No prose-heavy rationale blocks.",
  "Output-size targets (when sufficient signal exists):",
  "- p0Items: 3 to 5",
  "- p1Items: 5 to 8",
  "- p2Themes: 4 to 6",
  "- crossCuttingInsights: 3 to 5",
  "- selectedQuotes: 0 to 3 (or up to 6 if emphasise quotes macro is active)",
  "- competingPerspectives: only top 3 highest-split screens",
].join("\n");

const PHASE1_JSON_SCHEMA = {
  name: "phase1_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      p0Items: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            why: { type: "string" },
            evidenceSources: { type: "array", items: { type: "string" }, maxItems: 8 },
            rolesAffected: { anyOf: [{ type: "null" }, { type: "array", items: { type: "string" }, maxItems: 6 }] },
            effortEstimate: { type: "string" },
            conflictLevel: { type: "string" },
            signalCount: { type: "number" },
            screenNames: { type: "array", items: { type: "string" }, maxItems: 8 },
          },
          required: ["title", "why", "evidenceSources", "rolesAffected", "effortEstimate", "conflictLevel", "signalCount", "screenNames"],
        },
      },
      p1Items: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            why: { type: "string" },
            evidenceSources: { type: "array", items: { type: "string" }, maxItems: 8 },
            rolesAffected: { anyOf: [{ type: "null" }, { type: "array", items: { type: "string" }, maxItems: 6 }] },
            effortEstimate: { type: "string" },
            conflictLevel: { type: "string" },
            signalCount: { type: "number" },
            screenNames: { type: "array", items: { type: "string" }, maxItems: 8 },
          },
          required: ["title", "why", "evidenceSources", "rolesAffected", "effortEstimate", "conflictLevel", "signalCount", "screenNames"],
        },
      },
      p2Themes: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            theme: { type: "string" },
            why: { type: "string" },
            signalCount: { type: "number" },
            screenNames: { type: "array", items: { type: "string" }, maxItems: 8 },
          },
          required: ["theme", "why", "signalCount", "screenNames"],
        },
      },
      crossCuttingInsights: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            insight: { type: "string" },
            rolesAffected: {
              anyOf: [
                { type: "null" },
                { type: "array", items: { type: "string" }, maxItems: 6 },
              ],
            },
            screenCount: { type: "number" },
          },
          required: ["insight", "rolesAffected", "screenCount"],
        },
      },
      selectedQuotes: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            role: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
          required: ["text", "role"],
        },
      },
      competingPerspectives: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            screenName: { type: "string" },
            conflictLevel: { type: "string" },
            positiveCount: { type: "number" },
            negativeCount: { type: "number" },
            recommendation: { type: "string" },
          },
          required: ["screenName", "conflictLevel", "positiveCount", "negativeCount", "recommendation"],
        },
      },
      macroApplicationLog: { type: "array", items: { type: "string" }, maxItems: 12 },
    },
    required: ["p0Items", "p1Items", "p2Themes", "crossCuttingInsights", "selectedQuotes", "competingPerspectives", "macroApplicationLog"],
  },
};
const PHASE1_SCHEMA_SNIPPET = JSON.stringify(PHASE1_JSON_SCHEMA.schema, null, 2);

const normalizeRole = (value) => {
  const v = String(value ?? "").toLowerCase().trim();
  if (["ops", "eng", "product", "finance", "exec"].includes(v)) return v;
  return "unspecified";
};

const toTypeTag = (value) => {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "works-well" || v === "works_well") return "works_well";
  if (v === "missing" || v === "missing_element") return "missing_element";
  if (v === "issue" || v === "pain_point") return "pain_point";
  if (v === "confusing") return "confusing";
  return "suggestion";
};

const macrosActiveCount = (macros) => {
  return [
    macros?.upweightSection != null,
    macros?.p0FocusOnly === true,
    macros?.excludeBelowN != null,
    macros?.emphasiseQuotes === true,
  ].filter(Boolean).length;
};

const validateMacros = (macros) => {
  const activeCount = macrosActiveCount(macros);
  if (activeCount > 2) {
    const error = new Error("Too many macros active — maximum is 2. Deactivate at least one and try again.");
    error.code = "ERR-01";
    throw error;
  }
};

const applyExclusionFilter = (signals, macros) => {
  if (macros.excludeBelowN == null) {
    return { ...signals, excluded: [], excludedScreenCount: 0 };
  }
  const n = Number(macros.excludeBelowN);
  const countByScreen = new Map();
  for (const sf of signals.screenFeedback) {
    const key = `${sf.appSection}::${sf.screenName}`;
    countByScreen.set(key, (countByScreen.get(key) ?? 0) + 1);
  }
  const included = [];
  const excluded = [];
  for (const sf of signals.screenFeedback) {
    const key = `${sf.appSection}::${sf.screenName}`;
    const count = countByScreen.get(key) ?? 0;
    if (count >= n) included.push(sf);
    else excluded.push(sf);
  }
  return {
    ...signals,
    screenFeedback: included,
    excluded,
    excludedScreenCount: new Set(excluded.map((sf) => `${sf.appSection}::${sf.screenName}`)).size,
  };
};

const applyUpweighting = (signals, macros, config) => {
  if (!macros.upweightSection) {
    return { ...signals, upweightedSection: null, upweightedRecordCount: 0, upweightWarning: null };
  }
  const target = String(macros.upweightSection).toLowerCase().trim();
  const multiplier = Math.max(1, Number(config.UPWEIGHT_MULTIPLIER ?? 2));
  const output = [];
  let matched = 0;
  for (const sf of signals.screenFeedback) {
    output.push(sf);
    if (String(sf.appSection).toLowerCase().trim() === target) {
      matched += 1;
      for (let i = 1; i < multiplier; i += 1) {
        output.push({ ...sf, upweighted: true });
      }
    }
  }
  const upweightWarning = matched === 0 ? `Upweight section "${macros.upweightSection}" matched no screen feedback records — check section name spelling.` : null;
  return {
    ...signals,
    screenFeedback: output,
    upweightedSection: macros.upweightSection,
    upweightedRecordCount: matched,
    upweightWarning,
  };
};

export const detectCompetingPerspectives = (screenFeedback, config) => {
  const POSITIVE = new Set(["works_well"]);
  const NEGATIVE = new Set(["pain_point", "confusing", "missing_element"]);
  const byScreen = new Map();
  for (const sf of screenFeedback) {
    const key = `${sf.appSection}::${sf.screenName}`;
    const list = byScreen.get(key) ?? [];
    list.push(sf);
    byScreen.set(key, list);
  }
  const MIN_EACH = Number(config.COMPETING_MIN_EACH);
  const MIN_SPLIT_RATIO = Number(config.COMPETING_MIN_SPLIT_RATIO);
  const conflicts = [];
  for (const [key, items] of byScreen.entries()) {
    const pos = items.filter((sf) => POSITIVE.has(sf.typeTag)).length;
    const neg = items.filter((sf) => NEGATIVE.has(sf.typeTag)).length;
    if (pos >= MIN_EACH && neg >= MIN_EACH) {
      const ratio = Math.min(pos, neg) / Math.max(pos, neg);
      if (ratio >= MIN_SPLIT_RATIO) {
        const [appSection, screenName] = key.split("::");
        conflicts.push({ appSection, screenName, positiveCount: pos, negativeCount: neg, totalCount: items.length, splitRatio: ratio });
      }
    }
  }
  return conflicts.sort((a, b) => {
    const scoreA = Math.min(a.positiveCount, a.negativeCount) * a.splitRatio;
    const scoreB = Math.min(b.positiveCount, b.negativeCount) * b.splitRatio;
    return scoreB - scoreA || b.totalCount - a.totalCount;
  });
};

const computeAggregates = (signals, cardSortResults) => {
  const roleBreakdown = {
    ops: 0,
    eng: 0,
    product: 0,
    finance: 0,
    exec: 0,
    unspecified: 0,
  };

  for (const sf of signals.screenFeedback) {
    const role = normalizeRole(sf.sessionRole);
    roleBreakdown[role] += 1;
  }
  for (const fr of signals.featureRequests) {
    const role = normalizeRole(fr.sessionRole);
    roleBreakdown[role] += 1;
  }

  const screenFeedbackBySection = {};
  for (const sf of signals.screenFeedback) {
    screenFeedbackBySection[sf.appSection] = (screenFeedbackBySection[sf.appSection] ?? 0) + 1;
  }

  const rankedFeatures = [...signals.featureRequests]
    .map((item) => ({ ...item, compositeScore: item.voteCount * (item.impactScore ?? 3) }))
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const cardTotals = new Map();
  for (const r of cardSortResults) {
    if (!r?.conceptTitle) continue;
    const current = cardTotals.get(r.conceptTitle) ?? { high: 0, excited: 0, total: 0 };
    current.total += 1;
    if (r.tier === "high") current.high += 1;
    if (r.reaction === "excited") current.excited += 1;
    cardTotals.set(r.conceptTitle, current);
  }

  const cardSortByConceptTier = [...cardTotals.entries()]
    .map(([concept, c]) => ({
      concept,
      pctHigh: c.total > 0 ? Math.round((c.high / c.total) * 100) : 0,
      pctExcited: c.total > 0 ? Math.round((c.excited / c.total) * 100) : 0,
    }))
    .sort((a, b) => b.pctHigh - a.pctHigh);

  return {
    totalFeatureVotes: signals.featureRequests.reduce((sum, f) => sum + f.voteCount, 0),
    totalScreenFeedback: signals.screenFeedback.length,
    totalKudos: signals.kudos.length,
    totalCardSortResponses: cardSortResults.length,
    screenFeedbackBySection,
    rankedFeatures,
    topFeatureRequests: rankedFeatures,
    cardSortByConceptTier,
    roleBreakdown,
  };
};

const partitionKudos = (kudos, macros) => ({
  publicSafe: kudos.filter((k) => k.isPublicSafe),
  privatePool: kudos.filter((k) => !k.isPublicSafe),
  emphasised: macros.emphasiseQuotes === true,
});

const estimateTokens = (text) => Math.ceil(String(text ?? "").length / 4);

const SYNTHETIC_FILLER_PATTERNS = [
  /this wording was tuned for uniqueness\.?/giu,
  /the phrasing was adjusted to avoid collisions\.?/giu,
  /wording (?:has been|was) tuned for uniqueness\.?/giu,
  /phrasing (?:has been|was) adjusted to avoid collisions\.?/giu,
  /this (?:line|comment|feedback) was rewritten for uniqueness\.?/giu,
  /this version preserves intent while staying distinct\.?/giu,
  /the sentence was expanded to keep this seed unique\.?/giu,
  /intent was preserved while wording was made unique\.?/giu,
];

const cleanFeedbackText = (value) => {
  let next = String(value ?? "").trim();
  for (const pattern of SYNTHETIC_FILLER_PATTERNS) {
    next = next.replace(pattern, " ");
  }
  return next.replace(/\s+/gu, " ").trim();
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "over", "under", "across", "while", "during", "would", "could",
  "should", "their", "there", "about", "between", "before", "after", "need", "needs", "missing", "issue", "works", "well", "suggestion",
  "screen", "feature", "feedback", "team", "teams", "users", "user", "more", "less", "very", "much", "make", "made", "also", "than",
]);

const KNOWN_ROLE_PHRASES = [
  { role: "ops", patterns: [/operations?/u, /servicing analysts?/u, /day-to-day operators?/u] },
  { role: "finance", patterns: [/finance/u, /portfolio governance/u] },
  { role: "product", patterns: [/product/u, /product managers?/u] },
  { role: "eng", patterns: [/engineering/u, /developers?/u] },
  { role: "exec", patterns: [/executives?/u, /leadership/u] },
];

const CANONICAL_THEME_RULES = [
  { theme: "direct jump links to related history", patterns: [/jump links?/u, /related history/u, /direct links?/u] },
  { theme: "structured exception reasons", patterns: [/structured exception reasons?/u, /exception reasons?/u, /reason templates?/u] },
  { theme: "reusable review checklists", patterns: [/review checklists?/u, /checklist/u] },
  { theme: "audit note field", patterns: [/audit note field/u, /audit note/u] },
  { theme: "override rationale capture", patterns: [/override rationale/u, /rationale capture/u] },
  { theme: "stale task indicators", patterns: [/stale[- ]task indicators?/u, /stale task/u] },
  { theme: "automated dependency flags", patterns: [/dependency flags?/u, /dependency warnings?/u] },
  { theme: "bulk reassignment controls", patterns: [/bulk reassignment/u, /bulk update/u] },
  { theme: "cross-lane status rollups", patterns: [/cross[- ]lane status/u, /status rollups?/u] },
  { theme: "linked task breadcrumbs", patterns: [/breadcrumbs?/u, /linked tasks?/u] },
  { theme: "filter by owner options", patterns: [/filter[- ]by[- ]owner/u, /owner filters?/u] },
  { theme: "exception visibility", patterns: [/exception visibility/u, /exception context/u] },
  { theme: "handoff signaling", patterns: [/handoff signaling/u, /handoff signal/u, /handoffs?/u] },
  { theme: "queue prioritization", patterns: [/queue prioritization/u, /priority[- ]aware queue/u, /priorit(y|ization)/u] },
  { theme: "workflow sequencing", patterns: [/workflow sequencing/u, /sequencing/u] },
  { theme: "alert clarity", patterns: [/alert clarity/u, /alert thresholds?/u] },
  { theme: "task ownership", patterns: [/task ownership/u, /owner context/u] },
  { theme: "search precision", patterns: [/search precision/u, /search quality/u] },
  { theme: "review pacing", patterns: [/review pacing/u, /review speed/u] },
  { theme: "context retention", patterns: [/context retention/u, /keeps context/u, /context switching/u] },
  { theme: "status context", patterns: [/status context/u, /status timeline/u] },
  { theme: "approval routing", patterns: [/approval routing/u, /routing approvals?/u] },
  { theme: "audit traceability", patterns: [/audit traceability/u, /traceability/u] },
  { theme: "field validation", patterns: [/field validation/u, /validation errors?/u] },
];

const FEATURE_REQUEST_CANONICAL_RULES = [
  { theme: "configurable alert thresholds", patterns: [/configurable alert thresholds?/u, /alert thresholds?/u] },
  { theme: "context-rich handoff summaries", patterns: [/handoff summaries?/u, /handoff context/u] },
  { theme: "approval rationale capture", patterns: [/approval rationale/u, /rationale capture/u] },
  { theme: "priority-aware queue controls", patterns: [/priority[- ]aware queue/u, /queue controls?/u] },
  { theme: "structured amendment pathways", patterns: [/amendment pathways?/u, /amendments?/u] },
  { theme: "guided exception handling", patterns: [/guided exception/u, /exception handling/u] },
  { theme: "saved operational views", patterns: [/saved views?/u, /operational views?/u] },
  { theme: "split-view comparison", patterns: [/split[- ]view/u, /side[- ]by[- ]side/u] },
  { theme: "progress timelines", patterns: [/progress timelines?/u, /timeline markers?/u] },
  { theme: "next-best action guidance", patterns: [/next[- ]best action/u] },
  { theme: "role-based default views", patterns: [/role[- ]based default views?/u, /role-aware/u] },
  { theme: "compact summary panels", patterns: [/compact summary panel/u, /summary panel/u] },
  { theme: "inline owner context", patterns: [/inline owner context/u, /owner context/u] },
  { theme: "one-click quick actions", patterns: [/one[- ]click/u, /quick actions?/u] },
  { theme: "pinned workflow checkpoints", patterns: [/pinned workflow checkpoints?/u, /workflow checkpoints?/u] },
  { theme: "related records side-by-side", patterns: [/related records?/u, /side[- ]by[- ]side/u] },
  { theme: "focused exception drill-down", patterns: [/exception drill[- ]down/u, /focused exception/u] },
];

const tokenizeForTheme = (value) => {
  const tokens = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .split(/\s+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  return [...new Set(tokens)];
};

const buildThemeKey = (text) => {
  const tokens = tokenizeForTheme(text);
  if (tokens.length === 0) return String(text ?? "").toLowerCase().replace(/\s+/gu, " ").trim();
  return tokens.slice(0, 8).sort().join("|");
};

const toThemeLabel = (text) => {
  const cleaned = cleanFeedbackText(text);
  if (!cleaned) return "";
  const normalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
};

const inferCanonicalTheme = (text, rules) => {
  const cleaned = cleanFeedbackText(text).toLowerCase();
  if (!cleaned) return "";
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(cleaned))) {
      return rule.theme;
    }
  }
  const stripped = cleaned
    .replace(/\([^)]*\)/gu, " ")
    .replace(/\b(add|launch|include|provide|enable|create|improve|support|allow)\b/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const tokens = tokenizeForTheme(stripped);
  return tokens.slice(0, 3).join(" ") || stripped.slice(0, 48) || "misc improvement";
};

const extractEffect = (text) => {
  const cleaned = cleanFeedbackText(text);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  const markers = [" to ", " so ", " which ", " while ", " because "];
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx > 0 && idx < cleaned.length - marker.length - 8) {
      const effect = cleaned.slice(idx + marker.length).trim().replace(/[.]+$/u, "");
      if (effect.length > 4) return effect;
    }
  }
  return null;
};

const inferRolesFromText = (text) => {
  const lower = String(text ?? "").toLowerCase();
  const roles = new Set();
  for (const group of KNOWN_ROLE_PHRASES) {
    if (group.patterns.some((pattern) => pattern.test(lower))) {
      roles.add(group.role);
    }
  }
  return roles;
};

const takeTopByCount = (mapLike, limit, mapper) =>
  [...mapLike.values()]
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)))
    .slice(0, limit)
    .map(mapper);

const aggregateScreenFeedback = (screenFeedback, config) => {
  const byScreen = new Map();
  for (const item of screenFeedback) {
    const key = `${item.appSection}::${item.screenName}`;
    const bucket = byScreen.get(key) ?? {
      appSection: item.appSection,
      screenName: item.screenName,
      totalSubmissions: 0,
      tagCounts: { pain_point: 0, confusing: 0, missing_element: 0, works_well: 0, suggestion: 0 },
      themesByTag: {
        pain_point: new Map(),
        confusing: new Map(),
        missing_element: new Map(),
        works_well: new Map(),
        suggestion: new Map(),
      },
      severityScore: 0,
    };

    const cleaned = cleanFeedbackText(item.freetext ?? "");
    if (cleaned.length === 0) continue;

    bucket.totalSubmissions += 1;
    bucket.tagCounts[item.typeTag] = (bucket.tagCounts[item.typeTag] ?? 0) + 1;
    if (item.typeTag === "pain_point" || item.typeTag === "missing_element" || item.typeTag === "confusing") {
      bucket.severityScore += 2;
    } else if (item.typeTag === "suggestion") {
      bucket.severityScore += 1;
    }

    const canonicalTheme = inferCanonicalTheme(cleaned, CANONICAL_THEME_RULES);
    const themeKey = `${item.typeTag}|${canonicalTheme}`;
    const themeMap = bucket.themesByTag[item.typeTag] ?? bucket.themesByTag.suggestion;
    const existing = themeMap.get(themeKey) ?? {
      key: themeKey,
      theme: canonicalTheme,
      tag: item.typeTag,
      count: 0,
      effects: new Set(),
      rolesAffected: new Set(),
      example: cleaned,
    };
    existing.count += 1;
    const effect = extractEffect(cleaned);
    if (effect) existing.effects.add(effect);
    if (item.sessionRole && item.sessionRole !== "unspecified") {
      existing.rolesAffected.add(item.sessionRole);
    }
    const inferredRoles = inferRolesFromText(cleaned);
    for (const role of inferredRoles) existing.rolesAffected.add(role);
    if (cleaned.length < existing.example.length) {
      existing.example = cleaned;
    }
    themeMap.set(themeKey, existing);
    byScreen.set(key, bucket);
  }

  const rankedScreens = [...byScreen.values()]
    .sort((a, b) => {
      const scoreA = a.totalSubmissions + a.severityScore;
      const scoreB = b.totalSubmissions + b.severityScore;
      return scoreB - scoreA || a.screenName.localeCompare(b.screenName);
    })
    .slice(0, Math.max(1, config.PHASE1_SCREEN_LIMIT))
    .map((bucket) => ({
      appSection: bucket.appSection,
      screenName: bucket.screenName,
      totalSubmissions: bucket.totalSubmissions,
      tagCounts: bucket.tagCounts,
      topPainThemes: takeTopByCount(bucket.themesByTag.pain_point, config.SCREEN_THEME_LIMIT_PER_TAG, (item) => ({
        theme: item.theme,
        tag: item.tag,
        count: item.count,
        effects: [...item.effects].slice(0, 3),
        rolesAffected: item.rolesAffected.size ? [...item.rolesAffected].sort((a, b) => a.localeCompare(b)) : null,
        example: item.example,
      })),
      topMissingThemes: takeTopByCount(bucket.themesByTag.missing_element, config.SCREEN_THEME_LIMIT_PER_TAG, (item) => ({
        theme: item.theme,
        tag: item.tag,
        count: item.count,
        effects: [...item.effects].slice(0, 3),
        rolesAffected: item.rolesAffected.size ? [...item.rolesAffected].sort((a, b) => a.localeCompare(b)) : null,
        example: item.example,
      })),
      topSuggestionThemes: takeTopByCount(bucket.themesByTag.suggestion, config.SCREEN_THEME_LIMIT_PER_TAG, (item) => ({
        theme: item.theme,
        tag: item.tag,
        count: item.count,
        effects: [...item.effects].slice(0, 3),
        rolesAffected: item.rolesAffected.size ? [...item.rolesAffected].sort((a, b) => a.localeCompare(b)) : null,
        example: item.example,
      })),
      topWorksWellThemes: takeTopByCount(bucket.themesByTag.works_well, config.SCREEN_THEME_LIMIT_PER_TAG, (item) => ({
        theme: item.theme,
        tag: item.tag,
        count: item.count,
        effects: [...item.effects].slice(0, 3),
        rolesAffected: item.rolesAffected.size ? [...item.rolesAffected].sort((a, b) => a.localeCompare(b)) : null,
        example: item.example,
      })),
    }));

  return {
    totalRawComments: screenFeedback.filter((item) => cleanFeedbackText(item.freetext ?? "").length > 0).length,
    screensIncluded: rankedScreens.length,
    aggregatedThemeCount: rankedScreens.reduce(
      (sum, screen) =>
        sum +
        screen.topPainThemes.length +
        screen.topMissingThemes.length +
        screen.topSuggestionThemes.length +
        screen.topWorksWellThemes.length,
      0,
    ),
    screens: rankedScreens,
  };
};

const aggregateFeatureRequestThemes = (featureRequests, limit) => {
  const beforeUniqueThemeKeys = new Set();
  const grouped = new Map();
  for (const item of featureRequests) {
    const cleaned = cleanFeedbackText(item.text);
    if (!cleaned) continue;
    beforeUniqueThemeKeys.add(buildThemeKey(cleaned));
    const screenMatch = cleaned.match(/\(([^)]+)\)\s*$/u);
    const screenHint = screenMatch ? screenMatch[1].trim() : null;
    const normalizedTitle = screenMatch ? cleaned.slice(0, screenMatch.index).trim() : cleaned;
    const canonicalTheme = inferCanonicalTheme(normalizedTitle, FEATURE_REQUEST_CANONICAL_RULES);
    const key = canonicalTheme;
    const bucket = grouped.get(key) ?? {
      key,
      theme: canonicalTheme,
      totalVotes: 0,
      requestCount: 0,
      areas: new Set(),
      exampleTitles: [],
    };
    bucket.totalVotes += Number(item.voteCount ?? 0);
    bucket.requestCount += 1;
    if (screenHint) bucket.areas.add(screenHint);
    if (item.workflowContext) bucket.areas.add(String(item.workflowContext));
    if (bucket.exampleTitles.length < 2 && !bucket.exampleTitles.includes(normalizedTitle)) {
      bucket.exampleTitles.push(normalizedTitle);
    }
    grouped.set(key, bucket);
  }

  const themes = [...grouped.values()]
    .sort((a, b) => b.totalVotes - a.totalVotes || b.requestCount - a.requestCount || a.theme.localeCompare(b.theme))
    .slice(0, limit)
    .map((item) => ({
      theme: item.theme,
      totalVotes: item.totalVotes,
      requestCount: item.requestCount,
      areas: [...item.areas].sort((a, b) => a.localeCompare(b)).slice(0, 4),
      exampleTitles: item.exampleTitles,
    }));
  return { themes, preGroupCount: beforeUniqueThemeKeys.size, postGroupCount: themes.length };
};

const buildCompactSynthesisPayload = ({ aggregates, macros, excludedInfo, featureThemes, screenSummary, conflicts, quoteSets }) => {
  const payload = {
    signalSummary: {
      totals: {
        featureVotes: aggregates.totalFeatureVotes,
        screenFeedback: aggregates.totalScreenFeedback,
        kudos: aggregates.totalKudos,
        cardSortResponses: aggregates.totalCardSortResponses,
      },
      excludedBelowThreshold: excludedInfo.count > 0 ? { count: excludedInfo.count, screenCount: excludedInfo.screenCount, threshold: macros.excludeBelowN } : undefined,
    },
    featureRequestThemes: featureThemes.themes,
    screenFeedbackSummary: screenSummary.screens,
    competingPerspectives: conflicts.slice(0, 3).map((item) => ({
      appSection: item.appSection,
      screenName: item.screenName,
      positiveCount: item.positiveCount,
      negativeCount: item.negativeCount,
      splitRatio: Number(item.splitRatio.toFixed(2)),
      totalCount: item.totalCount,
    })),
    kudosPublicSafe: quoteSets.publicSafe
      .slice()
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, quoteSets.emphasised ? 6 : 3)
      .map((item) => ({ text: cleanFeedbackText(item.text), role: item.roleLabel ?? null })),
    kudosPrivateThemes: undefined,
    macroInstructions: undefined,
    cardSortSummary: undefined,
  };

  if (quoteSets.privatePool.length > 0) {
    const privateThemes = new Map();
    for (const item of quoteSets.privatePool) {
      const cleaned = cleanFeedbackText(item.text);
      if (!cleaned) continue;
      const theme = inferCanonicalTheme(cleaned, CANONICAL_THEME_RULES);
      const key = `kudos|${theme}`;
      const existing = privateThemes.get(key) ?? { theme, count: 0 };
      existing.count += 1;
      privateThemes.set(key, existing);
    }
    payload.kudosPrivateThemes = [...privateThemes.values()]
      .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme))
      .slice(0, 8);
  }

  if (macros.upweightSection || macros.p0FocusOnly || macros.excludeBelowN != null || macros.emphasiseQuotes) {
    const active = [];
    if (macros.upweightSection) active.push(`Upweight app section: ${macros.upweightSection}`);
    if (macros.p0FocusOnly) active.push("P0 focus only");
    if (macros.excludeBelowN != null) active.push(`Exclude screens below N submissions: ${macros.excludeBelowN}`);
    if (macros.emphasiseQuotes) active.push("Emphasize marketing-safe quotes");
    payload.macroInstructions = active;
  }

  if (aggregates.cardSortByConceptTier.length > 0) {
    payload.cardSortSummary = aggregates.cardSortByConceptTier.slice(0, 8);
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    }),
  );
};

const buildSignalSummaryBlock = (agg, macros, excluded) => {
  const lines = [
    "EVENT SIGNAL SUMMARY",
    `Feature request votes:  ${agg.totalFeatureVotes}`,
    `Screen feedback items:  ${agg.totalScreenFeedback}`,
    `Kudos submissions:      ${agg.totalKudos}`,
    `Card sort responses:    ${agg.totalCardSortResponses}`,
    "",
    "Screen feedback by app section:",
  ];
  for (const [section, count] of Object.entries(agg.screenFeedbackBySection)) {
    lines.push(`  ${section}: ${count} items`);
  }
  if (excluded.count > 0) {
    lines.push("", `NOTE: ${excluded.count} screen feedback items from ${excluded.screenCount} screens were excluded (below threshold N=${macros.excludeBelowN}).`);
  }
  return lines.join("\n");
};

const buildFeatureRequestsBlock = (topFeatureRequests) => {
  const lines = ["TOP FEATURE REQUESTS (ranked by votes × impact score)", ""];
  for (const [i, fr] of topFeatureRequests.entries()) {
    const impactStr = fr.impactScore ? ` [Impact: ${fr.impactScore}/5]` : " [Impact: unscored]";
    lines.push(`${i + 1}. [${fr.voteCount} votes]${impactStr} ${fr.text}`);
    if (fr.workflowContext) lines.push(`   Context: ${fr.workflowContext}`);
    if (fr.sessionRole && fr.sessionRole !== "unspecified") lines.push(`   Submitted by: ${fr.sessionRole}`);
    if (fr.origin === "mobile") lines.push("   Origin: mobile");
  }
  return lines.join("\n");
};

const buildScreenFeedbackBlock = (screenFeedback, maxFreetextPerScreen) => {
  const grouped = new Map();
  for (const sf of screenFeedback) {
    if (!grouped.has(sf.appSection)) grouped.set(sf.appSection, new Map());
    const byScreen = grouped.get(sf.appSection);
    if (!byScreen.has(sf.screenName)) byScreen.set(sf.screenName, []);
    byScreen.get(sf.screenName).push(sf);
  }

  const lines = [];
  const sortedSections = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [section, screens] of sortedSections) {
    lines.push(`APP SECTION: ${section}`, "");
    for (const [screen, items] of [...screens.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const tally = { pain_point: 0, confusing: 0, missing_element: 0, works_well: 0, suggestion: 0 };
      for (const sf of items) {
        tally[sf.typeTag] += 1;
      }
      lines.push(`  Screen: ${screen} (${items.length} total submissions)`);
      lines.push(`  Tags: Pain point: ${tally.pain_point} | Confusing: ${tally.confusing} | Missing element: ${tally.missing_element} | Works well: ${tally.works_well} | Suggestion: ${tally.suggestion}`);
      const freetextItems = items.filter((sf) => sf.freetext).sort((a, b) => String(b.freetext).length - String(a.freetext).length);
      const limited = typeof maxFreetextPerScreen === "number" ? freetextItems.slice(0, maxFreetextPerScreen) : freetextItems;
      if (limited.length > 0) {
        lines.push("  Freetext feedback:");
        for (const sf of limited) {
          const role = sf.sessionRole && sf.sessionRole !== "unspecified" ? ` [${sf.sessionRole}]` : "";
          lines.push(`    - [${sf.typeTag}]${role} ${sf.freetext}`);
          if (sf.followUpResponse) {
            lines.push(`      Follow-up: ${sf.followUpResponse}`);
          }
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
};

const buildCompetingPerspectivesBlock = (conflicts) => {
  if (!conflicts.length) {
    return "COMPETING PERSPECTIVES: None detected.";
  }
  const lines = [
    "COMPETING PERSPECTIVES DETECTED",
    "These screens received both positive and negative feedback from different attendees.",
    "Treat each as representing genuine disagreement between attendees, not a data issue.",
    "Do NOT resolve these contradictions — surface both perspectives in your analysis.",
    "",
  ];
  for (const c of conflicts) {
    lines.push(
      `Screen: ${c.screenName} (${c.appSection})`,
      `  Positive signals: ${c.positiveCount} | Negative signals: ${c.negativeCount}`,
      `  Split ratio: ${(c.splitRatio * 100).toFixed(0)}%`,
      "",
    );
  }
  return lines.join("\n");
};

const buildKudosBlocks = (kudosSets, config) => {
  const quoteCount = kudosSets.emphasised ? config.MAX_PUBLIC_QUOTES_EMPHASISED : config.MAX_PUBLIC_QUOTES_DEFAULT;
  const sortedPublic = [...kudosSets.publicSafe].sort((a, b) => b.text.length - a.text.length);

  const publicLines = [
    "PUBLIC-SAFE KUDOS (consent approved — may be quoted verbatim)",
    `Target verbatim quotes in output: ${quoteCount}`,
    `Total available: ${sortedPublic.length}`,
    "",
  ];
  for (const k of sortedPublic) {
    const role = k.roleLabel ?? "unattributed";
    publicLines.push(`  [${role}] \"${k.text}\"`);
  }

  const privateLines = [
    "PRIVATE KUDOS — SENTIMENT ANALYSIS ONLY",
    "INSTRUCTION: Do NOT quote any of these verbatim in any output.",
    "Use only to identify aggregate themes and sentiment patterns.",
    "",
  ];
  for (const k of kudosSets.privatePool) {
    const role = k.roleLabel ?? "unattributed";
    privateLines.push(`  [${role}] ${k.text}`);
  }

  return { publicBlock: publicLines.join("\n"), privateBlock: privateLines.join("\n") };
};

const buildMacroInstructionsBlock = (macros) => {
  const lines = ["FACILITATOR INSTRUCTIONS (APPLY THESE TO YOUR ANALYSIS)"];
  let idx = 0;

  if (macros.upweightSection) {
    idx += 1;
    lines.push(
      "",
      `INSTRUCTION ${idx}: UPWEIGHT APP SECTION`,
      `The app section '${macros.upweightSection}' has been upweighted by the facilitator.`,
      "Screen feedback from this section appears twice in the data above (this is intentional).",
      "Give proportionally higher priority to issues and patterns from this section when determining P0 and P1 items.",
    );
  }
  if (macros.p0FocusOnly) {
    idx += 1;
    lines.push("", `INSTRUCTION ${idx}: P0 FOCUS MODE`, "Output P0 items and Patterns & Insights ONLY.", "Do NOT include P1, P2, or Marketing Moments sections.");
  }
  if (macros.excludeBelowN != null) {
    idx += 1;
    lines.push("", `INSTRUCTION ${idx}: LOW-SIGNAL SCREENS EXCLUDED`, `Screens with fewer than ${macros.excludeBelowN} submissions have been removed.`);
  }
  if (macros.emphasiseQuotes) {
    idx += 1;
    lines.push("", `INSTRUCTION ${idx}: EMPHASISE MARKETING-SAFE QUOTES`, "Select up to 6 verbatim quotes (instead of the default 3).");
  }

  if (idx === 0) {
    lines.push("", "No macro instructions active. Proceed with default analysis.");
  }
  return lines.join("\n");
};

const buildCardSortBlock = (aggregates) => {
  const lines = ["CARD SORT SIGNALS", ""];
  if (!aggregates.cardSortByConceptTier.length) {
    lines.push("No card sort responses captured.");
    return lines.join("\n");
  }
  for (const row of aggregates.cardSortByConceptTier) {
    lines.push(`- ${row.concept}: High ${row.pctHigh}% | Excited ${row.pctExcited}%`);
  }
  return lines.join("\n");
};

const buildPhase1Prompt = (payload) => {
  return [
    "You are performing Step 1 of a two-step synthesis process.",
    "Your output must be ONLY valid JSON — no prose, no markdown, no explanation.",
    "",
    "=== SIGNAL SUMMARY ===",
    payload.signalSummaryBlock,
    "",
    "=== FEATURE REQUESTS (ranked by composite score) ===",
    payload.featureRequestsBlock,
    "",
    "=== SCREEN FEEDBACK ===",
    payload.screenFeedbackBlock,
    "",
    "=== COMPETING PERSPECTIVES (pre-computed) ===",
    payload.competingPerspectivesBlock,
    "",
    "=== CARD SORT RESULTS ===",
    payload.cardSortBlock,
    "",
    "=== KUDOS (public-safe) ===",
    payload.publicKudosBlock,
    "",
    "=== KUDOS (private — sentiment analysis only, never quote verbatim) ===",
    payload.privateKudosBlock,
    "",
    "=== MACRO INSTRUCTIONS ===",
    payload.macroInstructionsBlock,
    "",
    "=== REQUIRED OUTPUT SCHEMA ===",
    PHASE1_SCHEMA_SNIPPET,
  ].join("\n");
};

const buildPhase2EditorialSummary = (phase1Json, macros) => {
  const priorityItems = [...(phase1Json.p0Items ?? []), ...(phase1Json.p1Items ?? [])]
    .slice(0, macros.p0FocusOnly ? 5 : 8)
    .map((item) => ({
      title: item.title,
      why: item.why,
      signalCount: item.signalCount ?? 0,
      effortEstimate: item.effortEstimate ?? "medium",
      conflictLevel: item.conflictLevel ?? "low",
      screenNames: Array.isArray(item.screenNames) ? item.screenNames.slice(0, 5) : [],
    }));
  return {
    priorityItems,
    themes: (phase1Json.p2Themes ?? []).slice(0, 6).map((item) => ({
      theme: item.theme,
      description: item.why,
      signalCount: item.signalCount ?? 0,
    })),
    crossCuttingInsights: (phase1Json.crossCuttingInsights ?? []).slice(0, 5).map((item) => ({
      insight: item.insight,
      screenCount: item.screenCount ?? 0,
      rolesAffected: Array.isArray(item.rolesAffected) ? item.rolesAffected : null,
    })),
    quotes: (phase1Json.selectedQuotes ?? []).slice(0, macros.emphasiseQuotes ? 6 : 3),
    competingPerspectives: (phase1Json.competingPerspectives ?? []).slice(0, 3),
  };
};

const buildPhase2Prompt = (mode, phase2EditorialSummary, macros) => {
  const editorialJson = JSON.stringify(phase2EditorialSummary);
  if (mode === "roadmap") {
    return [
      "You are performing Step 2 of synthesis. Write the final Roadmap output document from this editorial summary only.",
      macros.p0FocusOnly ? "P0 focus mode is active. Omit P1, P2, Marketing Moments." : "",
      "=== EDITORIAL SUMMARY ===",
      editorialJson,
      "Write using sections: P0 — Build Tonight, P1 — Next Sprint, P2 — Backlog, Patterns & Insights, Marketing Moments.",
      "Close with exact line: All items above are prototype recommendations derived from event feedback. No production commitments are implied.",
    ].filter(Boolean).join("\n\n");
  }

  return [
    "You are performing Step 2 of synthesis. Write a PRD from this editorial summary only.",
    "=== EDITORIAL SUMMARY ===",
    editorialJson,
    "Use sections: Overview, Problem Statement, Scope — Tonight's Build, Out of Scope, User Stories, Acceptance Criteria, Design Guidance, Success Metrics.",
  ].join("\n\n");
};

const withTimeout = async (promise, timeoutMs, code, message) => {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message);
          error.code = code;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const parseJsonPayloadFromText = (text) => {
  const trimmed = String(text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Phase 1 analysis returned malformed JSON.");
  }
};

const ensurePhase1Shape = (value) => {
  if (!value || typeof value !== "object") {
    throw new Error("Phase 1 analysis has invalid structure.");
  }
  const normalized = {
    p0Items: Array.isArray(value.p0Items)
      ? value.p0Items.map((item) => ({
          title: String(item?.title ?? ""),
          why: String(item?.why ?? item?.rationale ?? ""),
          evidenceSources: Array.isArray(item?.evidenceSources) ? item.evidenceSources.map((v) => String(v)) : [],
          rolesAffected: Array.isArray(item?.rolesAffected) ? item.rolesAffected.map((v) => String(v)) : null,
          effortEstimate: String(item?.effortEstimate ?? item?.feasibilityNote ?? "medium"),
          conflictLevel: String(item?.conflictLevel ?? (item?.conflictContext ? "medium" : "low")),
          signalCount: Number(item?.signalCount ?? 0),
          screenNames: Array.isArray(item?.screenNames) ? item.screenNames.map((v) => String(v)) : [],
        }))
      : [],
    p1Items: Array.isArray(value.p1Items)
      ? value.p1Items.map((item) => ({
          title: String(item?.title ?? ""),
          why: String(item?.why ?? item?.rationale ?? ""),
          evidenceSources: Array.isArray(item?.evidenceSources) ? item.evidenceSources.map((v) => String(v)) : [],
          rolesAffected: Array.isArray(item?.rolesAffected) ? item.rolesAffected.map((v) => String(v)) : null,
          effortEstimate: String(item?.effortEstimate ?? "medium"),
          conflictLevel: String(item?.conflictLevel ?? "low"),
          signalCount: Number(item?.signalCount ?? 0),
          screenNames: Array.isArray(item?.screenNames) ? item.screenNames.map((v) => String(v)) : [],
        }))
      : [],
    p2Themes: Array.isArray(value.p2Themes)
      ? value.p2Themes.map((item) => ({
          theme: String(item?.theme ?? ""),
          why: String(item?.why ?? item?.description ?? ""),
          signalCount: Number(item?.signalCount ?? 0),
          screenNames: Array.isArray(item?.screenNames) ? item.screenNames.map((v) => String(v)) : [],
        }))
      : [],
    crossCuttingInsights: Array.isArray(value.crossCuttingInsights) ? value.crossCuttingInsights : [],
    selectedQuotes: Array.isArray(value.selectedQuotes) ? value.selectedQuotes : [],
    competingPerspectives: Array.isArray(value.competingPerspectives)
      ? value.competingPerspectives
      : Array.isArray(value.competingPerspectivesNotes)
        ? value.competingPerspectivesNotes.map((item) => ({
            screenName: String(item?.screenName ?? ""),
            conflictLevel: "medium",
            positiveCount: 0,
            negativeCount: 0,
            recommendation: String(item?.recommendation ?? ""),
          }))
        : [],
    macroApplicationLog: Array.isArray(value.macroApplicationLog) ? value.macroApplicationLog : [],
  };
  return normalized;
};

const toOpenAIInput = (messages) => messages.map((m) => ({ role: m.role, content: [{ type: "input_text", text: m.content }] }));
const toAnthropicMessages = (messages) => {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  return { system, userMessages };
};
const toDebugTextMessages = (messages) =>
  messages.map((m, idx) => `--- message ${idx + 1} (${m.role}) ---\n${m.content}`).join("\n\n");

const toProviderEndpoint = (provider, baseURL, stream = false) => {
  if (!provider) return "unconfigured";
  const cleanedBase = String(baseURL ?? "").replace(/\/+$/u, "");
  if (provider === "anthropic") return `${cleanedBase}/v1/messages`;
  return `${cleanedBase}/v1/chat/completions${stream ? " (stream)" : ""}`;
};

const extractSystemPrompt = (messages, instructions = "") =>
  [
    String(instructions ?? "").trim(),
    ...messages
      .filter((m) => m.role === "system")
      .map((m) => String(m.content ?? "").trim())
      .filter(Boolean),
  ]
    .filter(Boolean)
    .join("\n\n");

const extractUserPrompt = (messages, input) => {
  if (Array.isArray(input) && input.length > 0) {
    const fromInput = input
      .map((entry) =>
        Array.isArray(entry?.content)
          ? entry.content
              .filter((chunk) => chunk?.type === "input_text" && typeof chunk?.text === "string")
              .map((chunk) => chunk.text)
              .join("\n")
          : "",
      )
      .filter(Boolean)
      .join("\n\n");
    if (fromInput) return fromInput;
  }
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => String(m.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
};

const createText = async ({ config, messages = [], temperature, maxOutputTokens, instructions, input }) => {
  const result = await aiCall({
    systemPrompt: extractSystemPrompt(messages, instructions),
    userPrompt: extractUserPrompt(messages, input),
    model: config.model,
    maxTokens: maxOutputTokens,
    temperature,
    stream: false,
  });
  return result.content;
};

const streamProviderText = async ({ config, messages, temperature, maxOutputTokens, onToken, onWarning }) => {
  let lastTokenAt = Date.now();
  let warned = false;
  let stalledOut = false;
  const stallWatch = setInterval(() => {
    const gap = Date.now() - lastTokenAt;
    if (!warned && gap > config.PHASE2_STALL_WARNING_MS) {
      warned = true;
      onWarning("Output is taking longer than expected...");
    }
    if (gap > config.PHASE2_STALL_TERMINATE_MS) {
      stalledOut = true;
    }
  }, 1000);

  let fullText = "";
  try {
    const result = await aiCall({
      systemPrompt: extractSystemPrompt(messages),
      userPrompt: extractUserPrompt(messages),
      model: config.model,
      maxTokens: maxOutputTokens,
      temperature,
      stream: true,
      onToken: (token) => {
        lastTokenAt = Date.now();
        fullText += token;
        onToken(token);
      },
    });
    if (!fullText && typeof result?.content === "string") {
      fullText = result.content;
    }
    return fullText;
  } catch (error) {
    if (stalledOut) {
      const stalled = new Error("Output generation stalled. The partial output above is shown. You can copy what was received, or try again.");
      stalled.code = "ERR-04";
      throw stalled;
    }
    throw error;
  } finally {
    clearInterval(stallWatch);
  }
};

const sanitizeMode = (value) => (String(value).toLowerCase() === "prd" ? "prd" : "roadmap");

const normalizeMacros = (input) => ({
  upweightSection: input?.upweightSection ?? input?.upweightApp ?? null,
  p0FocusOnly: Boolean(input?.p0FocusOnly ?? input?.p0Only),
  excludeBelowN: input?.excludeBelowN ?? input?.excludeLowSignalBelow ?? null,
  emphasiseQuotes: Boolean(input?.emphasiseQuotes ?? input?.emphasizeMarketingQuotes),
});

const redactPrivateKudos = (text, privatePool, log) => {
  let next = text;
  let redactions = 0;
  for (const k of privatePool) {
    const value = String(k.text ?? "").trim();
    if (!value) continue;
    if (next.includes(value)) {
      next = next.split(value).join("[REDACTED_PRIVATE_KUDOS]");
      redactions += 1;
    }
  }
  if (redactions > 0 && typeof log === "function") {
    log(`[synthesis] private kudos redaction applied ${redactions} time(s)`);
  }
  return { text: next, redactions };
};

const macrosHeaderLine = (macros) => {
  const active = [];
  if (macros.upweightSection) active.push(`Upweight: ${macros.upweightSection}`);
  if (macros.p0FocusOnly) active.push("P0 focus only");
  if (macros.excludeBelowN != null) active.push(`Exclude<${macros.excludeBelowN}`);
  if (macros.emphasiseQuotes) active.push("Emphasise quotes");
  return `Generated: ${new Date().toLocaleTimeString()} · Macros active: ${active.length ? active.join(", ") : "None"}`;
};

const ensureRoadmapDisclaimer = (text) => {
  const line = "All items above are prototype recommendations derived from event feedback. No production commitments are implied.";
  if (text.includes(line)) return text;
  return `${text.trim()}\n\n${line}`;
};

const localFallbackMarkdown = (mode, aggregates) => {
  const top = aggregates.topFeatureRequests.slice(0, 2);
  if (mode === "roadmap") {
    return [
      "## P0 — Build Tonight",
      ...(top.length ? top.map((item, index) => `${index + 1}. ${item.text}`) : ["1. No clear P0 signal yet."]),
      "",
      "## Patterns & Insights",
      "1. Generated via fallback synthesis due to unavailable external model provider.",
    ].join("\n");
  }
  return [
    "## Overview",
    "Fallback synthesis output was generated locally because no AI provider key was configured.",
    "",
    "## Scope — Tonight's Build",
    ...(top.length ? top.map((item, index) => `${index + 1}. ${item.text}`) : ["1. No clear P0 signal yet."]),
  ].join("\n");
};

const buildDeterministicPhase1Fallback = ({ aggregates, quoteSets, conflicts, macros, featureThemeLimit }) => {
  const topFallbackFeatures = aggregates.topFeatureRequests.slice(0, Math.max(6, featureThemeLimit ?? 5));
  return {
    p0Items: topFallbackFeatures.slice(0, 2).map((item) => ({
      title: item.text,
      why: "Derived from highest composite score",
      evidenceSources: ["feature_requests"],
      rolesAffected: null,
      effortEstimate: "medium",
      conflictLevel: "low",
      signalCount: item.voteCount,
      screenNames: [],
    })),
    p1Items: topFallbackFeatures.slice(2, 6).map((item) => ({
      title: item.text,
      why: "Lower composite score",
      evidenceSources: ["feature_requests"],
      rolesAffected: null,
      effortEstimate: "medium",
      conflictLevel: "low",
      signalCount: item.voteCount,
      screenNames: [],
    })),
    p2Themes: [],
    crossCuttingInsights: [],
    selectedQuotes: quoteSets.publicSafe.slice(0, macros.emphasiseQuotes ? 6 : 3).map((k) => ({ text: k.text, role: k.roleLabel ?? null })),
    competingPerspectives: conflicts.slice(0, 3).map((c) => ({
      screenName: c.screenName,
      conflictLevel: "high",
      positiveCount: c.positiveCount,
      negativeCount: c.negativeCount,
      recommendation: "Address highest-volume pain while preserving positive path",
    })),
    macroApplicationLog: ["Fallback mode: phase 1 output normalization was applied."],
  };
};

export const runSynthesis = async ({ requestBody, signals, sendEvent, config, log }) => {
  const outputMode = sanitizeMode(requestBody?.outputMode ?? requestBody?.mode);
  const macros = normalizeMacros(requestBody?.macros ?? {});

  if ((signals.featureRequests?.length ?? 0) + (signals.screenFeedback?.length ?? 0) + (signals.kudos?.length ?? 0) === 0) {
    const err = new Error("No signals have been collected yet. Synthesis requires at least one submission.");
    err.code = "ERR-05";
    throw err;
  }

  validateMacros(macros);

  const filtered = applyExclusionFilter(signals, macros);
  const weighted = applyUpweighting(filtered, macros, config);
  const conflicts = detectCompetingPerspectives(weighted.screenFeedback, config);
  const aggregates = computeAggregates(weighted, signals.cardSortResults ?? []);
  const quoteSets = partitionKudos(signals.kudos, macros);

  const excludedInfo = {
    count: filtered.excluded?.length ?? 0,
    screenCount: filtered.excludedScreenCount ?? 0,
  };

  const featureThemeSummary = aggregateFeatureRequestThemes(
    aggregates.topFeatureRequests.slice(0, config.FEATURE_REQUEST_TOP_N),
    Math.max(1, config.FEATURE_THEME_LIMIT),
  );
  const screenSummary = aggregateScreenFeedback(weighted.screenFeedback, config);
  const compactPayload = buildCompactSynthesisPayload({
    aggregates,
    macros,
    excludedInfo,
    featureThemes: featureThemeSummary,
    screenSummary,
    conflicts,
    quoteSets,
  });
  const compactPayloadText = JSON.stringify(compactPayload);
  const thresholdTokens = Math.floor(config.CONTEXT_WINDOW_TOKENS * ((100 - config.TOKEN_LIMIT_HEADROOM_PCT) / 100));
  const compactPayloadTokenEstimate = estimateTokens(compactPayloadText);
  if (typeof log === "function") {
    log(
      `[synthesis] phase1 payload stats rawComments=${screenSummary.totalRawComments} screensIncluded=${screenSummary.screensIncluded} themes=${screenSummary.aggregatedThemeCount} approxTokens=${compactPayloadTokenEstimate}`,
    );
    log(
      `[synthesis] feature theme grouping pre=${featureThemeSummary.preGroupCount} post=${featureThemeSummary.postGroupCount}`,
    );
  }
  if (compactPayloadTokenEstimate > thresholdTokens && typeof log === "function") {
    log(`[synthesis] phase1 payload exceeds threshold (${compactPayloadTokenEstimate} > ${thresholdTokens})`);
  }

  if (weighted.upweightWarning) {
    sendEvent({ type: "warning", code: "ERR-06", message: weighted.upweightWarning });
  }

  sendEvent({
    type: "phase1_started",
    summary: {
      totalFeatureVotes: aggregates.totalFeatureVotes,
      totalScreenFeedback: aggregates.totalScreenFeedback,
      totalKudos: aggregates.totalKudos,
      totalCardSortResponses: aggregates.totalCardSortResponses,
    },
  });
  sendEvent({
    type: "provider_call",
    phase: "phase1",
    provider: config.provider ?? "none",
    model: config.model,
    endpoint: toProviderEndpoint(config.provider, config.baseURL, false),
    maxTokens: config.PHASE1_MAX_TOKENS,
    temperature: config.PHASE1_TEMPERATURE,
  });

  const phase1Input = [{ role: "user", content: [{ type: "input_text", text: compactPayloadText }] }];
  const phase1Instructions = `${SYNTHESIS_INSTRUCTIONS}\n\nReturn only structured analysis JSON using the declared schema.`;
  if (config.debugPrompt) {
    const messagesPhase1 = [
      { role: "system", content: `${SYNTHESIS_INSTRUCTIONS}\n\nReturn valid JSON only using this structure.` },
      { role: "user", content: compactPayloadText },
    ];
    sendEvent({
      type: "debug_prompt",
      phase: "phase1",
      provider: config.provider ?? "openai",
      payload: {
        endpoint: toProviderEndpoint(config.provider, config.baseURL, false),
        readableMessages: toDebugTextMessages(messagesPhase1),
        body: {
          model: config.model,
          systemPrompt: extractSystemPrompt(messagesPhase1, phase1Instructions),
          userPrompt: extractUserPrompt(messagesPhase1, phase1Input),
          temperature: config.PHASE1_TEMPERATURE,
          maxTokens: config.PHASE1_MAX_TOKENS,
        },
      },
    });
  }

  let phase1Analysis;
  if (!config.provider) {
    if (!config.enableLocalFallback) {
      const err = new Error("No configured AI provider key is available. Set SYNTHESIS_API_PROVIDER and matching OPENAI_API_KEY or ANTHROPIC_API_KEY.");
      err.code = "ERR-02";
      throw err;
    }
    phase1Analysis = buildDeterministicPhase1Fallback({
      aggregates,
      quoteSets,
      conflicts,
      macros,
      featureThemeLimit: config.FEATURE_THEME_LIMIT,
    });
    phase1Analysis.macroApplicationLog = ["Fallback mode: no provider configured."];
  } else {
    let phase1Result;
    try {
      phase1Result = await withTimeout(
        createText({
          config,
          messages: [
            { role: "system", content: `${SYNTHESIS_INSTRUCTIONS}\n\nReturn valid JSON only.` },
            { role: "user", content: compactPayloadText },
          ],
          instructions: phase1Instructions,
          input: phase1Input,
          temperature: config.PHASE1_TEMPERATURE,
          maxOutputTokens: config.PHASE1_MAX_TOKENS,
        }),
        config.PHASE1_TIMEOUT_MS,
        "ERR-02",
        `Analysis timed out. The API did not respond within ${Math.round(Number(config.PHASE1_TIMEOUT_MS) / 1000)} seconds. Your data is safe — try again, or export the raw data for manual analysis.`,
      );
    } catch (error) {
      if (!error.code) error.code = "ERR-02";
      throw error;
    }

    try {
      const parsed = typeof phase1Result === "string" ? parseJsonPayloadFromText(phase1Result) : phase1Result;
      phase1Analysis = ensurePhase1Shape(parsed);
    } catch (error) {
      if (typeof log === "function") {
        log(`[synthesis] phase1 normalization failed; falling back to deterministic synthesis: ${error instanceof Error ? error.message : String(error)}`);
      }
      sendEvent({
        type: "warning",
        code: "ERR-03",
        message: "Analysis returned an unexpected format. Applied deterministic fallback analysis.",
      });
      phase1Analysis = buildDeterministicPhase1Fallback({
        aggregates,
        quoteSets,
        conflicts,
        macros,
        featureThemeLimit: config.FEATURE_THEME_LIMIT,
      });
    }
  }

  sendEvent({
    type: "phase1_completed",
    macroApplicationLog: phase1Analysis.macroApplicationLog,
    phase1AnalysisSummary: {
      p0: phase1Analysis.p0Items.length,
      p1: phase1Analysis.p1Items.length,
      p2: phase1Analysis.p2Themes.length,
    },
    phase1Analysis: {
      p0Items: phase1Analysis.p0Items,
    },
  });

  sendEvent({ type: "phase2_started", outputMode });
  sendEvent({
    type: "provider_call",
    phase: "phase2",
    provider: config.provider ?? "none",
    model: config.model,
    endpoint: toProviderEndpoint(config.provider, config.baseURL, true),
    maxTokens: outputMode === "prd" ? config.PHASE2_MAX_TOKENS_PRD : config.PHASE2_MAX_TOKENS_ROADMAP,
    temperature: config.PHASE2_TEMPERATURE,
  });

  const phase2EditorialSummary = buildPhase2EditorialSummary(phase1Analysis, macros);
  const phase2Prompt = buildPhase2Prompt(outputMode, phase2EditorialSummary, macros);
  const phase2InputTokenEstimate = estimateTokens(phase2Prompt);
  if (typeof log === "function") {
    log(`[synthesis] phase2 input stats approxTokens=${phase2InputTokenEstimate} priorityItems=${phase2EditorialSummary.priorityItems.length} themes=${phase2EditorialSummary.themes.length}`);
  }
  const messagesPhase2 = [
    { role: "system", content: SYNTHESIS_INSTRUCTIONS },
    { role: "user", content: phase2Prompt },
  ];
  if (config.debugPrompt) {
    sendEvent({
      type: "debug_prompt",
      phase: "phase2",
      provider: config.provider ?? "openai",
      payload: {
        endpoint: toProviderEndpoint(config.provider, config.baseURL, true),
        readableMessages: toDebugTextMessages(messagesPhase2),
        body: {
          model: config.model,
          stream: true,
          systemPrompt: extractSystemPrompt(messagesPhase2),
          userPrompt: extractUserPrompt(messagesPhase2),
          temperature: config.PHASE2_TEMPERATURE,
          maxTokens: outputMode === "prd" ? config.PHASE2_MAX_TOKENS_PRD : config.PHASE2_MAX_TOKENS_ROADMAP,
        },
      },
    });
  }

  let streamedText = "";
  if (!config.provider && config.enableLocalFallback) {
    streamedText = localFallbackMarkdown(outputMode, aggregates);
    for (const token of streamedText.split(" ")) {
      const value = `${token} `;
      sendEvent({ type: "phase2_token", token: value });
    }
  } else {
    streamedText = await streamProviderText({
      config,
      messages: messagesPhase2,
      temperature: config.PHASE2_TEMPERATURE,
      maxOutputTokens: outputMode === "prd" ? config.PHASE2_MAX_TOKENS_PRD : config.PHASE2_MAX_TOKENS_ROADMAP,
      onToken: (token) => sendEvent({ type: "phase2_token", token }),
      onWarning: (message) => sendEvent({ type: "warning", code: "ERR-04", message }),
    });
  }

  let finalText = streamedText;
  if (outputMode === "roadmap") {
    finalText = ensureRoadmapDisclaimer(finalText);
  }
  const redaction = redactPrivateKudos(finalText, quoteSets.privatePool, log);
  finalText = redaction.text;
  finalText = `${macrosHeaderLine(macros)}\n\n${finalText}`;

  sendEvent({
    type: "done",
    outputMode,
    generatedAt: new Date().toISOString(),
    finalOutput: finalText,
    redactions: redaction.redactions,
  });
};

export const toSynthesisSignals = ({ featureRequests, screenFeedback, kudos, cardSortResults }) => {
  return {
    featureRequests: (featureRequests ?? []).map((item) => ({
      id: String(item.id ?? ""),
      text: cleanFeedbackText(String(item.title ?? item.text ?? "").trim()),
      workflowContext: item.workflowContext ?? null,
      impactScore: item.impactScore ?? null,
      voteCount: Math.max(0, Number(item.votes ?? item.voteCount ?? 0)),
      origin: item.origin === "mobile" ? "mobile" : "kiosk",
      sessionRole: normalizeRole(item.sessionRole ?? item.role),
    })),
    screenFeedback: (screenFeedback ?? []).map((item) => ({
      id: String(item.id ?? ""),
      appSection: String(item.appSection ?? item.appLabel ?? item.app ?? "Unspecified"),
      screenName: String(item.screenName ?? "").trim(),
      typeTag: toTypeTag(item.typeTag ?? item.type),
      freetext: cleanFeedbackText(item.freetext ?? item.text ?? null),
      followUpResponse: item.followUpResponse ?? null,
      origin: item.origin === "mobile" ? "mobile" : "kiosk",
      sessionRole: normalizeRole(item.sessionRole ?? item.role),
    })),
    kudos: (kudos ?? []).map((item) => ({
      id: String(item.id ?? ""),
      text: cleanFeedbackText(String(item.text ?? "")),
      roleLabel: normalizeRole(item.roleLabel ?? item.role),
      isPublicSafe: Boolean(item.isPublicSafe ?? item.consentPublic),
    })),
    cardSortResults: (cardSortResults ?? []).map((item) => ({
      conceptTitle: String(item.conceptTitle ?? item.title ?? ""),
      reaction: item.reaction ?? "useful",
      tier: item.tier ?? null,
      sessionRole: normalizeRole(item.sessionRole ?? item.role),
    })),
  };
};
