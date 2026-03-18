import type { AppScreen, CardSortConcept, FeatureRequest, KudosQuote, ProductDefinition, ScreenFeedback } from "../../types/domain";
import appAreasRaw from "./appAreas.seed.json";
import cardSortConceptsRaw from "./cardSortConcepts.seed.json";
import categoriesRaw from "./categories.seed.json";
import institutionProfilesRaw from "./institutionProfiles.seed.json";
import productFeatureCategoriesRaw from "./productFeatureCategories.seed.json";
import productFeaturesRaw from "./productFeatures.seed.json";
import productsRaw from "./products.seed.json";
import screenLibraryRaw from "./screenLibrary.seed.json";
import subcategoriesRaw from "./subcategories.seed.json";
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
} from "./seedValidator";

type SeedRow = Record<string, unknown>;

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
  const [featureRequestsRaw, kudosRaw, screenFeedbackRaw] = await Promise.all([
    import("./featureRequests.seed.json"),
    import("./kudos.seed.json"),
    import("./screenFeedback.seed.json"),
  ]);

  return {
    featureRequests: validateFeatureRequestsSeed(featureRequestsRaw.default),
    kudos: validateKudosSeed(kudosRaw.default),
    screenFeedback: validateScreenFeedbackSeed(screenFeedbackRaw.default),
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
