import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { FEEDBACK_PANEL_STAY_OPEN } from "../config";
import { HeroCarousel } from "../components/newUI/HeroCarousel";
import { LeftPanel } from "../components/newUI/LeftPanel";
import { NavigationBar } from "../components/newUI/NavigationBar";
import { RightPanel } from "../components/newUI/RightPanel";
import { Scrim } from "../components/newUI/Scrim";
import { SeeAllView } from "../components/newUI/SeeAllView";
import { IdleOverlay } from "../components/newUI/IdleOverlay";
import { useIdleTimer } from "../components/newUI/useIdleTimer";
import { SubmittedFeedbackBar } from "../components/newUI/SubmittedFeedbackBar";
import type { AppSection, ScreenRecord } from "../components/newUI/types";
import { ProductLanding } from "../layout/ProductLanding";
import { SplashPage } from "../layout/SplashPage";
import { TopBar } from "../layout/TopBar";
import { ViewAllResponsesPage } from "../layout/ViewAllResponsesPage";
import { SystemAdministratorPage } from "../modules/admin/SystemAdministratorPage";
import type { ThemeSnapshot } from "../themeSnapshots/types";
import { readPublishedThemeSnapshot } from "../themeSnapshots/store";
import { useWallState } from "../state/useWallState";
import "../styles/app.css";
import "../styles/new-ui.css";

const toPublicAssetPath = (assetPath: string): string => {
  const trimmed = assetPath.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("/assets/")) return trimmed;
  if (trimmed.startsWith("assets/")) return `/${trimmed}`;
  if (trimmed.startsWith("/")) return trimmed;
  return `/assets/${trimmed}`;
};

type AllResponseType = "Feedback" | "Feature Requests" | "Comments";

export const NewUILayout = (): JSX.Element => {
  const state = useWallState();
  const [showSplash, setShowSplash] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedScreenName, setSelectedScreenName] = useState<string | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [showAllResponsesPage, setShowAllResponsesPage] = useState(false);
  const [showSystemAdminPage, setShowSystemAdminPage] = useState(false);
  const [showLiveResponses, setShowLiveResponses] = useState(false);
  const [seeAllTab, setSeeAllTab] = useState<"features" | "comments" | null>(null);
  const [heroToast, setHeroToast] = useState("");
  const [wallInputOpen, setWallInputOpen] = useState(true);
  const [mobileQrActive, setMobileQrActive] = useState(true);
  const [themesAutoSwitch, setThemesAutoSwitch] = useState(false);
  const [inputCloseTimeLocal, setInputCloseTimeLocal] = useState("16:30");
  const [navStickyTop, setNavStickyTop] = useState(68);
  const [overlayTop, setOverlayTop] = useState(160);
  const [idleThemeSnapshot, setIdleThemeSnapshot] = useState<ThemeSnapshot | null>(null);
  const {
    addFeatureRequest,
    addKudosQuote,
    addScreenFeedback,
    appendFollowUpResponse,
    featureRequests,
    kudosQuotes,
    publicQuotes,
    readinessThreshold,
    setActiveApp,
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

  const inProductLanding = selectedProductId === null;
  const selectedProductName = useMemo(
    () => products.find((product) => Number(product.id) === selectedProductId)?.name ?? null,
    [products, selectedProductId],
  );
  const productScreens = useMemo(
    () => (selectedProductId == null ? [] : screens.filter((screen) => Number(screen.productId) === selectedProductId)),
    [screens, selectedProductId],
  );
  const featureCountByProductId = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const screen of screens) {
      if (screen.productId == null) continue;
      counts[Number(screen.productId)] = (counts[Number(screen.productId)] ?? 0) + 1;
    }
    return counts;
  }, [screens]);

  const appSections = useMemo<AppSection[]>(() => {
    const buckets = new Map<string, AppSection>();
    for (const screen of productScreens) {
      const slug = String(screen.categoryId ?? screen.app);
      const label = screen.categoryLabel ?? screen.app;
      const candidateAssets = Array.isArray((screen as { assets?: unknown }).assets)
        ? ((screen as { assets?: unknown }).assets as unknown[])
            .filter((asset): asset is string => typeof asset === "string" && asset.trim().length > 0)
        : [];
      const section = buckets.get(slug) ?? { slug, label, screens: [] };
      section.screens.push({
        id: Number(screen.id),
        productId: Number(screen.productId ?? 0),
        featureId: screen.featureId,
        app: screen.app,
        name: screen.name,
        description: screen.description,
        wireframeLabel: screen.wireframeLabel,
        assets: candidateAssets,
      });
      buckets.set(slug, section);
    }
    return [...buckets.values()]
      .map((section) => ({
        ...section,
        screens: section.screens.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [productScreens]);

  const screenFeedbackCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    const keyByScreenId = new Map<number, string>();
    for (const screen of screens) {
      keyByScreenId.set(Number(screen.id), `${String(screen.categoryId ?? screen.app)}::${screen.name}`);
    }

    for (const feedback of screenFeedback) {
      const byId = feedback.screenId == null ? undefined : keyByScreenId.get(Number(feedback.screenId));
      const key = byId ?? `${String(feedback.app ?? "servicing")}::${feedback.screenName}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [screenFeedback, screens]);

  useEffect(() => {
    if (!appSections.length) {
      setSelectedCategory(null);
      setSelectedScreenName(null);
      return;
    }
    if (selectedCategory && !appSections.some((section) => section.slug === selectedCategory)) {
      setSelectedCategory(null);
      setSelectedScreenName(null);
    }
  }, [appSections, selectedCategory]);

  const selectedSection = useMemo(
    () => appSections.find((section) => section.slug === selectedCategory),
    [appSections, selectedCategory],
  );
  const selectedScreen = useMemo<ScreenRecord | null>(
    () => selectedSection?.screens.find((screen) => screen.name === selectedScreenName) ?? null,
    [selectedScreenName, selectedSection],
  );
  const showSubmittedFeedback = (selectedCategory != null && selectedScreen != null) || seeAllTab != null;
  const kioskHeroVisible = !showSplash && !showAllResponsesPage && !showSystemAdminPage && !inProductLanding;
  const { isIdle } = useIdleTimer(kioskHeroVisible, 45_000);

  useEffect(() => {
    if (!selectedSection) return;
    const preloaded: HTMLImageElement[] = [];
    for (const screen of selectedSection.screens) {
      for (const asset of screen.assets) {
        const image = new Image();
        image.src = toPublicAssetPath(asset);
        preloaded.push(image);
      }
    }
    return () => {
      preloaded.length = 0;
    };
  }, [selectedSection]);

  useEffect(() => {
    if (!heroToast) return;
    const timer = window.setTimeout(() => setHeroToast(""), 2000);
    return () => window.clearTimeout(timer);
  }, [heroToast]);

  useEffect(() => {
    if (!kioskHeroVisible) {
      setIdleThemeSnapshot(null);
      return;
    }
    if (!isIdle) {
      setIdleThemeSnapshot(null);
      return;
    }
    setIdleThemeSnapshot(readPublishedThemeSnapshot());
  }, [isIdle, kioskHeroVisible]);

  useEffect(() => {
    const readTopBarHeight = (): void => {
      const topBar = document.querySelector(".top-bar");
      const height = topBar instanceof HTMLElement ? topBar.getBoundingClientRect().height : 68;
      setNavStickyTop(Math.max(48, Math.round(height)));
    };
    readTopBarHeight();
    window.addEventListener("resize", readTopBarHeight);
    return () => window.removeEventListener("resize", readTopBarHeight);
  }, []);

  useEffect(() => {
    const readOverlayTop = (): void => {
      const topBar = document.querySelector(".top-bar");
      const nav = document.querySelector(".newui-nav");
      const topBarHeight = topBar instanceof HTMLElement ? topBar.getBoundingClientRect().height : 68;
      const navHeight = nav instanceof HTMLElement ? nav.getBoundingClientRect().height : 86;
      setOverlayTop(Math.max(96, Math.round(topBarHeight + navHeight)));
    };
    readOverlayTop();
    window.addEventListener("resize", readOverlayTop);
    return () => window.removeEventListener("resize", readOverlayTop);
  }, [selectedCategory, selectedSection?.screens.length]);

  const selectedScreenFeedback = useMemo(
    () =>
      selectedScreen
        ? screenFeedback
            .filter((item) => Number(item.screenId) === Number(selectedScreen.id))
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [],
    [screenFeedback, selectedScreen],
  );

  const groupedAllResponses = useMemo(() => {
    const categoryByScreenId = new Map(screens.map((screen) => [Number(screen.id), screen.categoryLabel ?? screen.app]));
    const screenNameById = new Map(screens.map((screen) => [Number(screen.id), screen.name]));
    const typeOrder: Record<AllResponseType, number> = {
      Feedback: 0,
      "Feature Requests": 1,
      Comments: 2,
    };
    const grouped = new Map<string, Array<{ id: string; type: AllResponseType; title: string; detail: string }>>();

    const resolveCategory = (screenId?: number): string => {
      if (screenId != null && categoryByScreenId.has(screenId)) {
        return categoryByScreenId.get(screenId) ?? "Uncategorized";
      }
      return "Uncategorized";
    };

    for (const item of featureRequests) {
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
        return { category, totalCount: items.length, sections };
      });
  }, [featureRequests, kudosQuotes, screenFeedback, screens]);

  const handleSelectProduct = useCallback(
    (productId: number) => {
      const nextProductId = Number(productId);
      setSelectedProductId(nextProductId);
      const firstScreen = screens.find((screen) => Number(screen.productId) === nextProductId);
      if (firstScreen) {
        setActiveApp(firstScreen.app);
        setSelectedScreenId(Number(firstScreen.id));
      }
      setSelectedCategory(null);
      setSelectedScreenName(null);
      setSeeAllTab(null);
      setShowAllResponsesPage(false);
      setShowSystemAdminPage(false);
      setShowLiveResponses(false);
      setLeftPanelOpen(false);
      setRightPanelOpen(false);
    },
    [screens, setActiveApp, setSelectedScreenId],
  );

  const handleCategorySelect = useCallback(
    (categorySlug: string) => {
      setSelectedCategory(categorySlug);
      const section = appSections.find((candidate) => candidate.slug === categorySlug);
      const firstScreen = section?.screens[0];
      if (firstScreen) {
        setActiveApp(firstScreen.app);
      }
      setSelectedScreenName(null);
      setSeeAllTab(null);
      setLeftPanelOpen(false);
      setRightPanelOpen(false);
    },
    [appSections, setActiveApp],
  );

  const handleScreenSelect = useCallback(
    (screenName: string) => {
      setSelectedScreenName(screenName);
      setSeeAllTab(null);
      const match = selectedSection?.screens.find((screen) => screen.name === screenName);
      if (match) {
        setActiveApp(match.app);
        setSelectedScreenId(match.id);
      }
    },
    [selectedSection, setActiveApp, setSelectedScreenId],
  );

  const closeLeftPanel = useCallback(() => setLeftPanelOpen(false), []);
  const closeRightPanel = useCallback(() => setRightPanelOpen(false), []);
  const openLeftPanel = useCallback(() => {
    setRightPanelOpen(false);
    setLeftPanelOpen(true);
  }, []);
  const openRightPanel = useCallback(() => {
    if (!selectedScreen) return;
    setLeftPanelOpen(false);
    setRightPanelOpen(true);
  }, [selectedScreen]);

  useEffect(() => {
    if (inProductLanding || showAllResponsesPage || showSystemAdminPage) {
      setShowLiveResponses(false);
    }
  }, [inProductLanding, showAllResponsesPage, showSystemAdminPage]);

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
        onOpenSystemAdmin={() => {
          window.location.assign("/facilitator/overview");
        }}
        systemAdminActive={false}
        mobileQrEnabled={mobileQrActive}
      />

      {showAllResponsesPage ? (
        <main className="content-shell is-admin-mode">
          <ViewAllResponsesPage groups={groupedAllResponses} />
        </main>
      ) : showSystemAdminPage ? (
        <main className="content-shell is-admin-mode">
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
        </main>
      ) : inProductLanding ? (
        <main className="content-shell is-product-landing">
          <ProductLanding
            products={products}
            featureCountByProductId={featureCountByProductId}
            onSelectProduct={handleSelectProduct}
            onOpenSystemAdmin={() => {
              window.location.assign("/facilitator/overview");
            }}
          />
        </main>
      ) : (
        <main
          className="newui-shell"
          style={
            {
              "--newui-overlay-top": `${overlayTop}px`,
            } as CSSProperties
          }
        >
          {seeAllTab == null && (
            <NavigationBar
              appSections={appSections}
              selectedCategory={selectedCategory}
              selectedScreen={selectedScreenName}
              screenFeedbackCounts={screenFeedbackCounts}
              onCategorySelect={handleCategorySelect}
              onScreenSelect={handleScreenSelect}
              stickyTopPx={navStickyTop}
            />
          )}
          <div className="newui-hero-zone">
            {seeAllTab == null ? (
              <>
                <HeroCarousel
                  selectedScreen={selectedScreen}
                  onSubmitFeedbackClick={openRightPanel}
                  onOpenBroaderFeedback={openLeftPanel}
                />
                {heroToast && <p className="newui-hero-toast">{heroToast}</p>}
              </>
            ) : (
              <SeeAllView
                tab={seeAllTab}
                onClose={() => setSeeAllTab(null)}
                featureItems={featureRequests}
                commentItems={kudosQuotes}
                onUpvoteFeature={upvoteFeatureRequest}
              />
            )}
            <Scrim
              visible={leftPanelOpen || rightPanelOpen}
              onClick={closeLeftPanel}
              coverSubmittedFeedback={false}
            />
            {idleThemeSnapshot && (
              <IdleOverlay
                snapshot={idleThemeSnapshot}
                onDismiss={() => setIdleThemeSnapshot(null)}
              />
            )}
          </div>
          {showSubmittedFeedback && <SubmittedFeedbackBar feedbackHistory={selectedScreenFeedback} />}

          <LeftPanel
            isOpen={leftPanelOpen}
            onOpen={openLeftPanel}
            onClose={closeLeftPanel}
            featureItems={featureRequests}
            commentItems={kudosQuotes}
            onAddFeature={(input) =>
              addFeatureRequest({
                title: input.title,
                workflowContext: input.workflowContext,
                productId: selectedProductId ?? selectedScreen?.productId ?? 0,
                origin: "kiosk",
              })
            }
            onAddComment={(quote) =>
              addKudosQuote({
                ...quote,
                productId: selectedProductId ?? selectedScreen?.productId ?? 0,
              })
            }
            onSeeAll={setSeeAllTab}
          />

          <RightPanel
            isOpen={rightPanelOpen}
            activeScreenName={selectedScreen?.name ?? null}
            onClose={closeRightPanel}
            onSubmitSuccess={() => {
              setHeroToast("Feedback submitted.");
            }}
            stayOpenAfterSubmit={FEEDBACK_PANEL_STAY_OPEN}
            activeScreen={selectedScreen}
            onSubmitFeedback={(payload) =>
              addScreenFeedback({
                app: payload.app,
                productId: payload.productId,
                featureId: payload.featureId,
                screenId: payload.screenId,
                screenName: payload.screenName,
                type: payload.type,
                text: payload.text,
              })
            }
            onAppendFollowUp={appendFollowUpResponse}
          />
        </main>
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
              {groupedAllResponses.length === 0 ? (
                <p className="live-empty">No responses submitted yet.</p>
              ) : (
                groupedAllResponses.map((group) => (
                  <details key={group.category} className="live-responses-group">
                    <summary className="live-responses-group-summary">
                      <span>{group.category}</span>
                      <span className="live-responses-group-count">({group.totalCount.toLocaleString()})</span>
                    </summary>
                    {group.sections.map((section) => (
                      <details key={section.type} className="live-type-group">
                        <summary className="live-type-group-summary">
                          <span className="live-type-group-title">{section.type}</span>
                          <span className="live-type-group-count">({section.items.length.toLocaleString()})</span>
                        </summary>
                        <ul className="list-reset live-responses-list">
                          {section.items.map((item) => (
                            <li key={item.id} className="live-response-card">
                              <p className="live-title">{item.title}</p>
                              <div className="live-meta-row">
                                <p className="live-meta">
                                  <span className="live-chip">{item.detail}</span>
                                </p>
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
