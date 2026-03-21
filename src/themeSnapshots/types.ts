export type ThemeSnapshot = {
  id: string;
  themes: string[];
  generatedAt: string;
  publishedAt: string | null;
  signalCounts: {
    featureRequests: number;
    screenFeedback: number;
    comments: number;
  };
  thresholdsAtGeneration: {
    minEach: number;
    minSplitRatio: number;
  };
};
