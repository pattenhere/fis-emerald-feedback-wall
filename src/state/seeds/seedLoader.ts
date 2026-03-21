import type { AppScreen, CardSortConcept, FeatureRequest, KudosQuote, ProductDefinition, ScreenFeedback } from "../../types/domain.js";
import {
  validateAppAreasSeed,
  validateCategoriesSeedRows,
  validateCardSortConceptsSeed,
  validateFeatureRequestsSeed,
  validateInstitutionProfilesSeedRows,
  validateKudosSeed,
  validateProductFeatureCategoriesSeedRows,
  validateProductFeaturesSeedRows,
  validateProductsSeedRows,
  validateScreenFeedbackSeed,
  validateScreenLibrarySeed,
  validateSubcategoriesSeedRows,
} from "./seedValidator.js";

type SeedRow = Record<string, unknown>;
type JsonModuleMap = Record<string, unknown>;
// @ts-ignore Vercel can run an additional TS pass that misses Vite's ImportMeta typing.
const seedModules = import.meta.glob("./*.seed.json", {
  eager: true,
  import: "default",
}) as JsonModuleMap;

const getSeed = (filename: string): unknown => seedModules[`./${filename}`];

const appAreasRaw = getSeed("appAreas.seed.json");
const cardSortConceptsRaw = getSeed("cardSortConcepts.seed.json");
const categoriesRaw = getSeed("categories.seed.json");
const institutionProfilesRaw = getSeed("institutionProfiles.seed.json");
const productFeatureCategoriesRaw = getSeed("productFeatureCategories.seed.json");
const productFeaturesRaw = getSeed("productFeatures.seed.json");
const productsRaw = getSeed("products.seed.json");
const screenLibraryRaw = getSeed("screenLibrary.seed.json");
const subcategoriesRaw = getSeed("subcategories.seed.json");

const productsRows = validateProductsSeedRows(productsRaw);
const productDefinitions = productsRows.map((row): ProductDefinition => ({
  id: String(row.id),
  category: String(row.category),
  subcategory: String(row.subcategory),
  name: String(row.name),
  app: String(row.app ?? "servicing") as ProductDefinition["app"],
  icon: String(row.icon ?? "◉"),
}));

const coreSeedBundle = {
  appAreas: validateAppAreasSeed(appAreasRaw),
  products: productDefinitions,
  screenLibrary: validateScreenLibrarySeed(screenLibraryRaw),
  cardSortConcepts: validateCardSortConceptsSeed(cardSortConceptsRaw),
  tableRows: {
    products: productsRows,
    categories: validateCategoriesSeedRows(categoriesRaw),
    subcategories: validateSubcategoriesSeedRows(subcategoriesRaw),
    institutionProfiles: validateInstitutionProfilesSeedRows(institutionProfilesRaw),
    productFeatureCategories: validateProductFeatureCategoriesSeedRows(productFeatureCategoriesRaw),
    productFeatures: validateProductFeaturesSeedRows(productFeaturesRaw),
  },
} as const;

export interface FlatSignalSeeds {
  featureRequests: FeatureRequest[];
  kudos: KudosQuote[];
  screenFeedback: ScreenFeedback[];
}

export const getCoreSeedBundle = (): typeof coreSeedBundle => coreSeedBundle;

export const loadFlatSignalSeeds = async (): Promise<FlatSignalSeeds> => {
  const featureRequestsRaw = getSeed("featureRequests.seed.json");
  const kudosRaw = getSeed("kudos.seed.json");
  const screenFeedbackRaw = getSeed("screenFeedback.seed.json");

  return {
    featureRequests: validateFeatureRequestsSeed(featureRequestsRaw),
    kudos: validateKudosSeed(kudosRaw),
    screenFeedback: validateScreenFeedbackSeed(screenFeedbackRaw),
  };
};

export const buildCoreAdminTables = (): Array<{ id: string; label: string; rows: SeedRow[] }> => {
  const core = getCoreSeedBundle();
  return [
    { id: "categories", label: "categories", rows: [...core.tableRows.categories] },
    { id: "subcategories", label: "subcategories", rows: [...core.tableRows.subcategories] },
    { id: "products", label: "products", rows: [...core.tableRows.products] },
    { id: "institution_profiles", label: "institution_profiles", rows: [...core.tableRows.institutionProfiles] },
    { id: "product_feature_categories", label: "product_feature_categories", rows: [...core.tableRows.productFeatureCategories] },
    { id: "product_features", label: "product_features", rows: [...core.tableRows.productFeatures] },
  ];
};

export const loadFlatAdminTablesFromSeeds = async (): Promise<Array<{ id: string; label: string; rows: SeedRow[] }>> => {
  const coreTables = buildCoreAdminTables();
  const signalSeeds = await loadFlatSignalSeeds();

  return [
    ...coreTables,
    { id: "feature_requests", label: "feature_requests", rows: signalSeeds.featureRequests as unknown as SeedRow[] },
    { id: "kudos", label: "comments", rows: signalSeeds.kudos as unknown as SeedRow[] },
    { id: "screen_feedback", label: "screen_feedback", rows: signalSeeds.screenFeedback as unknown as SeedRow[] },
  ];
};

export const getSeededScreenLibrary = (): AppScreen[] => [...getCoreSeedBundle().screenLibrary];
export const getSeededCardSortConcepts = (): CardSortConcept[] => [...getCoreSeedBundle().cardSortConcepts];
