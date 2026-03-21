import type { CompetingViewConflictEntry, CompetingViewScreenFeedback } from "./detectCompetingPerspectives";
import type { AppArea, FeatureRequest, KudosQuote, ScreenFeedback, SignalSummary } from "../types/domain";

export interface SynthesisMacroState {
  upweightApp?: AppArea;
  p0Only: boolean;
  excludeLowSignalBelow?: number;
  emphasizeMarketingQuotes: boolean;
}

export type SynthesisMacroInput = Partial<SynthesisMacroState>;

export interface SynthesisScreenFeedback extends ScreenFeedback {
  appSection?: AppArea | string;
  freetext?: string | null;
  upweighted?: boolean;
}

export interface RankedFeatureRequest extends FeatureRequest {
  compositeScore: number;
}

export interface CompetingPerspectiveThresholds {
  minEach?: number;
  minSplitRatio?: number;
}

export interface CompetingPerspectiveDetectionResult {
  conflicts: CompetingViewConflictEntry[];
  normalizedFeedback: CompetingViewScreenFeedback[];
}

export interface SynthesisAggregates {
  signalSummary: SignalSummary;
  compositeFeatureScore: number;
  totalFeatureVotes: number;
  totalScreenFeedback: number;
  totalKudos: number;
  totalResponses: number;
  topFeatureRequests: RankedFeatureRequest[];
  rankedFeatureRequests: RankedFeatureRequest[];
  screenFeedbackBySection: Record<string, number>;
  screenFeedbackByScreen: Array<{
    appSection: string;
    screenName: string;
    count: number;
  }>;
}

export interface SynthesisKudosPartitions {
  publicSafe: KudosQuote[];
  privatePool: KudosQuote[];
}

export interface SynthesisPromptInput {
  aggregates: SynthesisAggregates;
  featureRequests: RankedFeatureRequest[];
  screenFeedback: SynthesisScreenFeedback[];
  competingPerspectives: CompetingViewConflictEntry[];
  kudos: SynthesisKudosPartitions;
  macros: SynthesisMacroState;
}

export interface SynthesisPromptGuardResult extends SynthesisPromptInput {
  tokenEstimate: number;
  trimmed: boolean;
}

export interface PromptBlockOptions {
  featureLimit?: number;
  freetextPerScreen?: number;
}
