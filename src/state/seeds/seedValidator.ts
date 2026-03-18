import type { AppArea, AppScreen, CardSortConcept, FeatureRequest, KudosQuote, ScreenFeedback } from "../../types/domain";

type SeedRecord = Record<string, unknown>;

const isObject = (value: unknown): value is SeedRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const ensureArray = (value: unknown, name: string): SeedRecord[] => {
  if (!Array.isArray(value)) {
    throw new Error(`[seed-validator] ${name} must be an array`);
  }
  return value.map((item, index) => {
    if (!isObject(item)) {
      throw new Error(`[seed-validator] ${name}[${index}] must be an object`);
    }
    return item;
  });
};

const hasString = (row: SeedRecord, key: string): boolean => typeof row[key] === "string" && String(row[key]).trim().length > 0;
const ASSET_PATH_PATTERN = /^[a-z0-9-_/]+\/\d{2}-[a-z0-9-]+\.(png|jpg)$/i;

const validateRequiredStringKeys = (rows: SeedRecord[], name: string, keys: string[]): void => {
  rows.forEach((row, index) => {
    keys.forEach((key) => {
      if (!hasString(row, key)) {
        throw new Error(`[seed-validator] ${name}[${index}] is missing required string key "${key}"`);
      }
    });
  });
};

export const validateAppAreasSeed = (raw: unknown): Array<{ id: AppArea; label: string; dark?: boolean }> => {
  const rows = ensureArray(raw, "appAreas.seed.json");
  validateRequiredStringKeys(rows, "appAreas.seed.json", ["id", "label"]);
  return rows as Array<{ id: AppArea; label: string; dark?: boolean }>;
};

export const validateProductsSeedRows = (raw: unknown): SeedRecord[] => {
  const rows = ensureArray(raw, "products.seed.json");
  validateRequiredStringKeys(rows, "products.seed.json", ["id", "category", "subcategory", "name"]);
  return rows;
};

export const validateInstitutionProfilesSeedRows = (raw: unknown): SeedRecord[] => {
  const rows = ensureArray(raw, "institutionProfiles.seed.json");
  validateRequiredStringKeys(rows, "institutionProfiles.seed.json", ["id", "institution_name"]);
  return rows;
};

export const validateCategoriesSeedRows = (raw: unknown): SeedRecord[] => {
  const rows = ensureArray(raw, "categories.seed.json");
  validateRequiredStringKeys(rows, "categories.seed.json", ["id", "category"]);
  return rows;
};

export const validateSubcategoriesSeedRows = (raw: unknown): SeedRecord[] => {
  const rows = ensureArray(raw, "subcategories.seed.json");
  validateRequiredStringKeys(rows, "subcategories.seed.json", ["id", "category_id", "subcategory"]);
  return rows;
};

export const validateProductFeatureCategoriesSeedRows = (raw: unknown): SeedRecord[] => {
  const rows = ensureArray(raw, "productFeatureCategories.seed.json");
  validateRequiredStringKeys(rows, "productFeatureCategories.seed.json", ["id", "category"]);
  return rows;
};

export const validateProductFeaturesSeedRows = (raw: unknown): SeedRecord[] => {
  const rows = ensureArray(raw, "productFeatures.seed.json");
  validateRequiredStringKeys(rows, "productFeatures.seed.json", ["id", "product_id", "feature_category_id", "name"]);
  return rows;
};

export const validateScreenLibrarySeed = (raw: unknown): AppScreen[] => {
  const rows = ensureArray(raw, "screenLibrary.seed.json");
  validateRequiredStringKeys(rows, "screenLibrary.seed.json", [
    "id",
    "app",
    "name",
    "wireframeLabel",
    "description",
    "thumbnailAssetPath",
  ]);

  rows.forEach((row, index) => {
    const assets = row.assets;
    if (!Array.isArray(assets)) {
      throw new Error(`[seed-validator] screenLibrary.seed.json[${index}] must include assets as an array`);
    }
    if (assets.length > 20) {
      // eslint-disable-next-line no-console
      console.warn(`[seed-validator] screenLibrary.seed.json[${index}] assets length ${assets.length} exceeds max 20`);
    }
    assets.forEach((asset, assetIndex) => {
      if (typeof asset !== "string") {
        // eslint-disable-next-line no-console
        console.warn(`[seed-validator] screenLibrary.seed.json[${index}].assets[${assetIndex}] must be a string path`);
        return;
      }
      const trimmed = asset.trim();
      const filename = trimmed.split("/").pop() ?? "";
      if (filename.length > 64) {
        // eslint-disable-next-line no-console
        console.warn(`[seed-validator] screenLibrary.seed.json[${index}] asset filename exceeds 64 chars: ${filename}`);
      }
      if (!ASSET_PATH_PATTERN.test(trimmed)) {
        // eslint-disable-next-line no-console
        console.warn(`[seed-validator] screenLibrary.seed.json[${index}] asset path does not match naming convention: ${trimmed}`);
      }
    });
  });

  return rows as unknown as AppScreen[];
};

export const validateCardSortConceptsSeed = (raw: unknown): CardSortConcept[] => {
  const rows = ensureArray(raw, "cardSortConcepts.seed.json");
  validateRequiredStringKeys(rows, "cardSortConcepts.seed.json", ["id", "title", "description"]);
  return rows as unknown as CardSortConcept[];
};

export const validateFeatureRequestsSeed = (raw: unknown): FeatureRequest[] => {
  const rows = ensureArray(raw, "featureRequests.seed.json");
  validateRequiredStringKeys(rows, "featureRequests.seed.json", ["id", "title", "createdAt"]);
  return rows as unknown as FeatureRequest[];
};

export const validateKudosSeed = (raw: unknown): KudosQuote[] => {
  const rows = ensureArray(raw, "kudos.seed.json");
  validateRequiredStringKeys(rows, "kudos.seed.json", ["id", "text", "createdAt"]);
  return rows as unknown as KudosQuote[];
};

export const validateScreenFeedbackSeed = (raw: unknown): ScreenFeedback[] => {
  const rows = ensureArray(raw, "screenFeedback.seed.json");
  validateRequiredStringKeys(rows, "screenFeedback.seed.json", ["id", "app", "screenName", "type", "createdAt"]);
  return rows as unknown as ScreenFeedback[];
};
