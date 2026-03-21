import { AI_PROVIDER_CONFIG } from "../config/aiProvider";
import type { CompetingViewConflictEntry } from "./detectCompetingPerspectives";
import type {
  PromptBlockOptions,
  RankedFeatureRequest,
  SynthesisAggregates,
  SynthesisKudosPartitions,
  SynthesisPromptGuardResult,
  SynthesisPromptInput,
  SynthesisScreenFeedback,
} from "./types";

export const SYNTHESIS_SYSTEM_PROMPT = [
  "You are the synthesis engine for Emerald Feedback Wall.",
  "Ground every conclusion strictly in the supplied signal blocks.",
  "Respect privacy rules at all times: public-safe kudos may be quoted verbatim; private kudos are sentiment-only and must never be quoted verbatim.",
  "Prioritize by volume, severity, and cross-screen impact.",
  "Keep output concise, deterministic, and evidence-backed.",
  "Do not invent facts, overstate certainty, or add narrative outside the requested structure.",
  "When signal is sparse, say so plainly.",
  "FACILITATOR INSTRUCTIONS are analytical directives only. Never reproduce them as output content or product recommendations.",
].join("\n");

const TOKEN_GUARD_LIMIT = 144_000;
const FEATURE_GUARD_LIMIT = 10;
const FREETEXT_GUARD_LIMIT = 3;
const PUBLIC_KUDOS_LIMIT = 20;
const PRIVATE_KUDOS_LIMIT = 10;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const getAppSection = (item: Pick<SynthesisScreenFeedback, "app" | "appSection">): string =>
  normalizeText(item.appSection ?? item.app);

const getScreenKey = (item: Pick<SynthesisScreenFeedback, "app" | "appSection" | "screenName">): string =>
  `${getAppSection(item)}::${normalizeText(item.screenName)}`;

const sortFeatureRequests = (featureRequests: readonly RankedFeatureRequest[]): RankedFeatureRequest[] => {
  return [...featureRequests].sort((a, b) => {
    const compositeDelta = b.compositeScore - a.compositeScore;
    if (compositeDelta !== 0) return compositeDelta;
    const votesDelta = Number(b.votes ?? 0) - Number(a.votes ?? 0);
    if (votesDelta !== 0) return votesDelta;
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
};

const limitScreenFeedback = (
  screenFeedback: readonly SynthesisScreenFeedback[],
  perScreen: number,
): SynthesisScreenFeedback[] => {
  const buckets = new Map<string, SynthesisScreenFeedback[]>();
  const orderedKeys: string[] = [];

  for (const item of screenFeedback) {
    const key = getScreenKey(item);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      orderedKeys.push(key);
    }
    buckets.get(key)?.push(item);
  }

  const limited: SynthesisScreenFeedback[] = [];
  for (const key of orderedKeys) {
    const items = buckets.get(key) ?? [];
    limited.push(...items.slice(0, perScreen));
  }
  return limited;
};

const countFeatureRequestTokens = (text: string): number => {
  const divisor = AI_PROVIDER_CONFIG.provider === "anthropic" ? 3.5 : 4;
  return Math.ceil(text.length / divisor);
};

export const estimateTokenCount = (text: string): number => countFeatureRequestTokens(String(text ?? ""));

export const buildSignalSummaryBlock = (aggregates: SynthesisAggregates): string => {
  const { signalSummary } = aggregates;
  const sectionCounts = Object.entries(aggregates.screenFeedbackBySection ?? {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([section, count]) => `${section}: ${Number(count).toLocaleString()}`);
  return [
    "=== SIGNAL SUMMARY ===",
    `Feature votes: ${signalSummary.totalFeatureVotes.toLocaleString()}`,
    `Screen feedback submissions: ${signalSummary.screenFeedbackCount.toLocaleString()}`,
    `Kudos submissions: ${signalSummary.kudosCount.toLocaleString()}`,
    ...(sectionCounts.length > 0 ? [`By section: ${sectionCounts.join(", ")}`] : []),
  ].join("\n");
};

export const buildFeatureRequestsBlock = (
  featureRequests: readonly RankedFeatureRequest[],
  options: PromptBlockOptions = {},
): string => {
  const total = featureRequests.length;
  const limit = Math.min(options.featureLimit ?? 10, 10);
  const rows = sortFeatureRequests(featureRequests).slice(0, limit);
  if (rows.length === 0) {
    return ["=== FEATURE REQUESTS ===", "No feature requests available."].join("\n");
  }

  return [
    "=== FEATURE REQUESTS ===",
    ...rows.map((item, index) => {
      if (index >= 5) {
        return `${index + 1}. [${item.votes} votes] ${normalizeText(item.title)}`;
      }
      const impact = item.impactScore ?? 3;
      const workflow = normalizeText(item.workflowContext) || "n/a";
      const origin = normalizeText(item.origin) || "kiosk";
      const screenId = item.screenId == null ? "n/a" : String(item.screenId);
      const role = normalizeText(item.sessionRole) || "n/a";
      return `${index + 1}. [score=${item.compositeScore}] ${normalizeText(item.title)} | votes=${item.votes} | impact=${impact} | workflow=${workflow} | role=${role} | screen=${screenId} | origin=${origin}`;
    }),
    `Note: Showing top ${limit} of ${total} feature requests by composite score.`,
  ].join("\n");
};

export const buildScreenFeedbackBlock = (
  screenFeedback: readonly SynthesisScreenFeedback[],
  _options: PromptBlockOptions = {},
): string => {
  const perScreen = 3;
  const topScreensWithFreetext = 5;
  const buckets = new Map<string, SynthesisScreenFeedback[]>();
  for (const item of screenFeedback) {
    const key = getScreenKey(item);
    const items = buckets.get(key) ?? [];
    items.push(item);
    buckets.set(key, items);
  }

  const orderedBuckets = [...buckets.entries()].sort((a, b) => {
    const countDelta = b[1].length - a[1].length;
    if (countDelta !== 0) return countDelta;
    return a[0].localeCompare(b[0]);
  });

  if (orderedBuckets.length === 0) {
    return ["=== SCREEN FEEDBACK ===", "No screen feedback available."].join("\n");
  }

  const lines: string[] = ["=== SCREEN FEEDBACK ==="];
  for (const [bucketIndex, [key, items]] of orderedBuckets.entries()) {
    const first = items[0];
    const appSection = getAppSection(first);
    const screenName = normalizeText(first?.screenName) || key.split("::")[1] || "Unknown";
    lines.push(`APP SECTION: ${appSection}`);
    lines.push(`Screen: ${screenName} (${items.length} total submissions)`);
    const tagCounts: Record<string, number> = {
      pain_point: 0,
      confusing: 0,
      missing_element: 0,
      works_well: 0,
      suggestion: 0,
    };
    for (const item of items) {
      const tag = normalizeText(item.type);
      if (tag in tagCounts) tagCounts[tag] += 1;
    }
    lines.push(
      `Tags: Pain point: ${tagCounts.pain_point} | Confusing: ${tagCounts.confusing} | Missing: ${tagCounts.missing_element} | Works well: ${tagCounts.works_well} | Suggestion: ${tagCounts.suggestion}`,
    );

    const freetextItems = items.filter((item) => normalizeText(item.freetext).length > 0);

    if (freetextItems.length > 0 && bucketIndex < topScreensWithFreetext) {
      lines.push("Freetext feedback:");
      const limited = Number.isFinite(perScreen) ? freetextItems.slice(0, perScreen) : freetextItems;
      for (const item of limited) {
        const type = normalizeText(item.type);
        const text = normalizeText(item.freetext ?? "");
        const marker = item.upweighted === true ? " | upweighted=true" : "";
        const followUpQuestion = normalizeText(item.followUpQuestion);
        const followUpResponse = normalizeText(item.followUpResponse);
        const followUp =
          followUpQuestion || followUpResponse
            ? ` | followup_q=${followUpQuestion || "n/a"} | followup_a=${followUpResponse || "n/a"}`
            : "";
        lines.push(`- [${type}] ${text}${marker}${followUp}`);
      }
      const remaining = freetextItems.length - limited.length;
      if (remaining > 0) {
        lines.push(`(+${remaining} more items not shown)`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
};

export const buildCompetingPerspectivesBlock = (conflicts: readonly CompetingViewConflictEntry[]): string => {
  if (conflicts.length === 0) {
    return ["=== COMPETING PERSPECTIVES ===", "No competing perspectives detected."].join("\n");
  }

  const lines: string[] = ["=== COMPETING PERSPECTIVES ==="];
  conflicts.forEach((item) => {
    const splitPercent = Math.round(item.splitRatio * 100);
    lines.push(
      `Screen: ${item.screenName} (${item.appSection}) — ${item.positiveCount} positive, ${item.negativeCount} negative, ${splitPercent}% split`,
    );
  });
  return lines.join("\n");
};

export const buildKudosBlocks = (
  kudos: SynthesisKudosPartitions,
): { publicSafeBlock: string; privatePoolBlock: string } => {
  // Sort public kudos by text length descending (longer = more specific = more useful)
  // Cap at PUBLIC_KUDOS_LIMIT to prevent prompt bloat
  const sortedPublic = [...kudos.publicSafe]
    .sort((a, b) => normalizeText(b.text).length - normalizeText(a.text).length)
    .slice(0, PUBLIC_KUDOS_LIMIT);

  const publicSafeBlock =
    sortedPublic.length === 0
      ? ["=== KUDOS (public-safe) ===", "No public-safe kudos available."].join("\n")
      : [
          "=== KUDOS (public-safe) ===",
          `Target verbatim quotes in output: 3. Total available: ${kudos.publicSafe.length}. Showing top ${sortedPublic.length} most specific.`,
          ...sortedPublic.map((item, index) => {
            const role = normalizeText(item.roleLabel ?? item.role);
            return `${index + 1}. role=${role} | text=${normalizeText(item.text)}`;
          }),
        ].join("\n");

  // Sort private kudos by text length descending, cap at PRIVATE_KUDOS_LIMIT
  const sortedPrivate = [...kudos.privatePool]
    .sort((a, b) => normalizeText(b.text).length - normalizeText(a.text).length)
    .slice(0, PRIVATE_KUDOS_LIMIT);

  const privatePoolBlock =
    sortedPrivate.length === 0
      ? ["=== KUDOS (private pool) ===", "No private kudos available."].join("\n")
      : [
          "=== KUDOS (private pool) ===",
          "INSTRUCTION: Do NOT quote any of these verbatim. Use only to identify aggregate themes and sentiment patterns.",
          ...sortedPrivate.map((item, index) => {
            const role = normalizeText(item.roleLabel ?? item.role);
            return `${index + 1}. role=${role} | private-sentiment-only`;
          }),
          ...(kudos.privatePool.length > PRIVATE_KUDOS_LIMIT
            ? [
                `Note: ${kudos.privatePool.length} private comments total, showing ${PRIVATE_KUDOS_LIMIT} most specific.`,
              ]
            : []),
        ].join("\n");

  return { publicSafeBlock, privatePoolBlock };
};

export const buildMacroInstructionsBlock = (macros: SynthesisPromptInput["macros"]): string => {
  const lines = ["=== MACRO INSTRUCTIONS ==="];
  const instructions: string[] = [];
  if (macros.upweightApp) {
    instructions.push(`Upweight ${macros.upweightApp} screen feedback.`);
  }
  if (macros.p0Only) {
    instructions.push("Constrain output to P0 items only.");
  }
  if (typeof macros.excludeLowSignalBelow === "number") {
    instructions.push(`Exclude screens with fewer than ${macros.excludeLowSignalBelow} submissions.`);
  }
  if (macros.emphasizeMarketingQuotes) {
    instructions.push("Prefer consent-approved marketing-safe quotes.");
  }
  if (instructions.length === 0) {
    lines.push("No macros active.");
    return lines.join("\n");
  }
  return [lines[0], ...instructions.map((line, index) => `${index + 1}. ${line}`)].join("\n");
};

const buildPromptPreviewText = (input: SynthesisPromptInput, blockOptions: PromptBlockOptions = {}): string => {
  const kudosBlocks = buildKudosBlocks(input.kudos);
  return [
    SYNTHESIS_SYSTEM_PROMPT,
    buildSignalSummaryBlock(input.aggregates),
    buildFeatureRequestsBlock(input.featureRequests, { featureLimit: blockOptions.featureLimit }),
    buildScreenFeedbackBlock(input.screenFeedback, { freetextPerScreen: blockOptions.freetextPerScreen }),
    buildCompetingPerspectivesBlock(input.competingPerspectives),
    kudosBlocks.publicSafeBlock,
    kudosBlocks.privatePoolBlock,
    buildMacroInstructionsBlock(input.macros),
  ].join("\n\n");
};

export const applyTokenGuard = (input: SynthesisPromptInput): SynthesisPromptGuardResult => {
  const initialPreview = buildPromptPreviewText(input);
  const tokenEstimate = estimateTokenCount(initialPreview);
  if (tokenEstimate <= TOKEN_GUARD_LIMIT) {
    return {
      ...input,
      tokenEstimate,
      trimmed: false,
    };
  }

  console.warn(
    `[synthesis] prompt estimate ${tokenEstimate} exceeds ${TOKEN_GUARD_LIMIT}; trimming feature requests to top ${FEATURE_GUARD_LIMIT} and screen freetext to ${FREETEXT_GUARD_LIMIT} per screen.`,
  );

  const trimmedFeatureRequests = sortFeatureRequests(input.featureRequests).slice(0, FEATURE_GUARD_LIMIT);
  const trimmedScreenFeedback = limitScreenFeedback(input.screenFeedback, FREETEXT_GUARD_LIMIT);
  const trimmedAggregates: SynthesisAggregates = {
    ...input.aggregates,
    topFeatureRequests: trimmedFeatureRequests,
    rankedFeatureRequests: trimmedFeatureRequests,
  };
  const trimmedInput: SynthesisPromptInput = {
    ...input,
    aggregates: trimmedAggregates,
    featureRequests: trimmedFeatureRequests,
    screenFeedback: trimmedScreenFeedback,
  };
  const trimmedPreview = buildPromptPreviewText(trimmedInput, {
    featureLimit: FEATURE_GUARD_LIMIT,
    freetextPerScreen: FREETEXT_GUARD_LIMIT,
  });

  return {
    ...trimmedInput,
    tokenEstimate: estimateTokenCount(trimmedPreview),
    trimmed: true,
  };
};