import { memo } from "react";
import { PRODUCTS, SCREENS_BY_APP } from "../state/seedData";

interface ProductLandingProps {
  onSelectProduct: (productId: string) => void;
}

export const ProductLanding = memo(({ onSelectProduct }: ProductLandingProps): JSX.Element => {
  const enabledProductId = "PRD-005";

  return (
    <section className="product-landing" aria-label="Product selection">
      <p className="product-landing-eyebrow">Screen Feedback</p>
      <h2>Which product would you like to react to?</h2>
      <p className="product-landing-subtitle">Select a product area to see its screens.</p>

      <div className="product-tile-grid">
        {PRODUCTS.map((product) => {
          const featureCount = SCREENS_BY_APP[product.app]?.length ?? 0;
          const isEnabled = product.id === enabledProductId;
          return (
            <button
              key={product.id}
              type="button"
              className={`product-tile ${isEnabled ? "is-enabled" : "is-disabled"}`}
              onClick={() => onSelectProduct(product.id)}
              disabled={!isEnabled}
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
