import type { SeedTableDefinition } from "./adminSeedData";
import { ADMIN_SEED_TABLES } from "./adminSeedData";
import { APP_AREAS } from "./seedData";
import type { BootstrapResponse } from "../services/dataApi";
import type {
  AppArea,
  AppScreen,
  CardSortConcept,
  FeatureRequest,
  KudosQuote,
  ScreenFeedback,
  ProductDefinition,
} from "../types/domain";

export interface WallSeedSnapshot {
  featureRequests: FeatureRequest[];
  kudosQuotes: KudosQuote[];
  screenFeedback: ScreenFeedback[];
  products: ProductDefinition[];
  screens: AppScreen[];
  cardSortConcepts: CardSortConcept[];
  adminTables: SeedTableDefinition[];
  selectedScreenId: number;
}

export const nowIso = (): string => new Date().toISOString();

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const stripLegacyDuplicateSuffix = (value: string | undefined): string =>
  (value ?? "").replace(/\s*\[\d+\]\s*$/u, "").trim();

export const normalizeTextKey = (value: string | undefined): string =>
  stripLegacyDuplicateSuffix(value).toLowerCase();

const dedupeByText = <T,>(items: T[], getText: (item: T) => string | undefined): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = normalizeTextKey(getText(item));
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

export const dedupeSnapshot = (snapshot: WallSeedSnapshot): WallSeedSnapshot => ({
  ...snapshot,
  featureRequests: dedupeByText(
    snapshot.featureRequests.map((item) => ({ ...item, title: stripLegacyDuplicateSuffix(item.title) })),
    (item) => item.title,
  ),
  kudosQuotes: dedupeByText(
    snapshot.kudosQuotes.map((item) => ({ ...item, text: stripLegacyDuplicateSuffix(item.text) })),
    (item) => item.text,
  ),
  screenFeedback: dedupeByText(
    snapshot.screenFeedback.map((item) => ({ ...item, text: stripLegacyDuplicateSuffix(item.text) })),
    (item) => item.text ?? `__id:${item.id}`,
  ),
});

export const pTierByRank = (index: number): "P0" | "P1" | "P2" => {
  if (index < 2) return "P0";
  if (index < 5) return "P1";
  return "P2";
};

const toNumericId = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export const toAppAreaValue = (value: unknown): AppArea => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "digital-experience" ||
    normalized === "origination" ||
    normalized === "credit-risk" ||
    normalized === "servicing" ||
    normalized === "monitoring-controls" ||
    normalized === "syndication-complex-lending" ||
    normalized === "analytics-inquiry" ||
    normalized === "platform-services"
  ) {
    return normalized;
  }
  if (normalized === "digital experience") return "digital-experience";
  if (normalized === "credit & risk" || normalized === "customer risk & credit") return "credit-risk";
  if (normalized === "monitoring & controls") return "monitoring-controls";
  if (normalized === "syndication / complex lending" || normalized === "syndication") return "syndication-complex-lending";
  if (normalized === "analytics & inquiry") return "analytics-inquiry";
  if (normalized === "platform services") return "platform-services";
  return "servicing";
};

const APP_AREA_LABEL_BY_ID: Record<AppArea, string> = Object.fromEntries(
  APP_AREAS.map((area) => [area.id, area.label]),
) as Record<AppArea, string>;

export const mapBootstrapToSnapshot = (bootstrap: BootstrapResponse): WallSeedSnapshot => ({
  featureRequests: bootstrap.featureRequests.map((item) => ({
    id: toNumericId(item.id) ?? item.id,
    productId: toNumericId(item.productId),
    featureId: toNumericId(item.featureId),
    screenId: toNumericId(item.screenId) ?? item.screenId,
    title: String(item.title ?? ""),
    description: item.description == null ? undefined : String(item.description),
    workflowContext: item.workflowContext == null ? undefined : String(item.workflowContext),
    impactScore:
      item.impactScore == null
        ? null
        : clamp(Number(item.impactScore), 1, 5) as 1 | 2 | 3 | 4 | 5,
    sessionRole: item.sessionRole == null ? null : item.sessionRole,
    status: item.status == null ? undefined : String(item.status),
    votes: Number(item.votes ?? 0),
    createdAt: String(item.createdAt ?? nowIso()),
    legacyRequestCode: item.legacyRequestCode == null ? undefined : String(item.legacyRequestCode),
    origin: item.origin === "mobile" ? "mobile" : "kiosk",
  })),
  kudosQuotes: bootstrap.kudosQuotes.map((item) => ({
    id: toNumericId(item.id) ?? item.id,
    productId: toNumericId(item.productId),
    featureId: toNumericId(item.featureId),
    screenId: toNumericId(item.screenId) ?? item.screenId,
    text: String(item.text ?? ""),
    role: item.role ?? "unspecified",
    roleLabel: item.roleLabel == null ? null : item.roleLabel,
    consentPublic: Boolean(item.consentPublic),
    isPublicSafe: Boolean(item.isPublicSafe ?? item.consentPublic),
    createdAt: String(item.createdAt ?? nowIso()),
  })),
  screenFeedback: bootstrap.screenFeedback.map((item) => ({
    ...item,
    id: toNumericId(item.id) ?? item.id,
    productId: toNumericId(item.productId),
    featureId: toNumericId(item.featureId),
    screenId: toNumericId(item.screenId) ?? item.screenId,
    app: toAppAreaValue(item.app),
  })),
  products: bootstrap.products.map((item) => ({
    id: toNumericId(item.id) ?? item.id,
    legacyProductCode: item.legacyProductCode,
    category: item.category,
    subcategory: item.subcategory,
    name: item.name,
    app: "servicing",
    icon: "◉",
  })),
  screens: bootstrap.screens.map((screen) => ({
    id: toNumericId(screen.id) ?? screen.id,
    productId: toNumericId(screen.productId),
    legacyScreenCode: screen.legacyScreenCode,
    app: toAppAreaValue(screen.screenCategory),
    name: screen.name,
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: screen.description ?? "",
    categoryId: toAppAreaValue(screen.screenCategory),
    categoryLabel: APP_AREA_LABEL_BY_ID[toAppAreaValue(screen.screenCategory)] ?? "Servicing",
    thumbnailAssetPath: typeof screen.thumbnailAssetPath === "string" ? screen.thumbnailAssetPath : undefined,
    assets: Array.isArray(screen.assets)
      ? screen.assets.filter((asset): asset is string => typeof asset === "string" && asset.trim().length > 0)
      : [],
  })),
  cardSortConcepts: bootstrap.cardSortConcepts,
  adminTables: bootstrap.adminTables.length > 0 ? bootstrap.adminTables : ADMIN_SEED_TABLES,
  selectedScreenId: Number(bootstrap.screens[0]?.id ?? 0),
});
