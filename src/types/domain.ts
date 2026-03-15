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
  | "issue"
  | "suggestion"
  | "missing"
  | "works-well"
  ;

export type KudosRole = "ops" | "eng" | "product" | "finance" | "exec" | "unspecified";
export type SessionRole = KudosRole;

export type SynthesisMode = "roadmap" | "prd";

export interface FeatureRequest {
  id: number | string;
  productId?: number;
  featureId?: number;
  screenId?: number | string;
  app: AppArea;
  screenName: string;
  title: string;
  description?: string;
  workflowContext?: string;
  status?: string;
  votes: number;
  createdAt: string;
  legacyRequestCode?: string;
  origin?: "kiosk" | "mobile";
}

export interface KudosQuote {
  id: number | string;
  productId?: number;
  featureId?: number;
  screenId?: number | string;
  text: string;
  role: KudosRole;
  consentPublic: boolean;
  app?: AppArea;
  screenName?: string;
  createdAt: string;
}

export interface AppScreen {
  id: number | string;
  productId?: number;
  legacyScreenCode?: string;
  featureId?: number;
  categoryId?: number | string;
  categoryLabel?: string;
  app: AppArea;
  name: string;
  wireframeLabel: string;
  description: string;
}

export interface ScreenFeedback {
  id: number | string;
  productId?: number;
  featureId?: number;
  screenId?: number | string;
  app: AppArea;
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
  screenId: number | string;
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

export interface ProductDefinition {
  id: number | string;
  legacyProductCode?: string;
  category: string;
  subcategory: string;
  name: string;
  app: AppArea;
  icon: string;
}

export interface MacroState {
  upweightApp?: AppArea;
  p0Only: boolean;
  excludeLowSignalBelow?: number;
  emphasizeMarketingQuotes: boolean;
}
