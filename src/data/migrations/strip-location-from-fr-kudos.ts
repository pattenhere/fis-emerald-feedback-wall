import type { FeatureRequest, KudosQuote } from "../../types/domain";

export interface EventDataStore {
  featureRequests: FeatureRequest[];
  kudosQuotes: KudosQuote[];
}

const stripLocationFields = (record: Record<string, unknown>): boolean => {
  let modified = false;
  if ("appSection" in record) {
    delete record.appSection;
    modified = true;
  }
  if ("screenName" in record) {
    delete record.screenName;
    modified = true;
  }
  // Legacy alias observed in current payloads.
  if ("app" in record) {
    delete record.app;
    modified = true;
  }
  return modified;
};

export const migrateStripLocationFields = (store: EventDataStore): void => {
  let featureModified = 0;
  let kudosModified = 0;

  for (const item of store.featureRequests) {
    if (stripLocationFields(item as unknown as Record<string, unknown>)) {
      featureModified += 1;
    }
  }
  for (const item of store.kudosQuotes) {
    if (stripLocationFields(item as unknown as Record<string, unknown>)) {
      kudosModified += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.info(`[Migration] Stripped location fields from ${featureModified} FR records, ${kudosModified} Kudos records.`);
};
