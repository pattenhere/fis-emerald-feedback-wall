import { AppSelector } from "../modules/screen-feedback/AppSelector";
import { ScreenDetailPanel } from "../modules/screen-feedback/ScreenDetailPanel";
import { ScreenGrid } from "../modules/screen-feedback/ScreenGrid";
import { memo, useMemo } from "react";
import { ADMIN_SEED_TABLES } from "../state/adminSeedData";
import { buildProductFeatureCatalog } from "../state/productFeatureModel";
import type { AppArea, AppScreen, FeedbackType, FeatureRequest, KudosQuote, ScreenFeedback } from "../types/domain";

interface HeroProps {
  selectedProductId: string;
  onAppChange: (app: AppArea) => void;
  selectedScreenId: string;
  screenSubmissionCounts: Record<string, number>;
  featureRequests: FeatureRequest[];
  kudosQuotes: KudosQuote[];
  allScreenFeedback: ScreenFeedback[];
  screenFeedbackItems: ScreenFeedback[];
  onScreenChange: (id: string) => void;
  onSubmitFeedback: (input: {
    app: AppArea;
    screenId: string;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => string;
  onSaveFollowUp: (feedbackId: string, question: string, response?: string) => void;
}

export const Hero = memo(({
  selectedProductId,
  onAppChange,
  selectedScreenId,
  screenSubmissionCounts,
  featureRequests,
  kudosQuotes,
  allScreenFeedback,
  screenFeedbackItems,
  onScreenChange,
  onSubmitFeedback,
  onSaveFollowUp,
}: HeroProps): JSX.Element => {
  const productFeatureCatalog = useMemo(
    () => buildProductFeatureCatalog(ADMIN_SEED_TABLES),
    [],
  );
  const productScreens = productFeatureCatalog.productScreensByProduct[selectedProductId] ?? [];

  const categoryBuckets = useMemo(() => {
    const buckets = new Map<string, { id: string; label: string; screens: AppScreen[] }>();

    for (const screen of productScreens) {
      const bucket = buckets.get(screen.categoryId) ?? { id: screen.categoryId, label: screen.categoryLabel, screens: [] };
      if (!bucket.screens.some((entry) => entry.id === screen.id)) {
        bucket.screens.push(screen);
      }
      buckets.set(screen.categoryId, bucket);
    }

    return [...buckets.values()]
      .map((bucket) => ({
        ...bucket,
        screens: bucket.screens.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [productScreens]);

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

  const categorySignalIntensity = useMemo(() => {
    const signal: Record<string, number> = {};
    for (const bucket of categoryBuckets) {
      const screenIds = new Set(bucket.screens.map((screen) => screen.id));
      const featureRequestCount = featureRequests.filter((item) => screenIds.has(item.screenId)).length;
      const kudosCount = kudosQuotes.filter((item) => item.screenId && screenIds.has(item.screenId)).length;
      const feedbackCount = allScreenFeedback.filter((item) => screenIds.has(item.screenId)).length;
      signal[bucket.id] = featureRequestCount + kudosCount + feedbackCount > 0 ? 1 : 0;
    }
    return signal;
  }, [allScreenFeedback, categoryBuckets, featureRequests, kudosQuotes]);

  const selectedScreen = useMemo(
    () => screensForCategory.find((screen) => screen.id === selectedScreenId) ?? screensForCategory[0],
    [screensForCategory, selectedScreenId],
  );

  return (
    <section className="hero">
      <AppSelector
        tabs={selectorTabs}
        activeTabId={selectedCategoryId}
        signalIntensity={categorySignalIntensity}
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
            feedbackHistory={screenFeedbackItems}
            onSubmitFeedback={onSubmitFeedback}
            onSaveFollowUp={onSaveFollowUp}
          />
        )}
      </div>
    </section>
  );
});
