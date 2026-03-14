import { useCallback, useEffect, useMemo, useState } from "react";
import { CardSortPanel } from "./modules/card-sort/CardSortPanel";
import { Drawer } from "./layout/Drawer";
import { Hero } from "./layout/Hero";
import { ProductLanding } from "./layout/ProductLanding";
import { TopBar } from "./layout/TopBar";
import { SystemAdministratorPage } from "./modules/admin/SystemAdministratorPage";
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
  const [adminMode, setAdminMode] = useState(false);
  const [showLiveResponses, setShowLiveResponses] = useState(false);
  const {
    activeDrawerTab,
    activeApp,
    addFeatureRequest,
    addKudosQuote,
    addScreenFeedback,
    appendFollowUpResponse,
    buildExportRecords,
    buildSynthesisPromptBody,
    cardSortConcepts,
    cardSortResponses,
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
    setCardSortTier,
    setDrawerOpen,
    setReadinessThreshold,
    setRevealNarrative,
    setSelectedScreenId,
    setSynthesisMode,
    setSynthesisOutput,
    screenSubmissionCounts,
    screenFeedback,
    sessionRole,
    setSessionRole,
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

  const handleToggleDrawer = useCallback(() => {
    setDrawerOpen(!drawerOpen);
  }, [drawerOpen, setDrawerOpen]);

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
    },
    [firstFeatureScreenIdByProduct, productScreensByProduct, setActiveApp, setActiveDrawerTab, setDrawerOpen, setSelectedScreenId],
  );

  const handleToggleAdminMode = useCallback(() => {
    setAdminMode((current) => !current);
  }, []);

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

    if (activeDrawerTab === "card-sort") {
      return (
        <CardSortPanel
          concepts={cardSortConcepts}
          responses={cardSortResponses}
          onAssignTier={setCardSortTier}
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
    cardSortConcepts,
    cardSortResponses,
    clearSynthesisOutput,
    conflicts,
    featureRequests,
    readinessThreshold,
    revealNarrative,
    setCardSortTier,
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

  return (
    <div className="app-shell">
        <TopBar
        summary={signalSummary}
        countdownTarget={synthesisCountdownTarget}
        sessionRole={sessionRole}
        onSessionRoleChange={setSessionRole}
        publicQuotes={publicQuotes}
        adminMode={adminMode}
        onToggleAdminMode={handleToggleAdminMode}
        compactMode={!adminMode && inProductLanding}
        selectedProductName={selectedProductName}
        onOpenLiveResponses={() => setShowLiveResponses(true)}
      />
      <main className={`content-shell ${adminMode ? "is-admin-mode" : inProductLanding ? "is-product-landing" : drawerOpen ? "" : "is-drawer-collapsed"}`}>
        {adminMode ? (
          <SystemAdministratorPage />
        ) : inProductLanding ? (
          <ProductLanding onSelectProduct={handleSelectProduct} />
        ) : (
          <>
            <Drawer
              open={drawerOpen}
              activeTab={activeDrawerTab}
              onTabChange={setActiveDrawerTab}
              onToggle={handleToggleDrawer}
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
      {showLiveResponses && !adminMode && !inProductLanding && (
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
