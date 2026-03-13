import { AppSelector } from "../modules/screen-feedback/AppSelector";
import { ScreenDetailPanel } from "../modules/screen-feedback/ScreenDetailPanel";
import { ScreenGrid } from "../modules/screen-feedback/ScreenGrid";
import { APP_AREAS, SCREEN_LIBRARY } from "../state/seedData";
import type { AppArea, FeedbackType } from "../types/domain";

interface HeroProps {
  activeApp: AppArea;
  onAppChange: (app: AppArea) => void;
  selectedScreenId: string;
  onScreenChange: (id: string) => void;
  onSubmitFeedback: (input: {
    app: AppArea;
    screenId: string;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => void;
  onPromptNextScreen: () => void;
  canPromptNextScreen: boolean;
}

export const Hero = ({
  activeApp,
  onAppChange,
  selectedScreenId,
  onScreenChange,
  onSubmitFeedback,
  onPromptNextScreen,
  canPromptNextScreen,
}: HeroProps): JSX.Element => {
  const screensForApp = SCREEN_LIBRARY.filter((screen) => screen.app === activeApp);
  const selectedScreen =
    screensForApp.find((screen) => screen.id === selectedScreenId) ?? screensForApp[0];

  return (
    <section className="hero">
      <AppSelector apps={APP_AREAS} activeApp={activeApp} onChange={onAppChange} />
      <div className="hero-grid">
        <ScreenGrid
          screens={screensForApp}
          selectedScreenId={selectedScreen.id}
          onSelectScreen={onScreenChange}
        />
        <ScreenDetailPanel
          screen={selectedScreen}
          onSubmitFeedback={onSubmitFeedback}
          onPromptNextScreen={onPromptNextScreen}
          canPromptNextScreen={canPromptNextScreen}
        />
      </div>
    </section>
  );
};
