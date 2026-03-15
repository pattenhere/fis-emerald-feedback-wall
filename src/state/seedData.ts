import type {
  AppArea,
  AppScreen,
  CardSortConcept,
  FeatureRequest,
  KudosQuote,
  ProductDefinition,
  ScreenFeedback,
} from "../types/domain";
import { getCoreSeedBundle } from "./seeds/seedLoader";

const coreSeeds = getCoreSeedBundle();

export const APP_AREAS: Array<{ id: AppArea; label: string; dark?: boolean }> = coreSeeds.appAreas;
export const PRODUCTS: ProductDefinition[] = coreSeeds.products;
export const SCREEN_LIBRARY: AppScreen[] = coreSeeds.screenLibrary;
export const FEATURE_LIBRARY: AppScreen[] = SCREEN_LIBRARY;
export const CARD_SORT_CONCEPTS: CardSortConcept[] = coreSeeds.cardSortConcepts;

export const SCREENS_BY_APP: Record<AppArea, AppScreen[]> = APP_AREAS.reduce(
  (acc, area) => {
    acc[area.id] = SCREEN_LIBRARY.filter((screen) => screen.app === area.id);
    return acc;
  },
  {} as Record<AppArea, AppScreen[]>,
);

export const FIRST_SCREEN_ID_BY_APP: Record<AppArea, string | number | null> = APP_AREAS.reduce(
  (acc, area) => {
    acc[area.id] = SCREENS_BY_APP[area.id][0]?.id ?? null;
    return acc;
  },
  {} as Record<AppArea, string | number | null>,
);

export const SCREEN_COUNT_BY_APP: Record<AppArea, number> = APP_AREAS.reduce(
  (acc, area) => {
    acc[area.id] = SCREENS_BY_APP[area.id].length;
    return acc;
  },
  {} as Record<AppArea, number>,
);

// Runtime seed rows are loaded via seedLoader to keep flat-file schemas validated.
export const INITIAL_FEATURE_REQUESTS: FeatureRequest[] = [];
export const INITIAL_KUDOS: KudosQuote[] = [];
export const INITIAL_SCREEN_FEEDBACK: ScreenFeedback[] = [];
