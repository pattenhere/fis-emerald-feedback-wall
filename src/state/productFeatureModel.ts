import type { SeedTableDefinition } from "./adminSeedData";
import type { AppArea, AppScreen } from "../types/domain";

export interface ProductFeatureScreen extends AppScreen {
  productId: number;
  categoryId: string;
  categoryLabel: string;
}

export interface ProductFeatureCatalog {
  productScreensByProduct: Record<number, ProductFeatureScreen[]>;
  featureCategoryLabelByFeatureId: Record<string, string>;
}

export const appAreaFromCategory = (category: string): AppArea => {
  if (category === "Digital Experience") return "digital-experience";
  if (category === "Origination") return "origination";
  if (category === "Credit & Risk" || category === "Customer Risk & Credit") return "credit-risk";
  if (category === "Servicing" || category === "SBA & Re-Amort, Servicing") return "servicing";
  if (category === "Monitoring & Controls") return "monitoring-controls";
  if (category === "Syndication / Complex Lending" || category === "Syndication") return "syndication-complex-lending";
  if (category === "Analytics & Inquiry") return "analytics-inquiry";
  return "platform-services";
};

const rowsFor = (tables: SeedTableDefinition[], tableId: string): Array<Record<string, unknown>> =>
  tables.find((table) => table.id === tableId)?.rows ?? [];

export const buildProductFeatureCatalog = (tables: SeedTableDefinition[]): ProductFeatureCatalog => {
  const categoriesRows = rowsFor(tables, "product_feature_categories");
  const productFeaturesRows = rowsFor(tables, "product_features");
  const categoryLabelById = new Map(categoriesRows.map((row) => [String(row.id), String(row.category)]));

  const grouped = new Map<number, ProductFeatureScreen[]>();
  const featureCategoryLabelByFeatureId: Record<string, string> = {};

  for (const row of productFeaturesRows) {
    const productId = Number(row.product_id ?? 0);
    const featureId = String(row.id ?? "");
    const categoryId = String(row.feature_category_id ?? "");
    const categoryLabel = categoryLabelById.get(categoryId) ?? "";
    const name = String(row.name ?? "").trim();
    if (!productId || !featureId || !categoryId || !categoryLabel || !name) {
      continue;
    }

    const description =
      typeof row.description === "string" && row.description.trim().length > 0
        ? row.description
        : `Capture feedback for ${name}.`;

    const screen: ProductFeatureScreen = {
      id: featureId,
      productId,
      app: appAreaFromCategory(categoryLabel),
      name,
      wireframeLabel: "Feature detail · working prototype taxonomy",
      description,
      categoryId,
      categoryLabel,
    };

    const current = grouped.get(productId) ?? [];
    current.push(screen);
    grouped.set(productId, current);
    featureCategoryLabelByFeatureId[featureId] = categoryLabel;
  }

  const productScreensByProduct: Record<number, ProductFeatureScreen[]> = {};
  for (const [productId, screens] of grouped.entries()) {
    productScreensByProduct[productId] = screens.slice().sort((a, b) => {
      const categoryCompare = a.categoryLabel.localeCompare(b.categoryLabel);
      return categoryCompare !== 0 ? categoryCompare : a.name.localeCompare(b.name);
    });
  }

  return { productScreensByProduct, featureCategoryLabelByFeatureId };
};
