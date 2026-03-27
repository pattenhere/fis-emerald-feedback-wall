import { memo, useMemo } from "react";
import type { ProductDefinition } from "../types/domain";

interface ProductLandingProps {
  products: ProductDefinition[];
  featureCountByProductId: Record<number, number>;
  onSelectProduct: (productId: number) => void;
}

export const ProductLanding = memo(({ products, featureCountByProductId, onSelectProduct }: ProductLandingProps): JSX.Element => {
  const enabledProductId = useMemo(
    () => Number(products.find((product) => product.legacyProductCode === "PRD-005")?.id ?? products[0]?.id ?? 0),
    [products],
  );

  return (
    <section className="product-landing" aria-label="Product selection">
      <p className="product-landing-eyebrow">Screen Feedback</p>
      <h2>Which product would you like to react to?</h2>
      <p className="product-landing-subtitle">Select a product area to see its screens.</p>

      <div className="product-tile-grid">
        {products.map((product) => {
          const productId = Number(product.id);
          const featureCount = featureCountByProductId[productId] ?? 0;
          const isEnabled = productId === enabledProductId;
          return (
            <button
              key={product.id}
              type="button"
              className="product-tile"
              onClick={() => onSelectProduct(productId)}
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
