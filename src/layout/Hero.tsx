import { AppSelector } from "../modules/screen-feedback/AppSelector";
import { ScreenDetailPanel } from "../modules/screen-feedback/ScreenDetailPanel";
import { ScreenGrid } from "../modules/screen-feedback/ScreenGrid";
import { memo, useMemo } from "react";
import type { AppArea, AppScreen, FeedbackType, FeatureRequest, KudosQuote, ScreenFeedback } from "../types/domain";

interface HeroProps {
  productScreens: AppScreen[];
  onAppChange: (app: AppArea) => void;
  selectedScreenId: number;
  screenSubmissionCounts: Record<number, number>;
  featureRequests: FeatureRequest[];
  kudosQuotes: KudosQuote[];
  allScreenFeedback: ScreenFeedback[];
  screenFeedbackItems: ScreenFeedback[];
  onScreenChange: (id: number) => void;
  onSubmitFeedback: (input: {
    app: AppArea;
    productId: number;
    featureId?: number;
    screenId?: number;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => number;
}

export const Hero = memo(({
  productScreens,
  onAppChange,
  selectedScreenId,
  screenSubmissionCounts,
  featureRequests,
  kudosQuotes,
  allScreenFeedback,
  screenFeedbackItems,
  onScreenChange,
  onSubmitFeedback,
}: HeroProps): JSX.Element => {
  const categoryBuckets = useMemo(() => {
    const buckets = new Map<string, { id: string; label: string; screens: AppScreen[] }>();

    for (const screen of productScreens) {
      const categoryId = String(screen.categoryId ?? screen.app);
      const categoryLabel = screen.categoryLabel ?? screen.app;
      const bucket = buckets.get(categoryId) ?? { id: categoryId, label: categoryLabel, screens: [] };
      if (!bucket.screens.some((entry) => Number(entry.id) === Number(screen.id))) {
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
  }, [productScreens]);

  const selectedCategoryId =
    categoryBuckets.find((bucket) => bucket.screens.some((screen) => Number(screen.id) === selectedScreenId))?.id
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
      const screenIds = new Set<number>(bucket.screens.map((screen) => Number(screen.id)));
      const featureRequestCount = featureRequests.filter((item) => item.screenId != null && screenIds.has(Number(item.screenId))).length;
      const kudosCount = kudosQuotes.filter((item) => item.screenId != null && screenIds.has(Number(item.screenId))).length;
      const feedbackCount = allScreenFeedback.filter((item) => item.screenId != null && screenIds.has(Number(item.screenId))).length;
      signal[bucket.id] = featureRequestCount + kudosCount + feedbackCount > 0 ? 1 : 0;
    }
    return signal;
  }, [allScreenFeedback, categoryBuckets, featureRequests, kudosQuotes]);

  const selectedScreen = useMemo(
    () => screensForCategory.find((screen) => Number(screen.id) === selectedScreenId) ?? screensForCategory[0],
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
          onScreenChange(Number(firstScreen.id));
        }}
      />
      <div className="hero-grid">
        <ScreenGrid
          screens={screensForCategory}
          selectedScreenId={selectedScreen ? Number(selectedScreen.id) : 0}
          submissionCounts={screenSubmissionCounts}
          onSelectScreen={onScreenChange}
        />
        {selectedScreen && (
          <ScreenDetailPanel
            screen={selectedScreen}
            feedbackHistory={screenFeedbackItems}
            onSubmitFeedback={onSubmitFeedback}
          />
        )}
      </div>
    </section>
  );
});
