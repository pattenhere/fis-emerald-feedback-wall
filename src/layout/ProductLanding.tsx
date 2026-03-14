import { memo, useMemo } from "react";
import { ADMIN_SEED_TABLES } from "../state/adminSeedData";
import { buildProductFeatureCatalog } from "../state/productFeatureModel";
import { PRODUCTS } from "../state/seedData";

interface ProductLandingProps {
  onSelectProduct: (productId: string) => void;
}

export const ProductLanding = memo(({ onSelectProduct }: ProductLandingProps): JSX.Element => {
  const enabledProductId = "PRD-005";
  const featureCountByProductId = useMemo(() => {
    const catalog = buildProductFeatureCatalog(ADMIN_SEED_TABLES);
    const result: Record<string, number> = {};
    for (const [productId, screens] of Object.entries(catalog.productScreensByProduct)) {
      result[productId] = screens.length;
    }
    return result;
  }, []);

  return (
    <section className="product-landing" aria-label="Product selection">
      <p className="product-landing-eyebrow">Screen Feedback</p>
      <h2>Which product would you like to react to?</h2>
      <p className="product-landing-subtitle">Select a product area to see its screens.</p>

      <div className="product-tile-grid">
        {PRODUCTS.map((product) => {
          const featureCount = featureCountByProductId[product.id] ?? 0;
          const isEnabled = product.id === enabledProductId;
          return (
            <button
              key={product.id}
              type="button"
              className="product-tile"
              onClick={() => onSelectProduct(product.id)}
              disabled={!isEnabled}
              aria-disabled={!isEnabled}
              aria-label={`${product.name}, ${featureCount} features`}
            >
              <span className="product-tile-icon" aria-hidden="true">
                {product.icon}
              </span>
              <span className="product-tile-name">{product.name}</span>
              <span className="product-tile-count">
                {featureCount} {featureCount === 1 ? "feature" : "features"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
});
