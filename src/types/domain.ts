export type DrawerTab = "features" | "kudos" | "card-sort" | "synthesis";

export type AppArea =
  | "digital-experience"
  | "origination"
  | "credit-risk"
  | "servicing"
  | "monitoring-controls"
  | "syndication-complex-lending"
  | "analytics-inquiry"
  | "platform-services";

export type FeedbackType =
  | "pain-point"
  | "confusing"
  | "missing-element"
  | "works-well"
  | "suggestion";

export type KudosRole = "ops" | "eng" | "product" | "finance" | "exec" | "unspecified";
export type SessionRole = KudosRole;

export type SynthesisMode = "roadmap" | "prd";

export interface FeatureRequest {
  id: string;
  app: AppArea;
  screenId: string;
  screenName: string;
  title: string;
  workflowContext?: string;
  votes: number;
  createdAt: string;
  origin?: "kiosk" | "mobile";
}

export interface KudosQuote {
  id: string;
  text: string;
  role: KudosRole;
  consentPublic: boolean;
  createdAt: string;
}

export interface AppScreen {
  id: string;
  app: AppArea;
  name: string;
  wireframeLabel: string;
  description: string;
}

export interface ScreenFeedback {
  id: string;
  app: AppArea;
  screenId: string;
  screenName: string;
  type: FeedbackType;
  text?: string;
  followUpQuestion?: string;
  followUpResponse?: string;
  createdAt: string;
}

export interface SignalSummary {
  totalFeatureVotes: number;
  screenFeedbackCount: number;
  kudosCount: number;
  totalResponses: number;
}

export interface ConflictEntry {
  app: AppArea;
  screenId: string;
  screenName: string;
  positiveCount: number;
  negativeCount: number;
}

export interface CardSortConcept {
  id: string;
  title: string;
  description: string;
}

export type CardSortTier = "high" | "medium" | "low";

export interface CardSortResponse {
  conceptId: string;
  tier: CardSortTier;
  updatedAt: string;
}

export interface MacroState {
  upweightApp?: AppArea;
  p0Only: boolean;
  excludeLowSignalBelow?: number;
  emphasizeMarketingQuotes: boolean;
}
