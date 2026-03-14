import { AppSelector } from "../modules/screen-feedback/AppSelector";
import { ScreenDetailPanel } from "../modules/screen-feedback/ScreenDetailPanel";
import { ScreenGrid } from "../modules/screen-feedback/ScreenGrid";
import { memo, useMemo } from "react";
import { ADMIN_SEED_TABLES } from "../state/adminSeedData";
import type { AppArea, AppScreen, FeedbackType } from "../types/domain";

interface HeroProps {
  selectedProductId: string;
  appHeatmapIntensity: Record<AppArea, number>;
  onAppChange: (app: AppArea) => void;
  selectedScreenId: string;
  screenSubmissionCounts: Record<string, number>;
  onScreenChange: (id: string) => void;
  onSubmitFeedback: (input: {
    app: AppArea;
    screenId: string;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => string;
  onSaveFollowUp: (feedbackId: string, question: string, response?: string) => void;
  onPromptNextScreen: () => void;
  canPromptNextScreen: boolean;
}

const appAreaFromCategory = (category: string): AppArea => {
  if (category === "Digital Experience") return "digital-experience";
  if (category === "Origination") return "origination";
  if (category === "Credit & Risk" || category === "Customer Risk & Credit") return "credit-risk";
  if (category === "Servicing" || category === "SBA & Re-Amort, Servicing") return "servicing";
  if (category === "Monitoring & Controls") return "monitoring-controls";
  if (category === "Syndication / Complex Lending" || category === "Syndication") return "syndication-complex-lending";
  if (category === "Analytics & Inquiry") return "analytics-inquiry";
  return "platform-services";
};

export const Hero = memo(({
  selectedProductId,
  appHeatmapIntensity,
  onAppChange,
  selectedScreenId,
  screenSubmissionCounts,
  onScreenChange,
  onSubmitFeedback,
  onSaveFollowUp,
  onPromptNextScreen,
  canPromptNextScreen,
}: HeroProps): JSX.Element => {
  const categoriesRows = useMemo(
    () => ADMIN_SEED_TABLES.find((table) => table.id === "product_feature_categories")?.rows ?? [],
    [],
  );
  const productFeaturesRows = useMemo(
    () => ADMIN_SEED_TABLES.find((table) => table.id === "product_features")?.rows ?? [],
    [],
  );

  const categoryBuckets = useMemo(() => {
    const categoryLabelById = new Map(
      categoriesRows.map((row) => [String(row.id), String(row.category)]),
    );
    const buckets = new Map<string, { id: string; label: string; screens: AppScreen[] }>();

    for (const row of productFeaturesRows) {
      if (String(row.product_id) !== selectedProductId) {
        continue;
      }

      const categoryId = String(row.feature_category_id ?? "");
      const categoryLabel = categoryLabelById.get(categoryId);
      if (!categoryLabel) {
        continue;
      }
      const name = String(row.name ?? "").trim();
      if (!name) continue;
      const description =
        typeof row.description === "string" && row.description.trim().length > 0
          ? row.description
          : `Capture feedback for ${name}.`;
      const screen: AppScreen = {
        id: String(row.id),
        app: appAreaFromCategory(categoryLabel),
        name,
        wireframeLabel: "Feature detail · working prototype taxonomy",
        description,
      };

      const bucket = buckets.get(categoryId) ?? { id: categoryId, label: categoryLabel, screens: [] };
      if (!bucket.screens.some((entry) => entry.id === screen.id)) {
        bucket.screens.push(screen);
      }
      buckets.set(categoryId, bucket);
    }

    return [...buckets.values()]
      .map((bucket) => ({
        ...bucket,
        screens: bucket.screens.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [categoriesRows, productFeaturesRows, selectedProductId]);

  const selectedCategoryId =
    categoryBuckets.find((bucket) => bucket.screens.some((screen) => screen.id === selectedScreenId))?.id
    ?? categoryBuckets[0]?.id
    ?? "";

  const selectedCategory = categoryBuckets.find((bucket) => bucket.id === selectedCategoryId) ?? categoryBuckets[0];
  const screensForCategory = selectedCategory?.screens ?? [];

  const selectorTabs = useMemo(
    () => categoryBuckets.map((bucket) => ({ id: bucket.id, label: bucket.label })),
    [categoryBuckets],
  );

  const selectorHeat = useMemo(() => {
    const heat: Record<string, number> = {};
    for (const bucket of categoryBuckets) {
      const scores = bucket.screens.map((screen) => appHeatmapIntensity[screen.app] ?? 0);
      const total = scores.reduce((sum, score) => sum + score, 0);
      heat[bucket.id] = scores.length > 0 ? total / scores.length : 0;
    }
    return heat;
  }, [appHeatmapIntensity, categoryBuckets]);

  const selectedScreen = useMemo(
    () => screensForCategory.find((screen) => screen.id === selectedScreenId) ?? screensForCategory[0],
    [screensForCategory, selectedScreenId],
  );

  return (
    <section className="hero">
      <AppSelector
        tabs={selectorTabs}
        activeTabId={selectedCategoryId}
        heatmapIntensity={selectorHeat}
        onChange={(categoryId) => {
          const nextCategory = categoryBuckets.find((bucket) => bucket.id === categoryId);
          const firstScreen = nextCategory?.screens[0];
          if (!firstScreen) {
            return;
          }
          onAppChange(firstScreen.app);
          onScreenChange(firstScreen.id);
        }}
      />
      <div className="hero-grid">
        <ScreenGrid
          screens={screensForCategory}
          selectedScreenId={selectedScreen?.id ?? ""}
          submissionCounts={screenSubmissionCounts}
          onSelectScreen={onScreenChange}
        />
        {selectedScreen && (
          <ScreenDetailPanel
            screen={selectedScreen}
            onSubmitFeedback={onSubmitFeedback}
            onSaveFollowUp={onSaveFollowUp}
            onPromptNextScreen={onPromptNextScreen}
            canPromptNextScreen={canPromptNextScreen}
          />
        )}
      </div>
    </section>
  );
});
