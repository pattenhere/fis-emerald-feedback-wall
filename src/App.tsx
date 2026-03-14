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
import { useWallState } from "./state/useWallState";
import type { AppArea, AppScreen } from "./types/domain";
import "./styles/app.css";

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

const FALLBACK_SCREEN: AppScreen = {
  id: "fallback-screen",
  app: "servicing",
  name: "Feature",
  wireframeLabel: "Feature detail · working prototype taxonomy",
  description: "Capture feedback for this feature.",
};

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
    appHeatmapIntensity,
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
  const categoriesRows = useMemo(
    () => ADMIN_SEED_TABLES.find((table) => table.id === "product_feature_categories")?.rows ?? [],
    [],
  );
  const productFeatureRows = useMemo(
    () => ADMIN_SEED_TABLES.find((table) => table.id === "product_features")?.rows ?? [],
    [],
  );
  const categoryLabelById = useMemo(
    () => new Map(categoriesRows.map((row) => [String(row.id), String(row.category)])),
    [categoriesRows],
  );
  const productScreensByProduct = useMemo(() => {
    const grouped = new Map<string, Array<{ category: string; screen: AppScreen }>>();
    for (const row of productFeatureRows) {
      const productId = String(row.product_id ?? "");
      const categoryLabel = categoryLabelById.get(String(row.feature_category_id ?? "")) ?? "";
      const name = String(row.name ?? "").trim();
      if (!productId || !name || !categoryLabel) {
        continue;
      }
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
      const current = grouped.get(productId) ?? [];
      current.push({ category: categoryLabel, screen });
      grouped.set(productId, current);
    }
    const result: Record<string, AppScreen[]> = {};
    for (const [productId, entries] of grouped.entries()) {
      entries.sort((a, b) => {
        const categoryCompare = a.category.localeCompare(b.category);
        return categoryCompare !== 0 ? categoryCompare : a.screen.name.localeCompare(b.screen.name);
      });
      result[productId] = entries.map((entry) => entry.screen);
    }
    return result;
  }, [categoryLabelById, productFeatureRows]);
  const productScreens = selectedProductId ? productScreensByProduct[selectedProductId] ?? [] : [];
  const selectedScreen = useMemo(
    () => productScreens.find((screen) => screen.id === selectedScreenId) ?? productScreens[0] ?? FALLBACK_SCREEN,
    [productScreens, selectedScreenId],
  );
  const areaFeatures = useMemo(
    () => featureRequests.filter((feature) => feature.screenId === selectedScreen.id),
    [featureRequests, selectedScreen.id],
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
  const areaScreenFeedback = useMemo(
    () => screenFeedback.filter((item) => item.screenId === selectedScreen.id),
    [screenFeedback, selectedScreen.id],
  );
  const nextScreenId = useMemo(() => {
    if (productScreens.length < 2) {
      return null;
    }
    const currentIndex = productScreens.findIndex((screen) => screen.id === selectedScreen.id);
    if (currentIndex === -1) {
      return productScreens[0].id;
    }
    const nextIndex = (currentIndex + 1) % productScreens.length;
    return productScreens[nextIndex].id;
  }, [productScreens, selectedScreen.id]);
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
    const match = productFeatureRows.find((row) => String(row.id) === selectedScreen.id && String(row.product_id) === selectedProductId);
    if (!match) {
      return selectedScreen.name;
    }
    return categoryLabelById.get(String(match.feature_category_id ?? "")) ?? selectedScreen.name;
  }, [categoryLabelById, productFeatureRows, selectedProductId, selectedScreen.id, selectedScreen.name]);

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

  const handlePromptNextScreen = useCallback(() => {
    if (nextScreenId) {
      setSelectedScreenId(nextScreenId);
    }
  }, [nextScreenId, setSelectedScreenId]);

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
              appHeatmapIntensity={appHeatmapIntensity}
              onAppChange={handleAppChange}
              selectedScreenId={selectedScreenId}
              screenSubmissionCounts={screenSubmissionCounts}
              onScreenChange={handleScreenChange}
              onSubmitFeedback={addScreenFeedback}
              onSaveFollowUp={appendFollowUpResponse}
              onPromptNextScreen={handlePromptNextScreen}
              canPromptNextScreen={Boolean(nextScreenId)}
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
            <p className="live-responses-context">Feature: {selectedScreen.name}</p>
            <div className="live-responses-group">
              <h3>Feature Requests ({sessionAreaFeatures.length})</h3>
              {sessionAreaFeatures.length === 0 ? (
                <p className="live-empty">No session feature requests for this feature yet.</p>
              ) : (
                <ul className="list-reset live-responses-list">
                  {sessionAreaFeatures.map((item) => (
                    <li key={item.id}>
                      <p className="live-title">{item.title}</p>
                      {item.workflowContext && <p className="live-meta">{item.workflowContext}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="live-responses-group">
              <h3>Kudos ({areaKudos.length})</h3>
              {areaKudos.length === 0 ? (
                <p className="live-empty">No session kudos for this feature yet.</p>
              ) : (
                <ul className="list-reset live-responses-list">
                  {areaKudos.map((item) => (
                    <li key={item.id}>
                      <p className="live-title">{item.text}</p>
                      <p className="live-meta">Role: {item.role.toUpperCase()}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="live-responses-group">
              <h3>Screen Feedback ({areaScreenFeedback.length})</h3>
              {areaScreenFeedback.length === 0 ? (
                <p className="live-empty">No screen feedback for this feature yet.</p>
              ) : (
                <ul className="list-reset live-responses-list">
                  {areaScreenFeedback.map((item) => (
                    <li key={item.id}>
                      <p className="live-title">{item.type.replace("-", " ")}</p>
                      {item.text && <p className="live-meta">{item.text}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

export default App;
