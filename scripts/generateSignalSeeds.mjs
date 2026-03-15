import fs from 'node:fs';
import path from 'node:path';

const seedDir = path.resolve('src/state/seeds');
const appAreas = JSON.parse(fs.readFileSync(path.join(seedDir, 'appAreas.seed.json'), 'utf8'));
const screens = JSON.parse(fs.readFileSync(path.join(seedDir, 'screenLibrary.seed.json'), 'utf8'));

const screensByApp = Object.fromEntries(appAreas.map((area) => [area.id, screens.filter((screen) => screen.app === area.id)]));

const allocateCounts = (total, buckets) => {
  if (buckets <= 0) return [];
  const weights = Array.from({ length: buckets }, (_, index) => buckets - index + (index % 2 === 0 ? 1 : 0));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = weights.map((weight) => (total * weight) / weightSum);
  const counts = raw.map((value) => Math.floor(value));
  let remainder = total - counts.reduce((sum, value) => sum + value, 0);
  const orderedByRemainder = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < orderedByRemainder.length && remainder > 0; i += 1) {
    counts[orderedByRemainder[i].index] += 1;
    remainder -= 1;
  }
  return counts;
};

const uniqueText = (candidate, seen, fallbackPool) => {
  if (!seen.has(candidate)) {
    seen.add(candidate);
    return candidate;
  }
  for (let i = 0; i < fallbackPool.length; i += 1) {
    const next = `${candidate} ${fallbackPool[i]}`;
    if (!seen.has(next)) {
      seen.add(next);
      return next;
    }
  }
  let counter = 2;
  while (true) {
    const next = `${candidate} Variant ${counter}`;
    if (!seen.has(next)) {
      seen.add(next);
      return next;
    }
    counter += 1;
  }
};

const toRole = (text, random) => {
  const roles = ['ops', 'product', 'eng', 'finance', 'exec'];
  const keywords = {
    ops: ['queue', 'handoff', 'workflow', 'exception', 'operations'],
    product: ['journey', 'experience', 'adoption', 'workflow language', 'users'],
    eng: ['api', 'latency', 'performance', 'integration', 'stability'],
    finance: ['cost', 'margin', 'capital', 'forecast', 'profitability'],
    exec: ['portfolio', 'strategy', 'leadership', 'enterprise', 'decision'],
  };
  const normalized = text.toLowerCase();
  const matched = roles.filter((role) => keywords[role].some((token) => normalized.includes(token)));
  if (random() < 0.1) return 'unspecified';
  const pool = matched.length > 0 ? matched : roles;
  return pool[Math.floor(random() * pool.length) % pool.length];
};

let rngState = 73198 >>> 0;
const random = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
};

const FEEDBACK_TOTAL_BY_APP = {
  'digital-experience': 168,
  origination: 182,
  'credit-risk': 147,
  servicing: 244,
  'monitoring-controls': 164,
  'syndication-complex-lending': 121,
  'analytics-inquiry': 112,
  'platform-services': 110,
};

const FEATURE_TOTAL_BY_APP = {
  'digital-experience': 54,
  origination: 66,
  'credit-risk': 48,
  servicing: 72,
  'monitoring-controls': 60,
  'syndication-complex-lending': 42,
  'analytics-inquiry': 39,
  'platform-services': 35,
};

const KUDOS_TOTAL_BY_APP = {
  'digital-experience': 92,
  origination: 128,
  'credit-risk': 96,
  servicing: 136,
  'monitoring-controls': 118,
  'syndication-complex-lending': 78,
  'analytics-inquiry': 70,
  'platform-services': 66,
};

const feedbackVocabulary = {
  issue: {
    friction: ['Status context', 'Approval routing', 'Exception visibility', 'Field validation', 'Queue prioritization', 'Handoff signaling', 'Search precision', 'Task ownership', 'Context retention', 'Workflow sequencing', 'Alert clarity', 'Audit traceability', 'Review pacing'],
    effect: ['slows down daily processing', 'creates extra back-and-forth', 'adds avoidable rework', 'forces manual cross-checks', 'makes triage less predictable', 'increases turnaround time', 'causes teams to re-open tasks', 'raises operational risk', 'obscures priority handoffs', 'reduces first-pass accuracy', 'causes late-stage corrections'],
    scenario: ['during high-volume mornings', 'at month-end close', 'when escalations hit at once', 'during cross-team handoffs', 'in same-day service windows', 'while preparing audit packets', 'during regional handoff windows', 'in exception-heavy batches', 'during portfolio review cycles', 'on repeat amendment requests', 'while finalizing borrower updates'],
  },
  suggestion: {
    action: ['Add a compact summary panel', 'Introduce a one-click quick action', 'Provide saved filter presets', 'Expose a clearer progress timeline', 'Add inline owner context', 'Surface related records side-by-side', 'Allow role-based default views', 'Introduce pinned workflow checkpoints', 'Add configurable signal thresholds', 'Provide a split-view comparison mode', 'Surface next-best action guidance', 'Add focused exception drill-down'],
    benefit: ['to reduce context switching', 'to speed first-pass decisions', 'to cut manual reconciliation', 'to improve queue discipline', 'to streamline complex handoffs', 'to keep teams aligned on state', 'to reduce training overhead', 'to shorten review cycles', 'to improve SLA confidence', 'to make escalations cleaner'],
    outcome: ['for day-to-day operators', 'for underwriting reviewers', 'for servicing analysts', 'for compliance coordinators', 'for portfolio managers', 'for syndication teams', 'for operations leads', 'for regional users', 'for cross-functional squads', 'for overnight support teams'],
  },
  missing: {
    gap: ['Missing a dedicated audit note field', 'Missing bulk reassignment controls', 'Missing filter-by-owner options', 'Missing direct jump links to related history', 'Missing structured exception reasons', 'Missing reusable review checklists', 'Missing override rationale capture', 'Missing linked task breadcrumbs', 'Missing automated dependency flags', 'Missing clear stale-task indicators', 'Missing cross-lane status rollups'],
    impact: ['which slows compliance follow-up', 'which creates extra queue churn', 'which forces manual tracking outside the app', 'which increases handoff risk', 'which weakens review transparency', 'which makes escalation harder to manage', 'which introduces avoidable errors', 'which delays completion on complex requests', 'which reduces confidence in approvals', 'which hurts cycle-time predictability'],
    audience: ['for operations teams', 'for product owners', 'for risk reviewers', 'for servicing specialists', 'for control officers', 'for portfolio governance teams', 'for agented loan admins', 'for analytics users', 'for onboarding coordinators', 'for exception managers'],
  },
  'works-well': {
    strength: ['The drill-down flow', 'The status timeline', 'The queue visibility', 'The approval context', 'The layout hierarchy', 'The exception workflow', 'The search and sort behavior', 'The cross-screen handoff', 'The policy control signals', 'The progress indicators', 'The in-line data grouping'],
    gain: ['keeps context intact', 'is easy to explain to new users', 'supports fast triage', 'reduces backtracking', 'improves review confidence', 'feels reliable under pressure', 'matches real workflow order', 'makes ownership clearer', 'helps teams resolve blockers quickly', 'supports cleaner collaboration'],
    setting: ['in daily operations', 'during onboarding', 'during high-volume windows', 'in compliance reviews', 'for cross-team work', 'for exception handling', 'for portfolio monitoring', 'for recurring renewals', 'for service recovery tasks', 'during handoff checkpoints'],
  },
};

const feedbackFallback = [
  'This wording was tuned for uniqueness.',
  'The phrasing was adjusted to avoid collisions.',
  'The sentence was expanded to keep this seed unique.',
  'This version preserves intent while staying distinct.',
  'The language was varied for one-of-a-kind wording.',
  'This item is intentionally phrased as a unique variant.',
];

const featureVocabulary = {
  action: ['Add', 'Enable', 'Introduce', 'Provide', 'Create', 'Support', 'Expose', 'Offer', 'Deliver', 'Launch', 'Include', 'Implement'],
  target: ['bulk approval', 'saved operational views', 'guided exception handling', 'context-rich handoff summaries', 'priority-aware queue controls', 'in-line portfolio snapshots', 'role-based defaults', 'cross-record jump navigation', 'configurable alert thresholds', 'structured amendment pathways', 'approval rationale capture', 'activity timeline markers'],
  qualifier: ['for daily triage', 'for faster servicing execution', 'for cleaner origination handoffs', 'for clearer risk review', 'for tighter control operations', 'for smoother syndication workflows', 'for better analytics follow-through', 'for more reliable platform administration', 'for multi-team coordination', 'for high-volume exception lanes'],
};

const featureContextPool = [
  'Reduce manual coordination between teams during high-volume periods.',
  'Improve consistency across regions and reduce repeat clarifications.',
  'Lower onboarding friction while preserving strong governance controls.',
  'Cut rework caused by missing context between workflow stages.',
  'Help teams make faster, higher-confidence decisions on first pass.',
  'Improve visibility so escalations are handled earlier and cleaner.',
  'Shorten cycle times without sacrificing quality or auditability.',
  'Support predictable throughput during periods of elevated workload.',
  'Keep ownership clear as work moves across multiple operating groups.',
  'Strengthen day-two demo outcomes with clearer workflow outcomes.',
];

const kudosVocabulary = {
  opening: ['Appreciate how', 'Really impressed by how', 'Our team noticed how', 'Great momentum from how', 'We value how', 'Strong results from how', 'The walkthrough showed how', 'Excellent progress in how', 'The prototype proved how', 'Loved seeing how'],
  impact: ['reduced queue friction', 'made ownership clearer', 'improved decision speed', 'kept handoffs aligned', 'stabilized exception handling', 'tightened policy adherence', 'improved portfolio visibility', 'kept workflow intent obvious', 'smoothed cross-team execution', 'made daily reviews less noisy'],
  value: ['for operations', 'for product planning', 'for engineering execution', 'for finance oversight', 'for executive review', 'for risk management', 'for servicing velocity', 'for origination flow', 'for syndication teams', 'for analytics partners'],
  closer: ['This is helping us move with confidence.', 'It already feels more production-ready.', 'This will make training and adoption easier.', 'This directly improves our day-to-day execution.', 'This aligns tightly with how our teams operate.', 'This is exactly the kind of clarity we needed.', 'This gives leadership a stronger line of sight.', 'This should reduce avoidable escalations.', 'This is a strong foundation for scale.', 'This simplifies complex work without losing control.'],
};

const featureRows = [];
const featureTextSeen = new Set();
let featureCounter = 1;
const featureSeedBase = Date.parse('2026-03-10T12:00:00.000Z');
for (const area of appAreas) {
  const areaScreens = screensByApp[area.id] ?? [];
  const perScreen = allocateCounts(FEATURE_TOTAL_BY_APP[area.id] ?? 0, areaScreens.length);
  areaScreens.forEach((screen, screenIndex) => {
    for (let i = 0; i < (perScreen[screenIndex] ?? 0); i += 1) {
      const action = featureVocabulary.action[(featureCounter + i) % featureVocabulary.action.length];
      const target = featureVocabulary.target[(featureCounter * 2 + screenIndex) % featureVocabulary.target.length];
      const qualifier = featureVocabulary.qualifier[(featureCounter * 3 + i + screenIndex) % featureVocabulary.qualifier.length];
      const rawTitle = `${action} ${target} ${qualifier} (${screen.name})`;
      const title = uniqueText(rawTitle, featureTextSeen, feedbackFallback);
      const workflowContext = featureContextPool[(featureCounter + screenIndex + i) % featureContextPool.length];
      featureRows.push({
        id: `fr-${String(featureCounter).padStart(4, '0')}`,
        app: area.id,
        screenId: screen.id,
        screenName: screen.name,
        title,
        workflowContext,
        votes: ((featureCounter + screenIndex) % 9) + 1,
        createdAt: new Date(featureSeedBase + featureCounter * 51000).toISOString(),
        origin: 'kiosk',
      });
      featureCounter += 1;
    }
  });
}

const kudosRows = [];
const kudosTextSeen = new Set();
let kudosCounter = 1;
const kudosSeedBase = Date.parse('2026-03-10T14:00:00.000Z');
for (const area of appAreas) {
  const areaScreens = screensByApp[area.id] ?? [];
  const perScreen = allocateCounts(KUDOS_TOTAL_BY_APP[area.id] ?? 0, areaScreens.length);
  areaScreens.forEach((screen, screenIndex) => {
    for (let i = 0; i < (perScreen[screenIndex] ?? 0); i += 1) {
      const opening = kudosVocabulary.opening[(kudosCounter + i) % kudosVocabulary.opening.length];
      const impact = kudosVocabulary.impact[(kudosCounter * 3 + screenIndex) % kudosVocabulary.impact.length];
      const value = kudosVocabulary.value[(kudosCounter * 5 + i + screenIndex) % kudosVocabulary.value.length];
      const closer = kudosVocabulary.closer[(kudosCounter * 7 + screenIndex) % kudosVocabulary.closer.length];
      const baseText = `${opening} ${screen.name} ${impact} ${value}. ${closer}`;
      const text = uniqueText(baseText, kudosTextSeen, feedbackFallback);
      kudosRows.push({
        id: `kd-${String(kudosCounter).padStart(4, '0')}`,
        app: area.id,
        screenId: screen.id,
        screenName: screen.name,
        text,
        role: toRole(text, random),
        consentPublic: random() < 0.75,
        createdAt: new Date(kudosSeedBase + kudosCounter * 43000).toISOString(),
      });
      kudosCounter += 1;
    }
  });
}

const feedbackRows = [];
const feedbackTextSeen = new Set();
let feedbackCounter = 1;
const feedbackSeedBase = Date.parse('2026-03-10T15:00:00.000Z');
const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash * 31) + value.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
};
const buildFeedbackWeightsForScreen = (screen) => {
  const hash = hashString(`${screen.app}|${screen.name}`);
  const directionPositive = hash % 2 === 0;
  const bucket = hash % 10;

  // Most screens are intentionally skewed to avoid synthetic 50/50 sentiment splits.
  let positiveTarget;
  if (bucket < 7) {
    positiveTarget = directionPositive ? 0.74 : 0.30;
  } else if (bucket < 9) {
    positiveTarget = directionPositive ? 0.64 : 0.40;
  } else {
    positiveTarget = 0.54;
  }
  const negativeTarget = 1 - positiveTarget;

  const suggestionShareOfPositive = 0.72 + ((hash >> 3) % 9) * 0.01; // 0.72..0.80
  const worksWellShareOfPositive = 1 - suggestionShareOfPositive;
  const issueShareOfNegative = 0.46 + ((hash >> 7) % 11) * 0.008; // 0.46..0.54
  const missingShareOfNegative = 1 - issueShareOfNegative;

  return [
    { type: 'suggestion', weight: positiveTarget * suggestionShareOfPositive },
    { type: 'works-well', weight: positiveTarget * worksWellShareOfPositive },
    { type: 'issue', weight: negativeTarget * issueShareOfNegative },
    { type: 'missing', weight: negativeTarget * missingShareOfNegative },
  ];
};
const pickWeightedFeedbackType = (weights) => {
  const roll = random();
  let threshold = 0;
  for (const entry of weights) {
    threshold += entry.weight;
    if (roll <= threshold) {
      return entry.type;
    }
  }
  return weights[weights.length - 1].type;
};
for (const area of appAreas) {
  const areaScreens = screensByApp[area.id] ?? [];
  const perScreen = allocateCounts(FEEDBACK_TOTAL_BY_APP[area.id] ?? 0, areaScreens.length);
  areaScreens.forEach((screen, screenIndex) => {
    const feedbackTypeWeights = buildFeedbackWeightsForScreen(screen);
    for (let i = 0; i < (perScreen[screenIndex] ?? 0); i += 1) {
      const type = pickWeightedFeedbackType(feedbackTypeWeights);
      const vocab = feedbackVocabulary[type];

      let baseText;
      if (type === 'issue') {
        const friction = vocab.friction[(feedbackCounter + i) % vocab.friction.length];
        const effect = vocab.effect[(feedbackCounter * 2 + screenIndex) % vocab.effect.length];
        const scenario = vocab.scenario[(feedbackCounter * 3 + i + screenIndex) % vocab.scenario.length];
        baseText = `${friction} on ${screen.name} ${effect} ${scenario}.`;
      } else if (type === 'suggestion') {
        const action = vocab.action[(feedbackCounter + i) % vocab.action.length];
        const benefit = vocab.benefit[(feedbackCounter * 2 + screenIndex) % vocab.benefit.length];
        const outcome = vocab.outcome[(feedbackCounter * 3 + i + screenIndex) % vocab.outcome.length];
        baseText = `${action} on ${screen.name} ${benefit} ${outcome}.`;
      } else if (type === 'missing') {
        const gap = vocab.gap[(feedbackCounter + i) % vocab.gap.length];
        const impact = vocab.impact[(feedbackCounter * 2 + screenIndex) % vocab.impact.length];
        const audience = vocab.audience[(feedbackCounter * 3 + i + screenIndex) % vocab.audience.length];
        baseText = `${gap} in ${screen.name}, ${impact} ${audience}.`;
      } else {
        const strength = vocab.strength[(feedbackCounter + i) % vocab.strength.length];
        const gain = vocab.gain[(feedbackCounter * 2 + screenIndex) % vocab.gain.length];
        const setting = vocab.setting[(feedbackCounter * 3 + i + screenIndex) % vocab.setting.length];
        baseText = `${strength} in ${screen.name} ${gain} ${setting}.`;
      }

      const text = uniqueText(baseText, feedbackTextSeen, feedbackFallback);
      feedbackRows.push({
        id: `sfb-${String(feedbackCounter).padStart(4, '0')}`,
        app: area.id,
        screenId: screen.id,
        screenName: screen.name,
        type,
        text,
        createdAt: new Date(feedbackSeedBase + feedbackCounter * 60000).toISOString(),
      });
      feedbackCounter += 1;
    }
  });
}

const write = (filename, rows) => {
  fs.writeFileSync(path.join(seedDir, filename), JSON.stringify(rows, null, 2) + '\n');
};

write('featureRequests.seed.json', featureRows);
write('kudos.seed.json', kudosRows);
write('screenFeedback.seed.json', feedbackRows);

console.log(JSON.stringify({
  featureRequests: featureRows.length,
  kudos: kudosRows.length,
  screenFeedback: feedbackRows.length,
}, null, 2));
