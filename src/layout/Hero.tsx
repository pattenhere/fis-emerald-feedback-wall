import { AppSelector } from "../modules/screen-feedback/AppSelector";
import { ScreenDetailPanel } from "../modules/screen-feedback/ScreenDetailPanel";
import { ScreenGrid } from "../modules/screen-feedback/ScreenGrid";
import { memo, useMemo } from "react";
import { APP_AREAS, SCREENS_BY_APP } from "../state/seedData";
import type { AppArea, FeedbackType } from "../types/domain";

interface HeroProps {
  activeApp: AppArea;
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

export const Hero = memo(({
  activeApp,
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
  const screensForApp = SCREENS_BY_APP[activeApp];
  const selectedScreen = useMemo(
    () => screensForApp.find((screen) => screen.id === selectedScreenId) ?? screensForApp[0],
    [screensForApp, selectedScreenId],
  );

  return (
    <section className="hero">
      <AppSelector
        apps={APP_AREAS}
        activeApp={activeApp}
        heatmapIntensity={appHeatmapIntensity}
        onChange={onAppChange}
      />
      <div className="hero-grid">
        <ScreenGrid
          screens={screensForApp}
          selectedScreenId={selectedScreen.id}
          submissionCounts={screenSubmissionCounts}
          onSelectScreen={onScreenChange}
        />
        <ScreenDetailPanel
          screen={selectedScreen}
          onSubmitFeedback={onSubmitFeedback}
          onSaveFollowUp={onSaveFollowUp}
          onPromptNextScreen={onPromptNextScreen}
          canPromptNextScreen={canPromptNextScreen}
        />
      </div>
    </section>
  );
});
