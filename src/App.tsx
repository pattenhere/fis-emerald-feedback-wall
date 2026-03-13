import { Drawer } from "./layout/Drawer";
import { Hero } from "./layout/Hero";
import { TopBar } from "./layout/TopBar";
import { FeaturesPanel } from "./modules/features/FeaturesPanel";
import { KudosPanel } from "./modules/kudos/KudosPanel";
import { SynthesisPanel } from "./modules/synthesis/SynthesisPanel";
import { SCREEN_LIBRARY } from "./state/seedData";
import { useWallState } from "./state/useWallState";
import "./styles/app.css";

const App = (): JSX.Element => {
  const state = useWallState();
  const selectedScreen =
    SCREEN_LIBRARY.find((screen) => screen.id === state.selectedScreenId) ?? SCREEN_LIBRARY[0];
  const areaFeatures = state.featureRequests.filter(
    (feature) => feature.screenId === selectedScreen.id,
  );

  const renderDrawerTab = (): JSX.Element => {
    if (state.activeDrawerTab === "features") {
      return (
        <FeaturesPanel
          items={areaFeatures}
          activeApp={state.activeApp}
          selectedScreen={selectedScreen}
          onAdd={state.addFeatureRequest}
          onUpvote={state.upvoteFeatureRequest}
        />
      );
    }

    if (state.activeDrawerTab === "kudos") {
      return <KudosPanel items={state.kudosQuotes} onAdd={state.addKudosQuote} />;
    }

    return (
      <SynthesisPanel
        summary={state.signalSummary}
        mode={state.synthesisMode}
        onModeChange={state.setSynthesisMode}
        unlocked={state.synthesisUnlocked}
        onUnlock={state.unlockSynthesis}
        pinLengthRange={state.synthesisPinLengthRange}
        output={state.synthesisOutput}
        onOutputChange={state.setSynthesisOutput}
        buildPromptBody={state.buildSynthesisPromptBody}
        onClearOutput={state.clearSynthesisOutput}
      />
    );
  };

  return (
    <div className="app-shell">
      <TopBar summary={state.signalSummary} countdownTarget={state.synthesisCountdownTarget} />
      <main className={`content-shell ${state.drawerOpen ? "" : "is-drawer-collapsed"}`}>
        <Drawer
          open={state.drawerOpen}
          activeTab={state.activeDrawerTab}
          onTabChange={state.setActiveDrawerTab}
          onToggle={() => state.setDrawerOpen(!state.drawerOpen)}
        >
          {renderDrawerTab()}
        </Drawer>

        <Hero
          activeApp={state.activeApp}
          onAppChange={(app) => {
            state.setActiveApp(app);
            state.setActiveDrawerTab("features");
          }}
          selectedScreenId={state.selectedScreenId}
          onScreenChange={(id) => {
            state.setSelectedScreenId(id);
            state.setActiveDrawerTab("features");
          }}
          onSubmitFeedback={state.addScreenFeedback}
          onPromptNextScreen={() => {
            const next = state.getNextScreenInActiveApp();
            if (next) {
              state.setSelectedScreenId(next);
            }
          }}
          canPromptNextScreen={Boolean(state.getNextScreenInActiveApp())}
        />
      </main>
    </div>
  );
};

export default App;
