import appAreas from "../src/state/seeds/appAreas.seed.json" with { type: "json" };
import cardSortConcepts from "../src/state/seeds/cardSortConcepts.seed.json" with { type: "json" };
import categories from "../src/state/seeds/categories.seed.json" with { type: "json" };
import featureRequests from "../src/state/seeds/featureRequests.seed.json" with { type: "json" };
import institutionProfiles from "../src/state/seeds/institutionProfiles.seed.json" with { type: "json" };
import kudos from "../src/state/seeds/kudos.seed.json" with { type: "json" };
import productFeatureCategories from "../src/state/seeds/productFeatureCategories.seed.json" with { type: "json" };
import productFeatures from "../src/state/seeds/productFeatures.seed.json" with { type: "json" };
import products from "../src/state/seeds/products.seed.json" with { type: "json" };
import screenFeedback from "../src/state/seeds/screenFeedback.seed.json" with { type: "json" };
import screenLibrary from "../src/state/seeds/screenLibrary.seed.json" with { type: "json" };
import subcategories from "../src/state/seeds/subcategories.seed.json" with { type: "json" };

export const BUNDLED_SEEDS = Object.freeze({
  "appAreas.seed.json": appAreas,
  "cardSortConcepts.seed.json": cardSortConcepts,
  "categories.seed.json": categories,
  "featureRequests.seed.json": featureRequests,
  "institutionProfiles.seed.json": institutionProfiles,
  "kudos.seed.json": kudos,
  "productFeatureCategories.seed.json": productFeatureCategories,
  "productFeatures.seed.json": productFeatures,
  "products.seed.json": products,
  "screenFeedback.seed.json": screenFeedback,
  "screenLibrary.seed.json": screenLibrary,
  "subcategories.seed.json": subcategories,
});
