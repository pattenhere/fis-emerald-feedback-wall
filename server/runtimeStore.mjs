import fs from "node:fs";
import path from "node:path";

const emptyStore = () => ({
  featureRequests: [],
  featureRequestVoteIncrements: {},
  screenFeedback: [],
  kudos: [],
  cardSortResults: [],
  moderationInputStates: {},
  sessionConfig: {},
  synthesisParameters: null,
  synthesisParametersUpdatedAt: null,
  latestPhase1Analysis: null,
  latestTShirtSizing: null,
  latestSynthesisOutput: null,
  latestSynthesisMetadata: null,
  synthesisHistory: [],
  savedNarrative: null,
});

export const initRuntimeStore = (storePath) => {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(emptyStore(), null, 2) + "\n");
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      fs.writeFileSync(storePath, JSON.stringify(emptyStore(), null, 2) + "\n");
    }
  } catch {
    fs.writeFileSync(storePath, JSON.stringify(emptyStore(), null, 2) + "\n");
  }
};

export const readRuntimeStore = (storePath) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    return {
      ...emptyStore(),
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      featureRequestVoteIncrements:
        parsed && typeof parsed.featureRequestVoteIncrements === "object" && parsed.featureRequestVoteIncrements
          ? parsed.featureRequestVoteIncrements
          : {},
      moderationInputStates:
        parsed && typeof parsed.moderationInputStates === "object" && parsed.moderationInputStates
          ? parsed.moderationInputStates
          : {},
      synthesisHistory:
        parsed && Array.isArray(parsed.synthesisHistory)
          ? parsed.synthesisHistory
          : [],
    };
  } catch {
    return emptyStore();
  }
};

export const writeRuntimeStore = (storePath, nextStore) => {
  fs.writeFileSync(storePath, JSON.stringify({ ...emptyStore(), ...nextStore }, null, 2) + "\n");
};

export const resetRuntimeStore = (storePath) => {
  writeRuntimeStore(storePath, emptyStore());
};
