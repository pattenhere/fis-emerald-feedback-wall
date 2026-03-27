import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "./layout/Drawer";
import { Hero } from "./layout/Hero";
import { ProductLanding } from "./layout/ProductLanding";
import { SplashPage } from "./layout/SplashPage";
import { TopBar } from "./layout/TopBar";
import { ViewAllResponsesPage } from "./layout/ViewAllResponsesPage";
import { SystemAdministratorPage } from "./modules/admin/SystemAdministratorPage";
import { FeaturesPanel } from "./modules/features/FeaturesPanel";
import { KudosPanel } from "./modules/kudos/KudosPanel";
import { INITIAL_FEATURE_REQUESTS, INITIAL_KUDOS } from "./state/seedData";
import { useWallState } from "./state/useWallState";
import type { AppArea, AppScreen } from "./types/domain";
import "./styles/app.css";

const FALLBACK_SCREEN: AppScreen = {
  id: 0,
  productId: 0,
  app: "servicing",
  name: "Feature",
  wireframeLabel: "Feature detail · working prototype taxonomy",
  description: "Capture feedback for this feature.",
};

type AllResponseType = "Feedback" | "Feature Requests" | "Comments";

interface LiveResponseItem {
  id: string;
  category: string;
  title: string;
  sourceType: "Feature Request" | "Comments" | "Screen Feedback";
  feedbackType?: "Issue" | "Suggestion" | "Missing" | "Works Well";
  screenLabel: string;
  roleLabel?: string;
}

interface LiveResponseTypeGroup {
  type: LiveResponseItem["sourceType"];
  items: LiveResponseItem[];
}

interface LiveResponseCategoryGroup {
  category: string;
  totalCount: number;
  typeGroups: LiveResponseTypeGroup[];
}

const App = (): JSX.Element => {
  const state = useWallState();
  const [lastInteractionAt, setLastInteractionAt] = useState(Date.now());
  const [idleQuoteIndex, setIdleQuoteIndex] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [showLiveResponses, setShowLiveResponses] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showAllResponsesPage, setShowAllResponsesPage] = useState(false);
  const [showSystemAdminPage, setShowSystemAdminPage] = useState(false);
  const [wallInputOpen, setWallInputOpen] = useState(true);
  const [mobileQrActive, setMobileQrActive] = useState(true);
  const [themesAutoSwitch, setThemesAutoSwitch] = useState(false);
  const [inputCloseTimeLocal, setInputCloseTimeLocal] = useState("16:30");
  const {
    activeDrawerTab,
    activeApp,
    addFeatureRequest,
    addKudosQuote,
    addScreenFeedback,
    drawerOpen,
    featureRequests,
    kudosQuotes,
    publicQuotes,
    readinessThreshold,
    selectedScreenId,
    setActiveApp,
    setActiveDrawerTab,
    setDrawerOpen,
    setReadinessThreshold,
    setSelectedScreenId,
    screenFeedback,
    products,
    screens,
    adminTables,
    reseeding,
    reseedData,
    adminDataSource,
    adminDbEngine,
    isDataLoaded,
    dataLoadError,
    retryDataLoad,
    signalSummary,
    synthesisCountdownTarget,
    synthesisCountdownRunning,
    synthesisCountdownHasStarted,
    synthesisCountdownInitialSeconds,
    upvoteFeatureRequest,
  } = state;
  const productScreens = useMemo(
    () => (selectedProductId == null ? [] : screens.filter((screen) => screen.productId === selectedProductId)),
    [screens, selectedProductId],
  );
  const selectedScreen = useMemo(
    () => productScreens.find((screen) => screen.id === selectedScreenId) ?? productScreens[0] ?? FALLBACK_SCREEN,
    [productScreens, selectedScreenId],
  );
  const areaFeatures = useMemo(
    () =>
      featureRequests.filter((feature) => {
        if (feature.screenId != null) {
          return Number(feature.screenId) === Number(selectedScreen.id);
        }
        return selectedProductId != null && Number(feature.productId) === Number(selectedProductId);
      }),
    [featureRequests, selectedProductId, selectedScreen.id],
  );
  const selectedScreenFeedback = useMemo(
    () =>
      screenFeedback
        .filter((item) => item.screenId === selectedScreen.id)
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [screenFeedback, selectedScreen.id],
  );
  const screenBadgeCounts = useMemo(() => {
    const counts: Record<number, number> = {};

    for (const item of screenFeedback) {
      if (item.screenId == null) continue;
      const key = Number(item.screenId);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    for (const item of kudosQuotes) {
      if (item.screenId == null) continue;
      const key = Number(item.screenId);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    for (const item of featureRequests) {
      if (item.screenId == null) continue;
      const key = Number(item.screenId);
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
  }, [featureRequests, kudosQuotes, screenFeedback]);
  const initialFeatureRequestIds = useMemo(() => new Set(INITIAL_FEATURE_REQUESTS.map((item) => item.id)), []);
  const initialKudosIds = useMemo(() => new Set(INITIAL_KUDOS.map((item) => item.id)), []);
  const sessionAreaFeatures = useMemo(
    () => areaFeatures.filter((feature) => !initialFeatureRequestIds.has(feature.id)),
    [areaFeatures, initialFeatureRequestIds],
  );
  const areaKudos = useMemo(
    () =>
      kudosQuotes.filter(
        (quote) => {
          if (initialKudosIds.has(quote.id)) {
            return false;
          }
          if (quote.screenId != null) {
            return Number(quote.screenId) === Number(selectedScreen.id);
          }
          return selectedProductId != null && Number(quote.productId) === Number(selectedProductId);
        },
      ),
    [initialKudosIds, kudosQuotes, selectedProductId, selectedScreen.id],
  );
  const inProductLanding = selectedProductId === null;
  const featureCountByProductId = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const screen of screens) {
      if (screen.productId == null) continue;
      counts[screen.productId] = (counts[screen.productId] ?? 0) + 1;
    }
    return counts;
  }, [screens]);
  const selectedProductName = useMemo(
    () => products.find((product) => Number(product.id) === selectedProductId)?.name ?? null,
    [products, selectedProductId],
  );
  const firstFeatureScreenIdByProduct = useMemo(() => {
    const result: Record<number, number> = {};
    for (const product of products) {
      const first = screens.find((screen) => screen.productId === Number(product.id));
      if (first) {
        result[Number(product.id)] = Number(first.id);
      }
    }
    return result;
  }, [products, screens]);
  const selectedCategoryLabel = useMemo(() => {
    if (!selectedProductId) {
      return selectedScreen.name;
    }
    return selectedScreen.categoryLabel ?? selectedScreen.name;
  }, [selectedProductId, selectedScreen.categoryLabel, selectedScreen.name]);
  const allProductScreens = screens;
  const liveResponsesByCategory = useMemo(() => {
    const categoryByScreenId = new Map(allProductScreens.map((screen) => [String(screen.id), screen.categoryLabel ?? screen.app]));
    const screenNameById = new Map(allProductScreens.map((screen) => [String(screen.id), screen.name]));
    const screensByLengthDesc = allProductScreens
      .slice()
      .sort((a, b) => b.name.length - a.name.length);
    const inferScreenFromText = (text: string): AppScreen | null => {
      const normalizedText = text.toLowerCase();
      for (const screen of screensByLengthDesc) {
        if (normalizedText.includes(screen.name.toLowerCase())) {
          return screen;
        }
      }
      return null;
    };
    const resolveCategory = (screenId?: number | string): string => {
      if (screenId != null && categoryByScreenId.has(String(screenId))) {
        return categoryByScreenId.get(String(screenId)) ?? "Uncategorized";
      }
      return "Uncategorized";
    };

    const allResponses: LiveResponseItem[] = [];

    for (const feature of featureRequests) {
      const screenName = feature.screenId == null ? "Unspecified" : screenNameById.get(String(feature.screenId)) ?? "Unspecified";
      allResponses.push({
        id: `feature-${feature.id}`,
        category: resolveCategory(feature.screenId),
        title: feature.title,
        sourceType: "Feature Request",
        screenLabel: screenName,
      });
    }

    for (const quote of kudosQuotes) {
      const byScreenId = quote.screenId == null ? undefined : screenNameById.get(String(quote.screenId));
      const inferredScreen = byScreenId ? null : inferScreenFromText(quote.text);
      const screenName = byScreenId ?? inferredScreen?.name ?? "Unspecified";
      const category = resolveCategory(
        quote.screenId ?? inferredScreen?.id,
      );
      allResponses.push({
        id: `kudos-${quote.id}`,
        category,
        title: quote.text,
        sourceType: "Comments",
        screenLabel: screenName,
        roleLabel: quote.role.toUpperCase(),
      });
    }

    for (const feedback of screenFeedback) {
      const feedbackTypeLabel = feedback.type
        .split("-")
        .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
        .join(" ");
      allResponses.push({
        id: `screen-${feedback.id}`,
        category: resolveCategory(feedback.screenId),
        title: feedback.text?.trim() || feedbackTypeLabel,
        sourceType: "Screen Feedback",
        feedbackType: feedbackTypeLabel as LiveResponseItem["feedbackType"],
        screenLabel: feedback.screenName,
      });
    }

    const grouped = new Map<string, LiveResponseItem[]>();
    for (const response of allResponses) {
      const list = grouped.get(response.category) ?? [];
      list.push(response);
      grouped.set(response.category, list);
    }

    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, responses]): LiveResponseCategoryGroup => {
        const byType = new Map<LiveResponseItem["sourceType"], LiveResponseItem[]>();
        for (const item of responses) {
          const list = byType.get(item.sourceType) ?? [];
          list.push(item);
          byType.set(item.sourceType, list);
        }
        const typeGroups = [...byType.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([type, items]) => ({
            type,
            items: items.slice().sort((a, b) => {
              const screenCompare = a.screenLabel.localeCompare(b.screenLabel);
              if (screenCompare !== 0) {
                return screenCompare;
              }
              return a.title.localeCompare(b.title);
            }),
          }));
        return {
          category,
          totalCount: responses.length,
          typeGroups,
        };
      });
  }, [allProductScreens, featureRequests, kudosQuotes, screenFeedback]);

  const groupedAllResponses = useMemo(() => {
    const categoryByScreenId = new Map(allProductScreens.map((screen) => [Number(screen.id), screen.categoryLabel ?? screen.app]));
    const screenNameById = new Map(allProductScreens.map((screen) => [Number(screen.id), screen.name]));
    const resolveCategory = (screenId?: number): string => {
      if (screenId != null && categoryByScreenId.has(screenId)) {
        return categoryByScreenId.get(screenId) ?? "Uncategorized";
      }
      return "Uncategorized";
    };

    const typeOrder: Record<AllResponseType, number> = {
      Feedback: 0,
      "Feature Requests": 1,
      Comments: 2,
    };

    const grouped = new Map<string, Array<{ id: string; type: AllResponseType; title: string; detail: string }>>();

    for (const item of featureRequests) {
      if (initialFeatureRequestIds.has(item.id)) {
        continue;
      }
      const numericScreenId = item.screenId == null ? undefined : Number(item.screenId);
      const category = resolveCategory(numericScreenId);
      const list = grouped.get(category) ?? [];
      list.push({
        id: `feature-${item.id}`,
        type: "Feature Requests",
        title: item.title,
        detail: numericScreenId == null ? "Unspecified" : screenNameById.get(numericScreenId) ?? "Unspecified",
      });
      grouped.set(category, list);
    }

    for (const item of screenFeedback) {
      const feedbackTypeLabel = item.type
        .split("-")
        .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
        .join(" ");
      const category = resolveCategory(item.screenId == null ? undefined : Number(item.screenId));
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
      const numericScreenId = item.screenId == null ? undefined : Number(item.screenId);
      const category = resolveCategory(numericScreenId);
      const list = grouped.get(category) ?? [];
      list.push({
        id: `kudos-${item.id}`,
        type: "Comments",
        title: item.text,
        detail: `${item.role.toUpperCase()}${numericScreenId == null ? "" : ` • ${screenNameById.get(numericScreenId) ?? "Unspecified"}`}`,
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
    allProductScreens,
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
    (id: number) => {
      setSelectedScreenId(id);
      setActiveDrawerTab("features");
      setShowAllResponsesPage(false);
      setShowSystemAdminPage(false);
    },
    [setSelectedScreenId, setActiveDrawerTab],
  );

  const handleSelectProduct = useCallback(
    (productId: number) => {
      const product = products.find((item) => Number(item.id) === productId);
      if (!product) return;
      const firstScreenId = firstFeatureScreenIdByProduct[Number(product.id)];
      const firstScreenApp = firstScreenId ? screens.find((screen) => Number(screen.id) === firstScreenId)?.app : undefined;
      setActiveApp(firstScreenApp ?? product.app);
      if (firstScreenId) {
        setSelectedScreenId(firstScreenId);
      }
      setSelectedProductId(Number(product.id));
      setActiveDrawerTab("features");
      setDrawerOpen(true);
      setShowAllResponsesPage(false);
      setShowSystemAdminPage(false);
    },
    [firstFeatureScreenIdByProduct, products, screens, setActiveApp, setActiveDrawerTab, setDrawerOpen, setSelectedScreenId],
  );

  const drawerContent = useMemo((): JSX.Element => {
    if (activeDrawerTab === "features") {
      return (
        <FeaturesPanel
          items={sessionAreaFeatures}
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
              productId: selectedScreen.productId ?? selectedProductId ?? 0,
            })
          }
        />
      );
    }

    return (
      <FeaturesPanel
        items={sessionAreaFeatures}
        selectedScreen={selectedScreen}
        selectedCategoryLabel={selectedCategoryLabel}
        onAdd={addFeatureRequest}
        onUpvote={upvoteFeatureRequest}
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

  const idleActive = nowTick - lastInteractionAt > 480_000 && publicQuotes.length >= 3;
  const idleQuote = publicQuotes[idleQuoteIndex % Math.max(publicQuotes.length, 1)];

  if (showSplash) {
    return (
      <SplashPage
        imageSrc="/assets/splash-wall-hero.png"
        isDataLoaded={isDataLoaded}
        loadError={dataLoadError}
        onRetryLoad={() => void retryDataLoad()}
        onContinue={() => setShowSplash(false)}
      />
    );
  }

  return (
    <div className="app-shell">
        <TopBar
        summary={signalSummary}
        publicQuotes={publicQuotes}
        closeTimeLocal={inputCloseTimeLocal}
        compactMode={inProductLanding}
        selectedProductName={selectedProductName}
        onOpenLiveResponses={() => setShowLiveResponses(true)}
        onOpenSplash={() => setShowSplash(true)}
        mobileQrEnabled={mobileQrActive}
      />
      <main className={`content-shell ${showAllResponsesPage || showSystemAdminPage ? "is-admin-mode" : inProductLanding ? "is-product-landing" : drawerOpen ? "" : "is-drawer-collapsed"}`}>
        {showAllResponsesPage ? (
          <ViewAllResponsesPage groups={groupedAllResponses} />
        ) : showSystemAdminPage ? (
          <SystemAdministratorPage
            tables={adminTables}
            featureRequestCount={featureRequests.length}
            screenFeedbackCount={screenFeedback.length}
            kudosCount={kudosQuotes.length}
            totalFeatureVotes={signalSummary.totalFeatureVotes}
            readinessThreshold={readinessThreshold}
            onReadinessThresholdChange={setReadinessThreshold}
            wallInputOpen={wallInputOpen}
            onWallInputOpenChange={setWallInputOpen}
            mobileQrActive={mobileQrActive}
            onMobileQrActiveChange={setMobileQrActive}
            themesAutoSwitch={themesAutoSwitch}
            onThemesAutoSwitchChange={setThemesAutoSwitch}
            closeTimeLocal={inputCloseTimeLocal}
            onCloseTimeLocalChange={setInputCloseTimeLocal}
            synthesisCountdownTarget={synthesisCountdownTarget}
            synthesisCountdownRunning={synthesisCountdownRunning}
            synthesisCountdownHasStarted={synthesisCountdownHasStarted}
            synthesisCountdownInitialSeconds={synthesisCountdownInitialSeconds}
            onReseed={reseedData}
            reseeding={reseeding}
            dataSource={adminDataSource}
            dbEngine={adminDbEngine}
            onBackToDashboard={() => setShowSystemAdminPage(false)}
          />
        ) : inProductLanding ? (
          <ProductLanding
            products={products}
            featureCountByProductId={featureCountByProductId}
            onSelectProduct={handleSelectProduct}
          />
        ) : (
          <>
            <Drawer
              open={drawerOpen}
              activeTab={activeDrawerTab}
              onTabChange={setActiveDrawerTab}
              onToggle={() => setDrawerOpen(!drawerOpen)}
            >
              {drawerContent}
            </Drawer>

            <Hero
              productScreens={productScreens}
              onAppChange={handleAppChange}
              selectedScreenId={selectedScreenId}
              screenSubmissionCounts={screenBadgeCounts}
              featureRequests={featureRequests}
              kudosQuotes={kudosQuotes}
              allScreenFeedback={screenFeedback}
              screenFeedbackItems={selectedScreenFeedback}
              onScreenChange={handleScreenChange}
              onSubmitFeedback={addScreenFeedback}
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
      {showLiveResponses && !inProductLanding && !showAllResponsesPage && !showSystemAdminPage && (
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
                className="secondary-btn live-close-btn"
                onClick={() => setShowLiveResponses(false)}
              >
                Close
              </button>
            </div>
            <p className="live-responses-context">
              {signalSummary.totalResponses.toLocaleString()} total responses across all categories
            </p>
            <div className="live-responses-scroll">
              {liveResponsesByCategory.length === 0 ? (
                <p className="live-empty">No responses submitted yet.</p>
              ) : (
                liveResponsesByCategory.map((group) => (
                  <details key={group.category} className="live-responses-group">
                    <summary className="live-responses-group-summary">
                      <span>{group.category}</span>
                      <span className="live-responses-group-count">({group.totalCount.toLocaleString()})</span>
                    </summary>
                    {group.typeGroups.map((typeGroup) => (
                      <details key={typeGroup.type} className="live-type-group">
                        <summary className="live-type-group-summary">
                          <span className="live-type-group-title">{typeGroup.type}</span>
                          <span className="live-type-group-count">({typeGroup.items.length.toLocaleString()})</span>
                        </summary>
                        <ul className="list-reset live-responses-list">
                          {typeGroup.items.map((item) => (
                            <li key={item.id} className="live-response-card">
                              <p className="live-title">{item.title}</p>
                              <div className="live-meta-row">
                                <p className="live-meta">
                                  {item.feedbackType && (
                                    <span className={`live-chip live-chip--${item.feedbackType.toLowerCase().replaceAll(" ", "-")}`}>
                                      {item.feedbackType}
                                    </span>
                                  )}
                                  <span className="live-chip">{item.screenLabel}</span>
                                </p>
                                {item.roleLabel && <span className="live-chip live-role-chip">{item.roleLabel}</span>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </details>
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
