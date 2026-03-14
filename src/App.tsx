import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "./layout/Drawer";
import { Hero } from "./layout/Hero";
import { ProductLanding } from "./layout/ProductLanding";
import { SplashPage } from "./layout/SplashPage";
import { TopBar } from "./layout/TopBar";
import { ViewAllResponsesPage } from "./layout/ViewAllResponsesPage";
import { FeaturesPanel } from "./modules/features/FeaturesPanel";
import { KudosPanel } from "./modules/kudos/KudosPanel";
import { SynthesisPanel } from "./modules/synthesis/SynthesisPanel";
import { ADMIN_SEED_TABLES } from "./state/adminSeedData";
import { INITIAL_FEATURE_REQUESTS, INITIAL_KUDOS, PRODUCTS } from "./state/seedData";
import { buildProductFeatureCatalog } from "./state/productFeatureModel";
import { useWallState } from "./state/useWallState";
import type { AppArea, AppScreen } from "./types/domain";
import "./styles/app.css";

const FALLBACK_SCREEN: AppScreen = {
  id: "fallback-screen",
  app: "servicing",
  name: "Feature",
  wireframeLabel: "Feature detail · working prototype taxonomy",
  description: "Capture feedback for this feature.",
};

type AllResponseType = "Feedback" | "Feature Requests" | "Kudos";

interface LiveResponseItem {
  id: string;
  category: string;
  title: string;
  meta: string;
}

const App = (): JSX.Element => {
  const state = useWallState();
  const [lastInteractionAt, setLastInteractionAt] = useState(Date.now());
  const [idleQuoteIndex, setIdleQuoteIndex] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showLiveResponses, setShowLiveResponses] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showAllResponsesPage, setShowAllResponsesPage] = useState(false);
  const {
    activeDrawerTab,
    activeApp,
    addFeatureRequest,
    addKudosQuote,
    addScreenFeedback,
    appendFollowUpResponse,
    buildExportRecords,
    buildSynthesisPromptBody,
    clearSynthesisOutput,
    conflicts,
    drawerOpen,
    featureRequests,
    kudosQuotes,
    publicQuotes,
    readinessThreshold,
    revealNarrative,
    selectedScreenId,
    setActiveApp,
    setActiveDrawerTab,
    setDrawerOpen,
    setReadinessThreshold,
    setRevealNarrative,
    setSelectedScreenId,
    setSynthesisMode,
    setSynthesisOutput,
    screenSubmissionCounts,
    screenFeedback,
    signalSummary,
    synthesisCountdownTarget,
    synthesisMode,
    synthesisOutput,
    synthesisPinLengthRange,
    synthesisUnlocked,
    unlockSynthesis,
    upvoteFeatureRequest,
  } = state;
  const productFeatureCatalog = useMemo(
    () => buildProductFeatureCatalog(ADMIN_SEED_TABLES),
    [],
  );
  const { productScreensByProduct, featureCategoryLabelByFeatureId } = productFeatureCatalog;
  const productScreens = selectedProductId ? productScreensByProduct[selectedProductId] ?? [] : [];
  const selectedScreen = useMemo(
    () => productScreens.find((screen) => screen.id === selectedScreenId) ?? productScreens[0] ?? FALLBACK_SCREEN,
    [productScreens, selectedScreenId],
  );
  const areaFeatures = useMemo(
    () => featureRequests.filter((feature) => feature.screenId === selectedScreen.id),
    [featureRequests, selectedScreen.id],
  );
  const selectedScreenFeedback = useMemo(
    () =>
      screenFeedback
        .filter((item) => item.screenId === selectedScreen.id)
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [screenFeedback, selectedScreen.id],
  );
  const initialFeatureRequestIds = useMemo(() => new Set(INITIAL_FEATURE_REQUESTS.map((item) => item.id)), []);
  const initialKudosIds = useMemo(() => new Set(INITIAL_KUDOS.map((item) => item.id)), []);
  const sessionAreaFeatures = useMemo(
    () => areaFeatures.filter((feature) => !initialFeatureRequestIds.has(feature.id)),
    [areaFeatures, initialFeatureRequestIds],
  );
  const areaKudos = useMemo(
    () =>
      kudosQuotes.filter(
        (quote) => quote.screenId === selectedScreen.id && !initialKudosIds.has(quote.id),
      ),
    [initialKudosIds, kudosQuotes, selectedScreen.id],
  );
  const inProductLanding = selectedProductId === null;
  const selectedProductName = useMemo(
    () => PRODUCTS.find((product) => product.id === selectedProductId)?.name ?? null,
    [selectedProductId],
  );
  const firstFeatureScreenIdByProduct = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [productId, screens] of Object.entries(productScreensByProduct)) {
      if (screens.length > 0) {
        result[productId] = screens[0].id;
      }
    }
    return result;
  }, [productScreensByProduct]);
  const selectedCategoryLabel = useMemo(() => {
    if (!selectedProductId) {
      return selectedScreen.name;
    }
    return featureCategoryLabelByFeatureId[selectedScreen.id] ?? selectedScreen.name;
  }, [featureCategoryLabelByFeatureId, selectedProductId, selectedScreen.id, selectedScreen.name]);
  const allProductScreens = useMemo(
    () => Object.values(productScreensByProduct).flat(),
    [productScreensByProduct],
  );
  const categoryByNormalizedFeatureName = useMemo(() => {
    const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    return new Map(allProductScreens.map((screen) => [normalize(screen.name), screen.categoryLabel]));
  }, [allProductScreens]);
  const liveResponsesByCategory = useMemo(() => {
    const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const resolveCategory = (screenId?: string, screenName?: string): string => {
      if (screenId && featureCategoryLabelByFeatureId[screenId]) {
        return featureCategoryLabelByFeatureId[screenId];
      }
      if (screenName) {
        return categoryByNormalizedFeatureName.get(normalize(screenName)) ?? "Uncategorized";
      }
      return "Uncategorized";
    };

    const allResponses: LiveResponseItem[] = [];

    for (const feature of featureRequests) {
      allResponses.push({
        id: `feature-${feature.id}`,
        category: resolveCategory(feature.screenId, feature.screenName),
        title: feature.title,
        meta: `Feature Request • ${feature.screenName}`,
      });
    }

    for (const quote of kudosQuotes) {
      allResponses.push({
        id: `kudos-${quote.id}`,
        category: resolveCategory(quote.screenId, quote.screenName),
        title: quote.text,
        meta: `Kudos • ${quote.role.toUpperCase()}`,
      });
    }

    for (const feedback of screenFeedback) {
      const feedbackTypeLabel = feedback.type
        .split("-")
        .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
        .join(" ");
      allResponses.push({
        id: `screen-${feedback.id}`,
        category: resolveCategory(feedback.screenId, feedback.screenName),
        title: feedback.text?.trim() || feedbackTypeLabel,
        meta: `Screen Feedback • ${feedbackTypeLabel} • ${feedback.screenName}`,
      });
    }

    const grouped = new Map<string, LiveResponseItem[]>();
    for (const response of allResponses) {
      const list = grouped.get(response.category) ?? [];
      list.push(response);
      grouped.set(response.category, list);
    }

    return [...grouped.entries()]
      .map(([category, responses]) => ({
        category,
        responses: responses.slice().sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [categoryByNormalizedFeatureName, featureCategoryLabelByFeatureId, featureRequests, kudosQuotes, screenFeedback]);

  const groupedAllResponses = useMemo(() => {
    const resolveCategory = (screenId?: string, screenName?: string): string => {
      if (screenId && featureCategoryLabelByFeatureId[screenId]) {
        return featureCategoryLabelByFeatureId[screenId];
      }
      if (screenName) {
        const normalized = screenName.toLowerCase().replace(/[^a-z0-9]/g, "");
        return categoryByNormalizedFeatureName.get(normalized) ?? "Uncategorized";
      }
      return "Uncategorized";
    };

    const typeOrder: Record<AllResponseType, number> = {
      Feedback: 0,
      "Feature Requests": 1,
      Kudos: 2,
    };

    const grouped = new Map<string, Array<{ id: string; type: AllResponseType; title: string; detail: string }>>();

    for (const item of featureRequests) {
      if (initialFeatureRequestIds.has(item.id)) {
        continue;
      }
      const category = resolveCategory(item.screenId, item.screenName);
      const list = grouped.get(category) ?? [];
      list.push({
        id: `feature-${item.id}`,
        type: "Feature Requests",
        title: item.title,
        detail: item.screenName,
      });
      grouped.set(category, list);
    }

    for (const item of screenFeedback) {
      const feedbackTypeLabel = item.type
        .split("-")
        .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
        .join(" ");
      const category = resolveCategory(item.screenId, item.screenName);
      const list = grouped.get(category) ?? [];
      list.push({
        id: `feedback-${item.id}`,
        type: "Feedback",
        title: item.text?.trim() || feedbackTypeLabel,
        detail: `${feedbackTypeLabel} • ${item.screenName}`,
      });
      grouped.set(category, list);
    }

    for (const item of kudosQuotes) {
      const category = resolveCategory(item.screenId, item.screenName);
      const list = grouped.get(category) ?? [];
      list.push({
        id: `kudos-${item.id}`,
        type: "Kudos",
        title: item.text,
        detail: `${item.role.toUpperCase()}${item.screenName ? ` • ${item.screenName}` : ""}`,
      });
      grouped.set(category, list);
    }

    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, items]) => {
        const itemsByType = new Map<AllResponseType, Array<{ id: string; title: string; detail: string }>>();
        for (const item of items) {
          const list = itemsByType.get(item.type) ?? [];
          list.push({ id: item.id, title: item.title, detail: item.detail });
          itemsByType.set(item.type, list);
        }

        const sections = [...itemsByType.entries()]
          .sort((a, b) => typeOrder[a[0]] - typeOrder[b[0]])
          .map(([type, sectionItems]) => ({
            type,
            items: sectionItems.slice().sort((a, b) => a.title.localeCompare(b.title)),
          }));

        return {
          category,
          totalCount: items.length,
          sections,
        };
      });
  }, [
    categoryByNormalizedFeatureName,
    featureCategoryLabelByFeatureId,
    featureRequests,
    initialFeatureRequestIds,
    kudosQuotes,
    screenFeedback,
  ]);

  const handleAppChange = useCallback(
    (app: AppArea) => {
      setActiveApp(app);
      setActiveDrawerTab("features");
    },
    [setActiveApp, setActiveDrawerTab],
  );

  const handleScreenChange = useCallback(
    (id: string) => {
      setSelectedScreenId(id);
      setActiveDrawerTab("features");
      setShowAllResponsesPage(false);
    },
    [setSelectedScreenId, setActiveDrawerTab],
  );

  const handleSelectProduct = useCallback(
    (productId: string) => {
      const product = PRODUCTS.find((item) => item.id === productId);
      if (!product) return;
      const firstScreenId = firstFeatureScreenIdByProduct[product.id];
      const firstScreenApp = firstScreenId
        ? (productScreensByProduct[product.id] ?? []).find((screen) => screen.id === firstScreenId)?.app
        : undefined;
      setActiveApp(firstScreenApp ?? product.app);
      if (firstScreenId) {
        setSelectedScreenId(firstScreenId);
      }
      setSelectedProductId(product.id);
      setActiveDrawerTab("features");
      setDrawerOpen(true);
      setShowAllResponsesPage(false);
    },
    [firstFeatureScreenIdByProduct, productScreensByProduct, setActiveApp, setActiveDrawerTab, setDrawerOpen, setSelectedScreenId],
  );

  const drawerContent = useMemo((): JSX.Element => {
    if (activeDrawerTab === "features") {
      return (
        <FeaturesPanel
          items={sessionAreaFeatures}
          activeApp={activeApp}
          selectedScreen={selectedScreen}
          selectedCategoryLabel={selectedCategoryLabel}
          onAdd={addFeatureRequest}
          onUpvote={upvoteFeatureRequest}
        />
      );
    }

    if (activeDrawerTab === "kudos") {
      return (
        <KudosPanel
          items={areaKudos}
          onAdd={(quote) =>
            addKudosQuote({
              ...quote,
              app: activeApp,
              screenId: selectedScreen.id,
              screenName: selectedScreen.name,
            })
          }
        />
      );
    }

    return (
      <SynthesisPanel
        summary={signalSummary}
        activeApp={activeApp}
        conflicts={conflicts}
        readinessThreshold={readinessThreshold}
        onReadinessThresholdChange={setReadinessThreshold}
        mode={synthesisMode}
        onModeChange={setSynthesisMode}
        unlocked={synthesisUnlocked}
        onUnlock={unlockSynthesis}
        pinLengthRange={synthesisPinLengthRange}
        output={synthesisOutput}
        onOutputChange={setSynthesisOutput}
        buildPromptBody={buildSynthesisPromptBody}
        onClearOutput={clearSynthesisOutput}
        exportRecords={buildExportRecords}
        revealNarrative={revealNarrative}
        onRevealNarrativeChange={setRevealNarrative}
        featureRequests={featureRequests}
      />
    );
  }, [
    areaKudos,
    sessionAreaFeatures,
    selectedScreen,
    selectedCategoryLabel,
    activeApp,
    activeDrawerTab,
    addFeatureRequest,
    addKudosQuote,
    buildExportRecords,
    buildSynthesisPromptBody,
    clearSynthesisOutput,
    conflicts,
    featureRequests,
    readinessThreshold,
    revealNarrative,
    setReadinessThreshold,
    setRevealNarrative,
    setSynthesisMode,
    setSynthesisOutput,
    signalSummary,
    synthesisMode,
    synthesisOutput,
    synthesisPinLengthRange,
    synthesisUnlocked,
    unlockSynthesis,
    upvoteFeatureRequest,
  ]);

  useEffect(() => {
    const onInteract = (): void => setLastInteractionAt(Date.now());
    window.addEventListener("pointerdown", onInteract);
    window.addEventListener("keydown", onInteract);
    window.addEventListener("touchstart", onInteract);
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
      window.removeEventListener("touchstart", onInteract);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (publicQuotes.length < 3) {
      return;
    }
    const timer = window.setInterval(() => {
      setIdleQuoteIndex((current) => (current + 1) % publicQuotes.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [publicQuotes]);

  const idleActive = nowTick - lastInteractionAt > 45_000 && publicQuotes.length >= 3;
  const idleQuote = publicQuotes[idleQuoteIndex % Math.max(publicQuotes.length, 1)];

  if (showSplash) {
    return (
      <SplashPage
        imageSrc="/assets/splash-wall-hero.png"
        onContinue={() => setShowSplash(false)}
      />
    );
  }

  return (
    <div className="app-shell">
        <TopBar
        summary={signalSummary}
        countdownTarget={synthesisCountdownTarget}
        publicQuotes={publicQuotes}
        compactMode={inProductLanding}
        selectedProductName={selectedProductName}
        onOpenLiveResponses={() => setShowLiveResponses(true)}
        onOpenViewAll={() => setShowAllResponsesPage((current) => !current)}
        viewAllActive={showAllResponsesPage}
      />
      <main className={`content-shell ${showAllResponsesPage ? "is-admin-mode" : inProductLanding ? "is-product-landing" : drawerOpen ? "" : "is-drawer-collapsed"}`}>
        {showAllResponsesPage ? (
          <ViewAllResponsesPage groups={groupedAllResponses} />
        ) : inProductLanding ? (
          <ProductLanding onSelectProduct={handleSelectProduct} />
        ) : (
          <>
            <Drawer
              open={drawerOpen}
              activeTab={activeDrawerTab}
              onTabChange={setActiveDrawerTab}
            >
              {drawerContent}
            </Drawer>

            <Hero
              selectedProductId={selectedProductId ?? ""}
              onAppChange={handleAppChange}
              selectedScreenId={selectedScreenId}
              screenSubmissionCounts={screenSubmissionCounts}
              featureRequests={featureRequests}
              kudosQuotes={kudosQuotes}
              allScreenFeedback={screenFeedback}
              screenFeedbackItems={selectedScreenFeedback}
              onScreenChange={handleScreenChange}
              onSubmitFeedback={addScreenFeedback}
              onSaveFollowUp={appendFollowUpResponse}
            />
          </>
        )}
      </main>
      {idleActive && idleQuote && (
        <button type="button" className="idle-overlay" onClick={() => setLastInteractionAt(Date.now())}>
          <div>
            <p>{idleQuote.text}</p>
            <span>{idleQuote.role.toUpperCase()}</span>
          </div>
        </button>
      )}
      {showLiveResponses && !inProductLanding && !showAllResponsesPage && (
        <>
          <button
            type="button"
            className="live-responses-backdrop"
            onClick={() => setShowLiveResponses(false)}
            aria-label="Close live responses panel"
          />
          <aside className="live-responses-drawer" role="dialog" aria-modal="true" aria-label="Live responses">
            <div className="live-responses-head">
              <h2>Live Responses</h2>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowLiveResponses(false)}
              >
                Close
              </button>
            </div>
            <p className="live-responses-context">
              {signalSummary.totalResponses} total responses across all categories
            </p>
            <div className="live-responses-scroll">
              {liveResponsesByCategory.length === 0 ? (
                <p className="live-empty">No responses submitted yet.</p>
              ) : (
                liveResponsesByCategory.map((group) => (
                  <div key={group.category} className="live-responses-group">
                    <h3>{group.category}</h3>
                    <ul className="list-reset live-responses-list">
                      {group.responses.map((item) => (
                        <li key={item.id}>
                          <p className="live-title">{item.title}</p>
                          <p className="live-meta">{item.meta}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

export default App;
