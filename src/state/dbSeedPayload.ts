import { ADMIN_SEED_TABLES } from "./adminSeedData";
import {
  APP_AREAS,
  CARD_SORT_CONCEPTS,
  SCREEN_LIBRARY,
} from "./seedData";

export interface DbSeedPayload {
  tables: typeof ADMIN_SEED_TABLES;
  appAreas: typeof APP_AREAS;
  screenLibrary: typeof SCREEN_LIBRARY;
  cardSortConcepts: typeof CARD_SORT_CONCEPTS;
}

export const buildDbSeedPayload = (): DbSeedPayload => ({
  tables: ADMIN_SEED_TABLES,
  appAreas: APP_AREAS,
  screenLibrary: SCREEN_LIBRARY,
  cardSortConcepts: CARD_SORT_CONCEPTS,
});
