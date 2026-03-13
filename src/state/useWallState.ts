import { useMemo, useState } from "react";
import {
  APP_AREAS,
  INITIAL_FEATURE_REQUESTS,
  INITIAL_KUDOS,
  SCREEN_LIBRARY,
} from "./seedData";
import type {
  AppArea,
  DrawerTab,
  FeedbackType,
  FeatureRequest,
  KudosRole,
  KudosQuote,
  ScreenFeedback,
  SignalSummary,
  SynthesisMode,
} from "../types/domain";

const DEFAULT_SYNTHESIS_PIN = "2468";

export interface WallState {
  drawerOpen: boolean;
  setDrawerOpen: (next: boolean) => void;
  activeDrawerTab: DrawerTab;
  setActiveDrawerTab: (tab: DrawerTab) => void;
  activeApp: AppArea;
  setActiveApp: (app: AppArea) => void;
  selectedScreenId: string;
  setSelectedScreenId: (screenId: string) => void;
  featureRequests: FeatureRequest[];
  addFeatureRequest: (input: {
    title: string;
    workflowContext?: string;
    app: AppArea;
    screenId: string;
    screenName: string;
  }) => void;
  upvoteFeatureRequest: (featureId: string) => void;
  kudosQuotes: KudosQuote[];
  addKudosQuote: (quote: { text: string; role: KudosRole; consentPublic: boolean }) => void;
  screenFeedback: ScreenFeedback[];
  addScreenFeedback: (input: {
    app: AppArea;
    screenId: string;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => void;
  synthesisMode: SynthesisMode;
  setSynthesisMode: (mode: SynthesisMode) => void;
  synthesisOutput: string;
  setSynthesisOutput: (next: string) => void;
  synthesisUnlocked: boolean;
  unlockSynthesis: (pin: string) => boolean;
  resetSynthesisLock: () => void;
  signalSummary: SignalSummary;
  synthesisCountdownTarget: string;
  synthesisPinLengthRange: { min: number; max: number };
  buildSynthesisPromptBody: () => string;
  clearSynthesisOutput: () => void;
  getNextScreenInActiveApp: () => string | null;
}

const nowIso = (): string => new Date().toISOString();
const makeId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useWallState = (): WallState => {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>("features");
  const [activeApp, setActiveApp] = useState<AppArea>(APP_AREAS[0].id);
  const [selectedScreenId, setSelectedScreenId] = useState(SCREEN_LIBRARY[0].id);
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>(INITIAL_FEATURE_REQUESTS);
  const [freshFeatureIds, setFreshFeatureIds] = useState<string[]>([]);
  const [kudosQuotes, setKudosQuotes] = useState<KudosQuote[]>(INITIAL_KUDOS);
  const [screenFeedback, setScreenFeedback] = useState<ScreenFeedback[]>([]);
  const [synthesisMode, setSynthesisMode] = useState<SynthesisMode>("roadmap");
  const [synthesisOutput, setSynthesisOutput] = useState("");
  const [synthesisUnlocked, setSynthesisUnlocked] = useState(false);
  const synthesisPinLengthRange = { min: 4, max: 6 };

  const synthesisCountdownTarget = "2026-03-12T22:00:00-04:00";

  const signalSummary = useMemo<SignalSummary>(() => {
    const totalFeatureVotes = featureRequests.reduce((sum, item) => sum + item.votes, 0);
    const screenFeedbackCount = screenFeedback.length;
    const kudosCount = kudosQuotes.length;

    return {
      totalFeatureVotes,
      screenFeedbackCount,
      kudosCount,
      totalResponses: featureRequests.length + screenFeedbackCount + kudosCount,
    };
  }, [featureRequests, screenFeedback, kudosQuotes]);

  const setActiveAppAndResetSelectedScreen = (app: AppArea): void => {
    setActiveApp(app);
    const appScreens = SCREEN_LIBRARY.filter((screen) => screen.app === app);
    if (appScreens.length > 0) {
      setSelectedScreenId(appScreens[0].id);
    }
  };

  const addFeatureRequest = (input: {
    title: string;
    workflowContext?: string;
    app: AppArea;
    screenId: string;
    screenName: string;
  }): void => {
    const trimmedTitle = input.title.trim();
    const trimmedContext = input.workflowContext?.trim();
    if (!trimmedTitle) {
      return;
    }

    const next: FeatureRequest = {
      id: makeId(),
      app: input.app,
      screenId: input.screenId,
      screenName: input.screenName,
      title: trimmedTitle,
      workflowContext: trimmedContext || undefined,
      votes: 1,
      createdAt: nowIso(),
    };

    setFeatureRequests((current) => [next, ...current]);
    setFreshFeatureIds((current) => [next.id, ...current]);
  };

  const upvoteFeatureRequest = (featureId: string): void => {
    setFeatureRequests((current) =>
      current.map((item) => (item.id === featureId ? { ...item, votes: item.votes + 1 } : item)),
    );
    setFreshFeatureIds((current) => current.filter((id) => id !== featureId));
  };

  const addKudosQuote = (quote: {
    text: string;
    role: KudosRole;
    consentPublic: boolean;
  }): void => {
    const trimmed = quote.text.trim();
    if (!trimmed) {
      return;
    }

    setKudosQuotes((current) => [
      {
        id: makeId(),
        text: trimmed,
        role: quote.role,
        consentPublic: quote.consentPublic,
        createdAt: nowIso(),
      },
      ...current,
    ]);
  };

  const addScreenFeedback = (input: {
    app: AppArea;
    screenId: string;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }): void => {
    setScreenFeedback((current) => [
      {
        id: makeId(),
        app: input.app,
        screenId: input.screenId,
        screenName: input.screenName,
        type: input.type,
        text: input.text?.trim() || undefined,
        createdAt: nowIso(),
      },
      ...current,
    ]);
  };

  const unlockSynthesis = (pin: string): boolean => {
    const digitsOnly = /^\d+$/.test(pin);
    const validLength =
      pin.length >= synthesisPinLengthRange.min && pin.length <= synthesisPinLengthRange.max;
    if (digitsOnly && validLength && pin === DEFAULT_SYNTHESIS_PIN) {
      setSynthesisUnlocked(true);
      return true;
    }

    return false;
  };

  const resetSynthesisLock = (): void => {
    setSynthesisUnlocked(false);
  };

  const buildSynthesisPromptBody = (): string => {
    const featureLines = featureRequests
      .map(
        (feature, index) =>
          `${index + 1}. ${feature.title} | votes=${feature.votes} | workflow=${feature.workflowContext ?? "n/a"}`,
      )
      .join("\n");

    const screenFeedbackLines = screenFeedback
      .map(
        (item, index) =>
          `${index + 1}. app=${item.app} | screen=${item.screenName} | type=${item.type} | text=${item.text ?? "n/a"}`,
      )
      .join("\n");

    const kudosLines = kudosQuotes
      .map(
        (quote, index) =>
          `${index + 1}. role=${quote.role} | consentPublic=${quote.consentPublic ? "yes" : "no"} | text=${quote.text}`,
      )
      .join("\n");

    return [
      "Feature Requests",
      featureLines || "No feature requests yet.",
      "",
      "Screen Feedback",
      screenFeedbackLines || "No screen feedback yet.",
      "",
      "Kudos",
      kudosLines || "No kudos yet.",
    ].join("\n");
  };

  const clearSynthesisOutput = (): void => {
    setSynthesisOutput("");
  };

  const getNextScreenInActiveApp = (): string | null => {
    const appScreens = SCREEN_LIBRARY.filter((screen) => screen.app === activeApp);
    if (appScreens.length < 2) {
      return null;
    }

    const currentIndex = appScreens.findIndex((screen) => screen.id === selectedScreenId);
    if (currentIndex === -1) {
      return appScreens[0].id;
    }

    const nextIndex = (currentIndex + 1) % appScreens.length;
    return appScreens[nextIndex].id;
  };

  const sortedFeatureRequests = [...featureRequests].sort((a, b) => {
    const aFresh = freshFeatureIds.includes(a.id);
    const bFresh = freshFeatureIds.includes(b.id);
    if (aFresh !== bFresh) {
      return aFresh ? -1 : 1;
    }
    if (b.votes !== a.votes) {
      return b.votes - a.votes;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    drawerOpen,
    setDrawerOpen,
    activeDrawerTab,
    setActiveDrawerTab,
    activeApp,
    setActiveApp: setActiveAppAndResetSelectedScreen,
    selectedScreenId,
    setSelectedScreenId,
    featureRequests: sortedFeatureRequests,
    addFeatureRequest,
    upvoteFeatureRequest,
    kudosQuotes,
    addKudosQuote,
    screenFeedback,
    addScreenFeedback,
    synthesisMode,
    setSynthesisMode,
    synthesisOutput,
    setSynthesisOutput,
    synthesisUnlocked,
    unlockSynthesis,
    resetSynthesisLock,
    signalSummary,
    synthesisCountdownTarget,
    synthesisPinLengthRange,
    buildSynthesisPromptBody,
    clearSynthesisOutput,
    getNextScreenInActiveApp,
  };
};
