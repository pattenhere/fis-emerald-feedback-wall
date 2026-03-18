import type { AppArea, FeedbackType } from "../../types/domain";

export interface ScreenRecord {
  id: number;
  productId: number;
  featureId?: number;
  app: AppArea;
  name: string;
  description: string;
  wireframeLabel?: string;
  assets: string[];
}

export interface AppSection {
  slug: string;
  label: string;
  screens: ScreenRecord[];
}

export interface RightPanelSubmitPayload {
  app: AppArea;
  productId: number;
  featureId?: number;
  screenId: number;
  screenName: string;
  type: FeedbackType;
  text?: string;
}
