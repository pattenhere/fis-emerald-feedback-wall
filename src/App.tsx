import { useCallback, useEffect, useMemo, useState } from "react";
import { CardSortPanel } from "./modules/card-sort/CardSortPanel";
import { Drawer } from "./layout/Drawer";
import { Hero } from "./layout/Hero";
import { TopBar } from "./layout/TopBar";
import { FeaturesPanel } from "./modules/features/FeaturesPanel";
import { KudosPanel } from "./modules/kudos/KudosPanel";
import { SynthesisPanel } from "./modules/synthesis/SynthesisPanel";
import { SCREEN_LIBRARY } from "./state/seedData";
import { useWallState } from "./state/useWallState";
import type { AppArea } from "./types/domain";
import "./styles/app.css";

const App = (): JSX.Element => {
  const state = useWallState();
  const [lastInteractionAt, setLastInteractionAt] = useState(Date.now());
  const [idleQuoteIndex, setIdleQuoteIndex] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
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
    getNextScreenInActiveApp,
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
  const selectedScreen = useMemo(
    () => SCREEN_LIBRARY.find((screen) => screen.id === selectedScreenId) ?? SCREEN_LIBRARY[0],
    [selectedScreenId],
  );
  const areaFeatures = useMemo(
    () => featureRequests.filter((feature) => feature.screenId === selectedScreen.id),
    [featureRequests, selectedScreen.id],
  );
  const nextScreenId = getNextScreenInActiveApp();

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

  const drawerContent = useMemo((): JSX.Element => {
    if (activeDrawerTab === "features") {
      return (
        <FeaturesPanel
          items={areaFeatures}
          activeApp={activeApp}
          selectedScreen={selectedScreen}
          onAdd={addFeatureRequest}
          onUpvote={upvoteFeatureRequest}
        />
      );
    }

    if (activeDrawerTab === "kudos") {
      return <KudosPanel items={kudosQuotes} onAdd={addKudosQuote} />;
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
    areaFeatures,
    selectedScreen,
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
    kudosQuotes,
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
      />
      <main className={`content-shell ${drawerOpen ? "" : "is-drawer-collapsed"}`}>
        <Drawer
          open={drawerOpen}
          activeTab={activeDrawerTab}
          onTabChange={setActiveDrawerTab}
          onToggle={handleToggleDrawer}
        >
          {drawerContent}
        </Drawer>

        <Hero
          activeApp={activeApp}
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
      </main>
      {idleActive && idleQuote && (
        <button type="button" className="idle-overlay" onClick={() => setLastInteractionAt(Date.now())}>
          <div>
            <p>{idleQuote.text}</p>
            <span>{idleQuote.role.toUpperCase()}</span>
          </div>
        </button>
      )}
    </div>
  );
};

export default App;
