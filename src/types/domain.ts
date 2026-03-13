export type DrawerTab = "features" | "kudos" | "synthesis";

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
  createdAt: string;
}

export interface SignalSummary {
  totalFeatureVotes: number;
  screenFeedbackCount: number;
  kudosCount: number;
  totalResponses: number;
}
