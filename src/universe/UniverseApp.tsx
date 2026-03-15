import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createOpenAIText, isOpenAIConfigured } from "../core/ai/openaiClient";
import { createAnthropicText, isAnthropicConfigured } from "../core/ai/anthropicClient";

type UniverseViewMode = "universe" | "cls";
type JourneyId =
  | "booking"
  | "inquiry"
  | "payoff"
  | "maintenance"
  | "renewal"
  | "collateral"
  | "scheduled"
  | "syndication"
  | "sysadmin"
  | "global"
  | "reporting"
  | "error";
type FeatureStatus = "design-complete" | "planned" | "future";
type OutcomeId = "farmerMac" | "migration" | "efficiency" | "compliance";
type SearchResult = {
  query: string;
  queryType: "company" | "capability";
  interpretation: string;
  insight: string;
  matchedIds: number[];
  scores: Record<string, number>;
  threshold: number;
};

interface Galaxy {
  id: string;
  label: string;
  shortLabel: string;
  angle: number;
  orbitR: number;
  galaxyR: number;
  color: string;
  accentColor: string;
  desc: string;
  clients: string;
  tag: string;
  starCount: number;
  wired: boolean;
}

interface JourneyDef {
  id: JourneyId;
  label: string;
  color: string;
}

interface OutcomeDef {
  id: OutcomeId;
  label: string;
  x: number;
  y: number;
  color: string;
}

interface Feature {
  id: number;
  clsv: string;
  name: string;
  journey: JourneyId;
  status: FeatureStatus;
  progress: number;
  orbit: 1 | 2 | 3;
  angle: number;
  size: number;
  effort: "XL" | "L" | "M" | "S";
  rank: string | null;
  impact: "high" | "med";
  eta: string;
  outcomes: OutcomeId[];
  desc: string;
  votes: number;
}

const FIS = {
  navy: "#012834",
  green: "#4BCD3E",
  cyan: "#3BCFF0",
  blue: "#285BC5",
  deepNav: "#1B1B6F",
  teal: "#009775",
  midNav: "#015B7E",
  amber: "#FFC845",
  red: "#FF1F3E",
  offWhite: "#F9F5F1",
  orange: "#FD8D62",
  purple: "#7B5EA7",
} as const;

type InstitutionAIProvider = "openai" | "anthropic";
const INSTITUTION_AI_PROVIDER: InstitutionAIProvider =
  String(import.meta.env.VITE_INSTITUTION_AI_PROVIDER ?? "openai").toLowerCase() === "anthropic"
    ? "anthropic"
    : "openai";

const INSTITUTION_MATCH_THRESHOLD = (() => {
  const parsed = Number(import.meta.env.VITE_INSTITUTION_MATCH_THRESHOLD ?? 0.6);
  if (!Number.isFinite(parsed)) return 0.6;
  return Math.max(0, Math.min(0.99, parsed));
})();

const STARS = Array.from({ length: 120 }, (_, i) => ({
  id: i,
  x: (i * 73 + 17) % 100,
  y: (i * 41 + 53) % 100,
  r: ((i * 7) % 14) * 0.1 + 0.3,
  op: ((i * 11) % 40) * 0.008 + 0.06,
  d: ((i * 3) % 80) * 0.1,
}));

const GALAXIES: Galaxy[] = [
  {
    id: "cls",
    label: "Commercial Loan\nServicing (CLS)",
    shortLabel: "CLS",
    angle: 210,
    orbitR: 310,
    galaxyR: 68,
    color: FIS.cyan,
    accentColor: FIS.teal,
    desc: "Premier commercial lending & syndicated loan servicing platform (formerly ACBS). Manages full loan lifecycle for global banks and specialty lenders — from booking to payoff, collateral, FX, and complex syndication structures.",
    clients: "200+ global institutions",
    tag: "FLAGSHIP",
    starCount: 22,
    wired: true,
  },
  {
    id: "ibs",
    label: "Integrated Banking\nService (IBS) Lending",
    shortLabel: "IBS",
    angle: 160,
    orbitR: 295,
    galaxyR: 62,
    color: FIS.green,
    accentColor: "#3aaa30",
    desc: "Premier core processing platform for community to large regional banks. Tightly integrated lending components supporting retail and commercial clients across digital and physical touchpoints.",
    clients: "1,000+ community & regional banks",
    tag: "CORE BANKING",
    starCount: 19,
    wired: false,
  },
  {
    id: "origination",
    label: "Origination +\nAssessment Solutions",
    shortLabel: "Origination",
    angle: 350,
    orbitR: 305,
    galaxyR: 60,
    color: FIS.amber,
    accentColor: "#e6a800",
    desc: "Commercial Loan Origination + Credit Assessment (formerly Ambit Optimist). 360° customer view, automated credit scoring, probability-of-default modeling, and digital self-service origination for SME to complex corporates.",
    clients: "Global banks & specialty lenders",
    tag: "FRONT OFFICE",
    starCount: 18,
    wired: false,
  },
  {
    id: "asset",
    label: "Asset + Auto\nFinance",
    shortLabel: "Asset Finance",
    angle: 30,
    orbitR: 290,
    galaxyR: 56,
    color: FIS.orange,
    accentColor: "#e07040",
    desc: "Single end-to-end platform for auto and equipment finance companies. Manages full contract lifecycle — origination, pricing, servicing, collections, and remarketing. Supports global multi-currency operations.",
    clients: "Auto & equipment financiers worldwide",
    tag: "ASSET FINANCE",
    starCount: 17,
    wired: false,
  },
  {
    id: "als",
    label: "Advanced Lending\nSolution (ALS)",
    shortLabel: "ALS",
    angle: 130,
    orbitR: 285,
    galaxyR: 48,
    color: FIS.blue,
    accentColor: "#4070d0",
    desc: "Flexible commercial lending platform purpose-built for community and regional financial institutions. Supports bilateral, participation, and small business lending with configurable workflows.",
    clients: "Community & mid-tier banks",
    tag: "COMMUNITY LENDING",
    starCount: 14,
    wired: false,
  },
  {
    id: "supplychain",
    label: "Supply Chain\nFinance",
    shortLabel: "Supply Chain",
    angle: 300,
    orbitR: 275,
    galaxyR: 42,
    color: FIS.teal,
    accentColor: "#007a5e",
    desc: "Receivables finance and supply chain funding platform. Supports reverse factoring, dynamic discounting, and inventory finance. AI-powered document processing reduces fraud risk for funders.",
    clients: "Banks & non-bank funders",
    tag: "TRADE FINANCE",
    starCount: 12,
    wired: false,
  },
  {
    id: "concierge",
    label: "FIS Lending\nConcierge",
    shortLabel: "Concierge",
    angle: 270,
    orbitR: 258,
    galaxyR: 32,
    color: FIS.purple,
    accentColor: "#9b7cbf",
    desc: "Managed services and advisory layer wrapping the FIS Lending portfolio. Provides implementation expertise, operational support, and strategic guidance to help clients accelerate time-to-value.",
    clients: "FIS lending clients globally",
    tag: "MANAGED SERVICES",
    starCount: 8,
    wired: false,
  },
  {
    id: "innovation",
    label: "Innovation\nin Lending",
    shortLabel: "Innovation",
    angle: 90,
    orbitR: 248,
    galaxyR: 28,
    color: FIS.red,
    accentColor: "#cc1832",
    desc: "Emerging technology incubator for next-generation lending. Encompasses AI-driven underwriting, generative AI loan document processing, embedded finance APIs, ESG lending integration, and fintech co-innovation partnerships.",
    clients: "Early adopters & innovation partners",
    tag: "EMERGING TECH",
    starCount: 7,
    wired: false,
  },
];

const GALAXY_SPEED: Record<string, number> = {
  cls: 0.0018,
  ibs: 0.0014,
  origination: 0.002,
  asset: 0.0016,
  als: 0.0022,
  supplychain: 0.0025,
  concierge: 0.003,
  innovation: 0.0035,
};

const CLS_JOURNEY_DEFS: JourneyDef[] = [
  { id: "booking", label: "Booking", color: FIS.green },
  { id: "inquiry", label: "Inquiry", color: FIS.cyan },
  { id: "payoff", label: "Pay Off", color: FIS.orange },
  { id: "maintenance", label: "Maintenance", color: FIS.teal },
  { id: "renewal", label: "Renewal/Mod", color: FIS.amber },
  { id: "collateral", label: "Collateral", color: FIS.blue },
  { id: "scheduled", label: "Sched. Servicing", color: "#50C8E8" },
  { id: "syndication", label: "Syndication", color: "#94b4c8" },
  { id: "sysadmin", label: "System Admin", color: FIS.amber },
  { id: "global", label: "Global Platform", color: FIS.cyan },
  { id: "reporting", label: "Reporting", color: "#7ED3F4" },
  { id: "error", label: "Error Handling", color: FIS.red },
];

const CLS_JCOLOR = Object.fromEntries(CLS_JOURNEY_DEFS.map((j) => [j.id, j.color])) as Record<JourneyId, string>;
const CLS_ORBIT_R: [number, number, number, number] = [0, 128, 220, 320];
const CLS_ORBIT_SPEED: Record<1 | 2 | 3, number> = { 1: 0.008, 2: 0.0045, 3: 0.0025 };
const CLS_ORBIT_COLOR = ["", FIS.green, FIS.cyan, FIS.blue] as const;
const CLS_EFFORT_COLOR = { XL: FIS.orange, L: FIS.cyan, M: FIS.green, S: FIS.amber } as const;
const CLS_STATUS_META: Record<FeatureStatus, { color: string; label: string }> = {
  "design-complete": { color: FIS.green, label: "✦ DESIGN COMPLETE" },
  planned: { color: FIS.cyan, label: "◎ PLANNED" },
  future: { color: FIS.blue, label: "○ BACKLOG" },
};

const CLS_VISION = [
  {
    num: "1",
    title: "Singular Front-End Experience",
    body: "Unified UI/UX across products creating a seamless E2E lender experience",
  },
  {
    num: "2",
    title: "Enterprise Lending Capabilities",
    body: "Common customer record enables 360° customer view & combined collateral management to see one risk profile across customers",
  },
  {
    num: "3",
    title: "An Integrated Ecosystem",
    body: "Single point integrations into FIS cores for native experiences with streamlined upgrades and modern API driven architecture",
  },
] as const;

const CLS_STRATEGIC_OUTCOMES: OutcomeDef[] = [];

const COMPANY_HINTS = ["bank", "lender", "finance", "credit", "institution", "wells fargo", "chase", "citi", "farmer mac"];
const CAPABILITY_HINTS = [
  "workflow",
  "tracking",
  "automation",
  "audit",
  "reporting",
  "collateral",
  "payoff",
  "billing",
  "amortization",
  "history",
  "controls",
  "servicing",
  "syndication",
  "compliance",
  "integration",
  "fees",
  "risk",
];
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
]);

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value: string): string[] => normalize(value).split(" ").filter(Boolean);
const importantTokens = (value: string): string[] => tokenize(value).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
const toSet = (items: string[]): Set<string> => new Set(items);
const overlapCount = (a: Set<string>, b: Set<string>): number => {
  let count = 0;
  for (const value of a) {
    if (b.has(value)) count += 1;
  }
  return count;
};
const makeBigrams = (tokens: string[]): string[] => {
  const grams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) grams.push(`${tokens[i]} ${tokens[i + 1]}`);
  return grams;
};
const parseSearchQueryInput = (
  raw: string,
): { query: string; forcedQueryType: "company" | "capability" | null } => {
  const trimmed = raw.trim();
  const companyPrefix = /^(company|institution)\s*:\s*/i;
  const capabilityPrefix = /^capability\s*:\s*/i;

  if (companyPrefix.test(trimmed)) {
    return { query: trimmed.replace(companyPrefix, "").trim(), forcedQueryType: "company" };
  }
  if (capabilityPrefix.test(trimmed)) {
    return { query: trimmed.replace(capabilityPrefix, "").trim(), forcedQueryType: "capability" };
  }
  return { query: trimmed, forcedQueryType: null };
};
const getConfiguredInstitutionProvider = (): InstitutionAIProvider | null => {
  if (INSTITUTION_AI_PROVIDER === "anthropic") {
    return isAnthropicConfigured() ? "anthropic" : null;
  }
  return isOpenAIConfigured() ? "openai" : null;
};

const FEATURES: Feature[] = [
  { id: 1, clsv: "CLSV-706", name: "Facility History", journey: "inquiry", status: "design-complete", progress: 90, orbit: 1, angle: 0, size: 18, effort: "M", rank: "1.5", impact: "high", eta: "Q2 2026", outcomes: ["efficiency", "compliance"], desc: "Deep-nav facility history ecosystem. Drill through Limit, Fee, Transaction, and Fee Accruals layers from a single view. Transforms static audit log into verifiable evidence for audits and client inquiries.", votes: 112 },
  { id: 2, clsv: "CLSV-751+714", name: "Payoff Event", journey: "payoff", status: "design-complete", progress: 88, orbit: 1, angle: 60, size: 19, effort: "L", rank: "1.5", impact: "high", eta: "Q2 2026", outcomes: ["migration", "efficiency"], desc: "Unified Payoff Quote + Process in a single screen. Tree-view record selection at sub-record granularity — select individual fees, sections, sublimits. Multi-currency totaling and manager submit.", votes: 98 },
  { id: 3, clsv: "CLSV-724", name: "Loan: Collateral", journey: "collateral", status: "design-complete", progress: 95, orbit: 1, angle: 120, size: 16, effort: "L", rank: "1", impact: "high", eta: "Q1 2026", outcomes: ["migration", "compliance"], desc: "Loan-level collateral management. Design complete — ready for engineering handoff. Covers full lifecycle of collateral records linked to loans, document attachments, and status tracking.", votes: 76 },
  { id: 4, clsv: "CLSV-693", name: "Facility: Collateral", journey: "collateral", status: "design-complete", progress: 85, orbit: 1, angle: 180, size: 16, effort: "L", rank: "1.5", impact: "high", eta: "Q2 2026", outcomes: ["migration", "compliance"], desc: "Facility-level collateral management. Covers ECC collateral records, cross-facility tracking, document attachment workflows at the facility tier.", votes: 61 },
  { id: 5, clsv: "CLSV-707", name: "Facility Invoices", journey: "booking", status: "design-complete", progress: 80, orbit: 1, angle: 240, size: 15, effort: "M", rank: "1", impact: "high", eta: "Q2 2026", outcomes: ["migration"], desc: "Facility-level invoice view and management. Includes accruing fee invoices, billing schedules, and re-bill/reverse capabilities.", votes: 54 },
  { id: 6, clsv: "CLSV-673", name: "Reference Repayment Schedules", journey: "booking", status: "design-complete", progress: 78, orbit: 1, angle: 300, size: 17, effort: "XL", rank: "2", impact: "high", eta: "Q2 2026", outcomes: ["migration", "efficiency"], desc: "Customer-level repayment schedule templates. CSV import, amortization calculator, manual grid entry. Satisfaction improved 5.4→9.3 after final redesign. Templates reusable across loans.", votes: 91 },
  { id: 7, clsv: "CLSV-876", name: "EIR Fees", journey: "booking", status: "planned", progress: 0, orbit: 2, angle: 20, size: 16, effort: "L", rank: "1", impact: "high", eta: "Q3 2026", outcomes: ["migration"], desc: "Configure EIR recalculation triggers. Fixed fees, income class mapping, GL daily amortization. Supports IFRS and US GAAP. Backdated recalculation with quarter/year-end effects.", votes: 74 },
  { id: 8, clsv: "CLSV-698", name: "ECC Collateral Controls", journey: "collateral", status: "planned", progress: 0, orbit: 2, angle: 80, size: 18, effort: "XL", rank: "1", impact: "high", eta: "Q3 2026", outcomes: ["migration", "compliance"], desc: "Three XL epics: ECC integration, collateral valuation controls, margin call workflows. Central control point for all external collateral system interactions.", votes: 88 },
  { id: 9, clsv: "CLSV-863", name: "Loan History Views", journey: "inquiry", status: "planned", progress: 0, orbit: 2, angle: 140, size: 14, effort: "M", rank: "1", impact: "high", eta: "Q3 2026", outcomes: ["efficiency", "compliance"], desc: "Deep loan-level history matching Facility History depth. Loan-specific Transaction and Accrual tabs with date-range filtering and export.", votes: 53 },
  { id: 10, clsv: "CLSV-738", name: "Trouble Asset Manager", journey: "maintenance", status: "planned", progress: 0, orbit: 2, angle: 200, size: 17, effort: "XL", rank: "1", impact: "high", eta: "Q3 2026", outcomes: ["migration", "efficiency"], desc: "Manage non-performing and watch-list loans. Workflow routing and status tracking for troubled assets. Configurable escalation paths and override controls.", votes: 67 },
  { id: 11, clsv: "CLSV-754", name: "Assignment Manager", journey: "booking", status: "planned", progress: 0, orbit: 2, angle: 250, size: 15, effort: "XL", rank: "1.5", impact: "high", eta: "Q4 2026", outcomes: ["migration"], desc: "Full loan assignment workflow. Supports partial assignments, syndication links, audit trail, and agent bank management.", votes: 59 },
  { id: 12, clsv: "CLSV-752", name: "FX Rate Controls", journey: "booking", status: "planned", progress: 0, orbit: 2, angle: 320, size: 13, effort: "M", rank: "1", impact: "med", eta: "Q4 2026", outcomes: ["migration", "efficiency"], desc: "Three-epic FX control suite: rate group management, multi-currency conversion, rate override workflow with effective date handling.", votes: 41 },
  { id: 13, clsv: "CLSV-689", name: "Cross-Limit Controls", journey: "booking", status: "future", progress: 0, orbit: 3, angle: 15, size: 15, effort: "XL", rank: "2", impact: "high", eta: "Q1 2027", outcomes: ["migration", "compliance"], desc: "Aggregated limit management across facilities. Shared limit pools with real-time utilization reporting and breach alerts.", votes: 45 },
  { id: 14, clsv: "CLSV-732", name: "Collateral Doc Tracker", journey: "collateral", status: "future", progress: 0, orbit: 3, angle: 55, size: 13, effort: "L", rank: "1", impact: "med", eta: "Q1 2027", outcomes: ["compliance"], desc: "Document intake and tracking for collateral records. Expiry alerts, renewal workflows, and audit-ready document chains.", votes: 38 },
  { id: 15, clsv: "CLSV-680", name: "Customer Flowdown & Pooling", journey: "booking", status: "future", progress: 0, orbit: 3, angle: 95, size: 13, effort: "L", rank: "1", impact: "med", eta: "Q2 2027", outcomes: ["migration", "efficiency"], desc: "Propagate customer-level changes across linked deals and facilities. Customer-level limit pooling with inheritance rules.", votes: 31 },
  { id: 16, clsv: "CLSV-712", name: "Pro Rata & SNC Reporting", journey: "inquiry", status: "future", progress: 0, orbit: 3, angle: 135, size: 12, effort: "M", rank: "2", impact: "med", eta: "Q2 2027", outcomes: ["compliance"], desc: "Shared national credit reporting suite. Pro rata calculations and SNC exam export format.", votes: 28 },
  { id: 17, clsv: "CLSV-726", name: "Escrow, SBA & Re-Amort", journey: "scheduled", status: "future", progress: 0, orbit: 3, angle: 175, size: 13, effort: "M", rank: "1", impact: "med", eta: "Q2 2027", outcomes: ["migration", "efficiency"], desc: "Three servicing workflows unified: escrow account management, SBA loan handling, and re-amortization event processing.", votes: 36 },
  { id: 18, clsv: "CLSV-E-116", name: "System Admin Suite", journey: "sysadmin", status: "future", progress: 0, orbit: 3, angle: 215, size: 18, effort: "XL", rank: null, impact: "high", eta: "TBD", outcomes: ["migration"], desc: "35 epics. Full admin configuration surface: user management, table maintenance, system parameters, permission matrices, and integration configuration.", votes: 55 },
  { id: 19, clsv: "CLSV-676", name: "Customer Risk & Credit", journey: "booking", status: "future", progress: 0, orbit: 3, angle: 255, size: 14, effort: "L", rank: "3", impact: "med", eta: "Q3 2027", outcomes: ["migration", "compliance"], desc: "Customer-level risk ratings, credit limit management, covenant tracking, and risk-grade change workflows.", votes: 33 },
  { id: 20, clsv: "CLSV-E-114", name: "Renewal / Mod / Amendments", journey: "renewal", status: "future", progress: 0, orbit: 3, angle: 295, size: 17, effort: "XL", rank: "2", impact: "high", eta: "Q3 2027", outcomes: ["migration", "efficiency"], desc: "Full hero journey: loan renewals, modifications, and amendment workflows end-to-end. Largest unscoped journey after Syndication.", votes: 62 },
  { id: 21, clsv: "CLSV-E-119", name: "Syndication", journey: "syndication", status: "future", progress: 0, orbit: 3, angle: 335, size: 14, effort: "XL", rank: null, impact: "high", eta: "TBD", outcomes: ["migration"], desc: "Full syndication hero journey. Scope TBD — 0 epics currently defined. Placeholder for strategic roadmap alignment.", votes: 48 },
];

const FEATURE_SEARCH_DOCS = FEATURES.map((feature) => {
  const nameTokens = importantTokens(feature.name);
  const descTokens = importantTokens(feature.desc);
  const journeyTokens = importantTokens(feature.journey);
  const outcomeTokens = feature.outcomes.map((x) => x.toLowerCase());
  const allTokens = [...nameTokens, ...descTokens, ...journeyTokens, ...outcomeTokens];
  return {
    id: feature.id,
    nameText: normalize(feature.name),
    descText: normalize(feature.desc),
    nameSet: toSet(nameTokens),
    descSet: toSet(descTokens),
    journeySet: toSet(journeyTokens),
    outcomeSet: toSet(outcomeTokens),
    allSet: toSet(allTokens),
  };
});

const FEATURE_TOKEN_IDF = (() => {
  const docFreq = new Map<string, number>();
  FEATURE_SEARCH_DOCS.forEach((doc) => {
    doc.allSet.forEach((token) => {
      docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    });
  });
  const total = FEATURE_SEARCH_DOCS.length;
  const idf = new Map<string, number>();
  docFreq.forEach((df, token) => {
    idf.set(token, Math.log((total + 1) / (df + 1)) + 1);
  });
  return idf;
})();

function ProgressArc({ cx, cy, r, pct, color }: { cx: number; cy: number; r: number; pct: number; color: string }) {
  if (pct <= 0) return null;
  if (pct >= 1) return <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={2} />;
  const a = pct * 2 * Math.PI - Math.PI / 2;
  const x2 = cx + r * Math.cos(a);
  const y2 = cy + r * Math.sin(a);
  return (
    <path
      d={`M ${cx} ${cy - r} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${x2} ${y2}`}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

function galaxyStars(g: Galaxy, cx: number, cy: number) {
  const pts: Array<{ x: number; y: number; r: number; op: number }> = [];
  for (let i = 0; i < g.starCount; i += 1) {
    const seed = (g.id.charCodeAt(0) * 7 + i * 31) % 100;
    const angle = (i / g.starCount) * Math.PI * 2 + seed * 0.1;
    const dist = g.galaxyR * 0.45 + (seed / 100) * g.galaxyR * 0.85;
    pts.push({
      x: cx + dist * Math.cos(angle),
      y: cy + dist * Math.sin(angle),
      r: 0.5 + (seed % 10) * 0.12,
      op: 0.3 + (seed % 6) * 0.08,
    });
  }
  return pts;
}

const inferLocalQueryType = (q: string): "company" | "capability" => {
  const normalized = normalize(q);
  const tokens = tokenize(q);
  const capabilityHit = CAPABILITY_HINTS.some((hint) => normalized.includes(hint));
  const companyHit = COMPANY_HINTS.some((hint) => normalized.includes(hint));

  if (capabilityHit && tokens.length >= 2) return "capability";
  if (companyHit && tokens.length <= 3 && !capabilityHit) return "company";
  if (tokens.length >= 4) return "capability";
  return companyHit ? "company" : "capability";
};

const buildCapabilityScores = (q: string): Record<string, number> => {
  const normalizedQuery = normalize(q);
  const qTokens = importantTokens(q);
  const qSet = toSet(qTokens);
  const qBigrams = toSet(makeBigrams(qTokens));
  const singleToken = qTokens.length === 1 ? qTokens[0] : null;
  const scores: Record<string, number> = {};

  FEATURE_SEARCH_DOCS.forEach((doc) => {
    let raw = 0;

    const nameOverlap = overlapCount(qSet, doc.nameSet);
    const descOverlap = overlapCount(qSet, doc.descSet);
    const journeyOverlap = overlapCount(qSet, doc.journeySet);
    const outcomeOverlap = overlapCount(qSet, doc.outcomeSet);

    raw += nameOverlap * 0.38;
    raw += descOverlap * 0.2;
    raw += journeyOverlap * 0.18;
    raw += outcomeOverlap * 0.16;

    let idfScore = 0;
    qSet.forEach((token) => {
      if (doc.allSet.has(token)) idfScore += FEATURE_TOKEN_IDF.get(token) ?? 0;
    });
    raw += Math.min(0.9, idfScore * 0.07);

    const docBigrams = toSet(makeBigrams(importantTokens(`${doc.nameText} ${doc.descText}`)));
    const bigramOverlap = overlapCount(qBigrams, docBigrams);
    raw += bigramOverlap * 0.32;

    // Short, exact capability terms (e.g. "escrow") should strongly match feature titles.
    if (singleToken) {
      if (doc.nameSet.has(singleToken)) raw += 0.95;
      if (doc.descSet.has(singleToken)) raw += 0.28;
      if (doc.journeySet.has(singleToken)) raw += 0.22;
    }

    if (normalizedQuery.length >= 8 && doc.nameText.includes(normalizedQuery)) raw += 0.45;
    if (normalizedQuery.length >= 10 && doc.descText.includes(normalizedQuery)) raw += 0.3;

    const relevance = Math.max(0, Math.min(0.99, 1 - Math.exp(-raw * 0.42)));
    scores[String(doc.id)] = relevance;
  });

  return scores;
};

const buildCompanyScores = (q: string): Record<string, number> => {
  const normalized = normalize(q);
  const tokens = importantTokens(q);
  const scores: Record<string, number> = {};

  FEATURES.forEach((f) => {
    const hay = `${f.name} ${f.desc} ${f.journey}`.toLowerCase();
    let score = 0;
    if (hay.includes(normalized)) score += 0.54;
    tokens.forEach((t) => {
      if (f.name.toLowerCase().includes(t)) score += 0.16;
      if (f.desc.toLowerCase().includes(t)) score += 0.08;
    });
    if (normalized.includes("farmer mac") && f.outcomes.includes("farmerMac")) score += 0.24;
    if (normalized.includes("collateral") && f.journey === "collateral") score += 0.2;
    if (normalized.includes("payoff") && f.journey === "payoff") score += 0.2;
    if (normalized.includes("report") && f.journey === "reporting") score += 0.2;
    scores[String(f.id)] = Math.min(0.99, score);
  });

  return scores;
};

const buildLocalSearchResult = (
  q: string,
  forcedQueryType?: "company" | "capability",
): SearchResult => {
  const queryType = forcedQueryType ?? inferLocalQueryType(q);
  const scores = queryType === "capability" ? buildCapabilityScores(q) : buildCompanyScores(q);
  const threshold = queryType === "capability" ? 0.38 : 0.4;

  const matchedIds = FEATURES.map((f) => ({ id: f.id, s: scores[String(f.id)] || 0 }))
    .filter((x) => x.s >= threshold)
    .sort((a, b) => b.s - a.s)
    .slice(0, 10)
    .map((x) => x.id);

  const localResult: SearchResult = {
    query: q,
    queryType,
    interpretation:
      queryType === "company"
        ? `Mapped company intent to ${matchedIds.length} roadmap features.`
        : `Matched capability intent against ${FEATURES.length} roadmap features; returning top ${matchedIds.length}.`,
    insight:
      matchedIds.length > 0
        ? "Top matches are ranked by weighted semantic relevance across feature names, journeys, and descriptions."
        : "No features exceeded the relevance threshold for this capability query.",
    matchedIds,
    scores,
    threshold,
  };

  console.debug("[buildLocalSearchResult] return", localResult);
  return localResult;
};

const parseJsonPayload = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const jsonOnly = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(jsonOnly);
};

const buildInstitutionAISearchResult = async (
  q: string,
  provider: InstitutionAIProvider,
): Promise<SearchResult> => {
  const featureDigest = FEATURES.map((f) => ({
    id: f.id,
    name: f.name,
    journey: f.journey,
    outcomes: f.outcomes,
    desc: f.desc,
    votes: f.votes,
  }));

  const messages = [
    {
      role: "system" as const,
      content: [
        "You map institution capabilities to CLS roadmap features.",
        "Return strict JSON only. No markdown. No prose outside JSON.",
        "For institution queries, infer likely lending/servicing products, capabilities, workflows, and operational priorities for that institution.",
        "Then compare that inferred capability set to the provided CLS feature list and rank relevance.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        "Task: determine whether query intent is 'company' or 'capability'.",
        "If query is a company/institution, infer products and capabilities first, then map to features.",
        "If query is capability keywords, map those directly.",
        "",
        `Query: ${q}`,
        "",
        "Return JSON with this exact shape:",
        "{",
        '  "query_type": "company" | "capability",',
        '  "interpretation": "string",',
        '  "insight": "string",',
        '  "matches": [',
        '    { "id": number, "relevance": number }',
        "  ]",
        "}",
        "",
        "Rules:",
        "- relevance is 0.0 to 0.99",
        "- include up to 10 matches",
        "- id must come from provided features only",
        "- for institution queries, prioritize realistic operational fit over keyword overlap",
        "- do not invent features",
        "- penalize weak/broad associations",
        "",
        "Confidence guidance:",
        "- 0.80-0.99: direct day-to-day workflow fit",
        "- 0.60-0.79: strong adjacent fit",
        "- 0.40-0.59: partial relevance",
        "- below 0.40: weak",
        "",
        `Features: ${JSON.stringify(featureDigest)}`,
      ].join("\n"),
    },
  ];

  const response =
    provider === "anthropic"
      ? await createAnthropicText({ messages, maxOutputTokens: 700, temperature: 0.1 })
      : await createOpenAIText({ messages, maxOutputTokens: 700, temperature: 0.1 });

  const payload = parseJsonPayload(response.text) as {
    query_type?: "company" | "capability";
    interpretation?: string;
    insight?: string;
    matches?: Array<{ id?: number; relevance?: number }>;
  } | null;

  if (!payload || !Array.isArray(payload.matches)) {
    throw new Error("Invalid institution AI search response.");
  }

  const scores: Record<string, number> = {};
  const validIds = new Set(FEATURES.map((f) => f.id));
  const matches = payload.matches
    .filter((item) => typeof item.id === "number" && validIds.has(item.id))
    .map((item) => {
      const relevance = typeof item.relevance === "number" ? Math.max(0, Math.min(0.99, item.relevance)) : 0;
      return { id: item.id as number, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance);

  for (const match of matches) {
    scores[String(match.id)] = match.relevance;
  }

  const filteredMatches = matches.filter((item) => item.relevance >= INSTITUTION_MATCH_THRESHOLD).slice(0, 10);

  return {
    query: q,
    queryType: payload.query_type === "company" ? "company" : "capability",
    interpretation:
      payload.interpretation?.trim() ||
      `Mapped ${payload.query_type === "company" ? "company" : "capability"} intent to ${filteredMatches.length} roadmap features.`,
    insight:
      payload.insight?.trim() ||
      (filteredMatches.length > 0
        ? "Top matches align with CLS roadmap areas most relevant to the request."
        : "No strong semantic match found; broaden your search terms."),
    matchedIds: filteredMatches.map((item) => item.id),
    scores,
    threshold: INSTITUTION_MATCH_THRESHOLD,
  };
};

function SearchOverlay({
  onClose,
  onResults,
}: {
  onClose: () => void;
  onResults: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (): Promise<void> => {
    const { query: parsedQuery, forcedQueryType } = parseSearchQueryInput(query);
    const q = parsedQuery.trim();
    if (!q) return;
    setLoading(true);
    setError(null);

    try {
      let result: SearchResult;
      const queryType = forcedQueryType ?? inferLocalQueryType(q);
      if (queryType === "capability") {
        result = buildLocalSearchResult(q, "capability");
      } else {
        const provider = getConfiguredInstitutionProvider();
        if (provider) {
          try {
            result = await buildInstitutionAISearchResult(q, provider);
          } catch {
            result = buildLocalSearchResult(q, "company");
          }
        } else {
          result = buildLocalSearchResult(q, "company");
        }
      }

      onResults(result);
      onClose();
    } catch {
      setError("Search unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(1,40,52,0.88)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 560,
          background: FIS.navy,
          border: `1px solid ${FIS.green}33`,
          borderRadius: 4,
          boxShadow: "0 32px 80px #00000099",
          padding: "32px 32px 28px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div
              style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 22,
                fontWeight: 800,
                color: "#fff",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Search CLS Features
            </div>
            <div style={{ fontFamily: "'Source Sans 3',sans-serif", fontSize: 13, color: `${FIS.offWhite}55`, marginTop: 4 }}>
              Enter a company name or describe capabilities you need
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: `${FIS.offWhite}40`, fontSize: 20, cursor: "pointer" }}>
            ✕
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {["e.g. Farmer Mac", "e.g. collateral tracking", "e.g. audit trail", "e.g. loan payoff workflow"].map(
            (example) => (
              <div
                key={example}
                onClick={() => setQuery(example)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 2,
                  cursor: "pointer",
                  background: `${FIS.green}12`,
                  border: `1px solid ${FIS.green}25`,
                  color: `${FIS.green}88`,
                  fontSize: 10.5,
                  fontFamily: "'Source Sans 3',sans-serif",
                }}
              >
                {example}
              </div>
            ),
          )}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Company name or capability description…"
            style={{
              flex: 1,
              background: `${FIS.midNav}88`,
              border: `1px solid ${FIS.green}33`,
              borderRadius: 3,
              padding: "11px 14px",
              fontSize: 14,
              color: FIS.offWhite,
              fontFamily: "'Source Sans 3',sans-serif",
              outline: "none",
            }}
          />
          <button
            onClick={() => void runSearch()}
            disabled={loading || !query.trim()}
            style={{
              padding: "11px 24px",
              background: loading ? `${FIS.green}44` : FIS.green,
              border: "none",
              borderRadius: 3,
              color: FIS.navy,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'Source Sans 3',sans-serif",
              cursor: loading ? "wait" : "pointer",
              letterSpacing: 1,
            }}
          >
            {loading ? "…" : "Search"}
          </button>
        </div>
        {error && <div style={{ color: FIS.red, fontSize: 12, fontFamily: "'Source Sans 3',sans-serif", marginBottom: 8 }}>{error}</div>}
      </div>
    </div>
  );
}

function VisionPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%,-50%)",
        width: 420,
        zIndex: 300,
        background: `linear-gradient(160deg,${FIS.midNav} 0%,${FIS.navy} 100%)`,
        border: `1px solid ${FIS.green}30`,
        borderRadius: 4,
        boxShadow: "0 24px 64px #00000099",
        padding: "28px 28px 24px",
        animation: "visionFade 0.28s cubic-bezier(.22,1,.36,1) both",
      }}
    >
      <button
        onClick={onClose}
        style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", color: `${FIS.offWhite}35`, fontSize: 18, cursor: "pointer" }}
      >
        ✕
      </button>
      <div style={{ fontSize: 9.5, letterSpacing: 3.5, color: FIS.green, fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
        CLS UI Modernization
      </div>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: 0.5, lineHeight: 1.1, marginBottom: 6, textTransform: "uppercase" }}>
        The CLS Vision
      </div>
      <div style={{ height: 2, width: 48, background: `linear-gradient(90deg,${FIS.green},${FIS.cyan})`, marginBottom: 24, borderRadius: 1 }} />
      {CLS_VISION.map((item, i) => (
        <div
          key={item.num}
          style={{
            display: "flex",
            gap: 16,
            marginBottom: i < CLS_VISION.length - 1 ? 20 : 0,
            paddingBottom: i < CLS_VISION.length - 1 ? 20 : 0,
            borderBottom: i < CLS_VISION.length - 1 ? `1px solid ${FIS.offWhite}0e` : "none",
          }}
        >
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 36, fontWeight: 800, color: FIS.green, lineHeight: 1, minWidth: 28, paddingTop: 2 }}>{item.num}</div>
          <div>
            <div style={{ fontFamily: "'Source Sans 3',sans-serif", fontSize: 15, fontWeight: 700, color: FIS.green, marginBottom: 5, lineHeight: 1.25 }}>{item.title}</div>
            <div style={{ fontFamily: "'Source Sans 3',sans-serif", fontSize: 13, color: `${FIS.offWhite}cc`, lineHeight: 1.6 }}>{item.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GalaxyInfoPanel({
  galaxy,
  onClose,
  onZoomIn,
}: {
  galaxy: Galaxy | undefined;
  onClose: () => void;
  onZoomIn: () => void;
}) {
  if (!galaxy) return null;
  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: "50%",
        transform: "translateY(-50%)",
        width: 300,
        background: `linear-gradient(160deg,${FIS.midNav}ee 0%,${FIS.navy}f8 100%)`,
        border: `1px solid ${galaxy.color}30`,
        borderRadius: 4,
        padding: "24px 22px 20px",
        zIndex: 200,
        boxShadow: "0 20px 56px #00000099",
        backdropFilter: "blur(20px)",
        animation: "panelIn 0.25s cubic-bezier(.22,1,.36,1) both",
      }}
    >
      <button onClick={onClose} style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: `${FIS.offWhite}30`, fontSize: 16, cursor: "pointer" }}>
        ✕
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: galaxy.color, boxShadow: `0 0 8px ${galaxy.color}88` }} />
        <div style={{ fontSize: 9, letterSpacing: 3, color: galaxy.color, fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600, textTransform: "uppercase" }}>{galaxy.tag}</div>
      </div>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: 0.5, lineHeight: 1.1, marginBottom: 4, textTransform: "uppercase" }}>
        {galaxy.shortLabel}
      </div>
      <div style={{ height: 2, width: 40, background: `linear-gradient(90deg,${galaxy.color},transparent)`, marginBottom: 14, borderRadius: 1 }} />
      <p style={{ fontSize: 12.5, color: `${FIS.offWhite}cc`, lineHeight: 1.7, marginBottom: 16, fontFamily: "'Source Sans 3',sans-serif" }}>{galaxy.desc}</p>
      <div style={{ padding: "8px 12px", background: `${galaxy.color}0d`, border: `1px solid ${galaxy.color}20`, borderRadius: 3, marginBottom: 16 }}>
        <div style={{ fontSize: 9, letterSpacing: 2, color: `${galaxy.color}77`, fontFamily: "'Source Sans 3',sans-serif", marginBottom: 3 }}>CLIENT REACH</div>
        <div style={{ fontSize: 12, color: galaxy.color, fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600 }}>{galaxy.clients}</div>
      </div>
      {galaxy.wired ? (
        <button onClick={onZoomIn} style={{ width: "100%", background: `${galaxy.color}18`, border: `1px solid ${galaxy.color}55`, color: galaxy.color, padding: "11px 0", borderRadius: 3, fontSize: 11, letterSpacing: 2, cursor: "pointer", fontFamily: "'Source Sans 3',sans-serif", fontWeight: 700 }}>
          ◎ EXPLORE PRODUCT ROADMAP →
        </button>
      ) : (
        <div style={{ width: "100%", textAlign: "center", border: `1px dashed ${galaxy.color}22`, color: `${FIS.offWhite}22`, padding: "11px 0", borderRadius: 3, fontSize: 11, letterSpacing: 2, fontFamily: "'Source Sans 3',sans-serif" }}>
          ROADMAP COMING SOON
        </div>
      )}
    </div>
  );
}

function FeaturePanel({
  sel,
  onClose,
  votes,
  votedIds,
  onVote,
  searchResult,
}: {
  sel: Feature | null;
  onClose: () => void;
  votes: Record<number, number>;
  votedIds: Set<number>;
  onVote: (id: number) => void;
  searchResult: SearchResult | null;
}) {
  if (!sel) return null;
  const c = CLS_JCOLOR[sel.journey] ?? FIS.offWhite;
  const st = CLS_STATUS_META[sel.status];
  const voted = votedIds.has(sel.id);
  const relevance = searchResult?.scores?.[String(sel.id)] ?? null;
  return (
    <div
      className="panel"
      style={{
        position: "fixed",
        right: 16,
        top: "50%",
        transform: "translateY(-50%)",
        width: 296,
        background: `linear-gradient(160deg,${FIS.midNav}ee 0%,${FIS.navy}f8 100%)`,
        border: `1px solid ${c}2a`,
        borderRadius: 4,
        padding: "22px 20px 20px",
        zIndex: 200,
        boxShadow: "0 20px 56px #00000099",
        backdropFilter: "blur(20px)",
        maxHeight: "90vh",
        overflowY: "auto",
      }}
    >
      <button onClick={onClose} style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: `${FIS.offWhite}30`, fontSize: 16, cursor: "pointer" }}>
        ✕
      </button>
      <div style={{ fontSize: 9, letterSpacing: 2.5, color: `${c}88`, fontFamily: "'Source Sans 3',sans-serif", marginBottom: 4, fontWeight: 600 }}>
        {sel.clsv} · {CLS_JOURNEY_DEFS.find((j) => j.id === sel.journey)?.label.toUpperCase()}
      </div>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: 0.5, lineHeight: 1.15, marginBottom: 4 }}>{sel.name}</div>
      <div style={{ fontSize: 10, color: `${FIS.offWhite}44`, marginBottom: 12, letterSpacing: 1.5, fontFamily: "'Source Sans 3',sans-serif" }}>
        {sel.eta} · Rank {sel.rank ?? "TBD"} · {sel.effort} Effort
      </div>
      {relevance != null && (
        <div style={{ marginBottom: 12, padding: "7px 10px", background: `${c}0e`, border: `1px solid ${c}22`, borderRadius: 3, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: c, fontFamily: "'Barlow Condensed',sans-serif", lineHeight: 1 }}>{Math.round(relevance * 100)}%</div>
          <div style={{ fontSize: 10.5, color: `${FIS.offWhite}88`, fontFamily: "'Source Sans 3',sans-serif", lineHeight: 1.4 }}>
            relevance for<br />
            <span style={{ color: c, fontWeight: 600 }}>"{searchResult?.query}"</span>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <span style={{ padding: "3px 10px", borderRadius: 2, fontSize: 9.5, letterSpacing: 1.5, fontWeight: 600, background: `${st.color}1a`, border: `1px solid ${st.color}33`, color: st.color, fontFamily: "'Source Sans 3',sans-serif" }}>{st.label}</span>
      </div>
      <div style={{ height: 1, background: `linear-gradient(90deg,${c}55,${c}11)`, marginBottom: 12 }} />
      <p style={{ fontSize: 12.5, color: `${FIS.offWhite}cc`, lineHeight: 1.7, marginBottom: 14, fontFamily: "'Source Sans 3',sans-serif" }}>{sel.desc}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: `${FIS.offWhite}28`, marginBottom: 2, fontFamily: "'Source Sans 3',sans-serif" }}>VOTES</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28, fontWeight: 700, color: c, lineHeight: 1 }}>{votes[sel.id]}</div>
        </div>
        <button
          disabled={voted}
          onClick={(e) => {
            e.stopPropagation();
            onVote(sel.id);
          }}
          style={{
            background: voted ? "transparent" : `${c}1a`,
            border: `1px solid ${c}${voted ? "22" : "55"}`,
            color: voted ? `${c}44` : c,
            padding: "8px 18px",
            borderRadius: 3,
            fontSize: 10,
            letterSpacing: 2,
            cursor: voted ? "not-allowed" : "pointer",
            fontFamily: "'Source Sans 3',sans-serif",
            fontWeight: 600,
          }}
        >
          {voted ? "✓ VOTED" : "↑ VOTE"}
        </button>
      </div>
      {(() => {
        const matchedOutcomes = sel.outcomes
          .map((oid) => CLS_STRATEGIC_OUTCOMES.find((x) => x.id === oid))
          .filter((outcome): outcome is OutcomeDef => Boolean(outcome));
        if (matchedOutcomes.length === 0) {
          return null;
        }
        return (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: `${FIS.offWhite}33`, marginBottom: 6, fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600 }}>STRATEGIC OUTCOMES</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {matchedOutcomes.map((o) => (
                <span key={o.id} style={{ fontSize: 9, padding: "3px 9px", borderRadius: 2, background: `${o.color}14`, border: `1px solid ${o.color}30`, color: o.color, letterSpacing: 0.5, fontFamily: "'Source Sans 3',sans-serif" }}>
                  {o.label}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function CLSGalaxyView({ onBack }: { onBack: () => void }) {
  const CLS_CENTER_X = 485;
  const CLS_CENTER_Y = 360;
  const [journeyFilter, setJourney] = useState<"all" | JourneyId>("all");
  const [orbitFilter, setOrbit] = useState<0 | 1 | 2 | 3>(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [showVision, setVision] = useState(false);
  const [showSearch, setSearch] = useState(false);
  const [searchResult, setResult] = useState<SearchResult | null>(null);
  const [angles, setAngles] = useState<Record<number, number>>(() =>
    Object.fromEntries(FEATURES.map((f) => [f.id, f.angle])) as Record<number, number>,
  );
  const [votes, setVotes] = useState<Record<number, number>>(() =>
    Object.fromEntries(FEATURES.map((f) => [f.id, f.votes])) as Record<number, number>,
  );
  const [votedIds, setVotedIds] = useState<Set<number>>(new Set());
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (!animating) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
      return;
    }
    const tick = (t: number) => {
      if (lastRef.current != null) {
        const dt = t - lastRef.current;
        setAngles((prev) => {
          const n = { ...prev };
          FEATURES.forEach((f) => {
            n[f.id] = (prev[f.id] + CLS_ORBIT_SPEED[f.orbit] * dt * 0.055) % 360;
          });
          return n;
        });
      }
      lastRef.current = t;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [animating]);

  const pos = (f: Feature): { x: number; y: number } => {
    const rad = (angles[f.id] * Math.PI) / 180;
    return {
      x: CLS_CENTER_X + CLS_ORBIT_R[f.orbit] * Math.cos(rad),
      y: CLS_CENTER_Y + CLS_ORBIT_R[f.orbit] * Math.sin(rad),
    };
  };

  const isSearchActive = Boolean(searchResult && searchResult.matchedIds.length > 0);
  const activeThreshold = searchResult?.threshold ?? 0.4;
  const isVisible = (f: Feature): boolean => {
    if (isSearchActive) return true;
    return (journeyFilter === "all" || f.journey === journeyFilter) && (orbitFilter === 0 || f.orbit === orbitFilter);
  };

  const selectedFeature = selected != null ? FEATURES.find((f) => f.id === selected) ?? null : null;
  const getRelevance = (id: number): number | null => searchResult?.scores?.[String(id)] ?? null;

  return (
    <div style={{ background: FIS.navy, minHeight: "100vh", fontFamily: "'Source Sans 3','Segoe UI',sans-serif", color: FIS.offWhite, overflow: "hidden", position: "relative" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }} aria-hidden>
        <defs>
          <radialGradient id="c-nb-tl" cx="5%" cy="8%" r="25%">
            <stop offset="0%" stopColor={FIS.midNav} stopOpacity="0.12" />
            <stop offset="100%" stopColor={FIS.navy} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="c-nb-br" cx="95%" cy="92%" r="22%">
            <stop offset="0%" stopColor={FIS.deepNav} stopOpacity="0.1" />
            <stop offset="100%" stopColor={FIS.navy} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#c-nb-tl)" />
        <rect width="100%" height="100%" fill="url(#c-nb-br)" />
        {STARS.map((s) => (
          <circle
            key={s.id}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.r}
            fill="#fff"
            opacity={s.op}
            style={{
              "--op": s.op,
              animation: animating ? `twinkle ${3 + s.d}s ease-in-out infinite` : "none",
              animationDelay: `${s.d}s`,
            } as CSSProperties}
          />
        ))}
      </svg>

      <div style={{ position: "relative", zIndex: 10, padding: "18px 28px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: `1px solid ${FIS.green}18`, gap: 16 }}>
        <div style={{ flex: "0 0 auto" }}>
          <button onClick={onBack} style={{ background: "transparent", border: `1px solid ${FIS.cyan}33`, color: FIS.cyan, padding: "6px 14px", borderRadius: 3, fontSize: 10, letterSpacing: 1.5, cursor: "pointer", fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            ← BACK TO FIS LENDING UNIVERSE
          </button>
          <h1 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: 2, lineHeight: 1, textTransform: "uppercase", color: "#ffffff" }}>Product Roadmap Galaxy</h1>
          <div style={{ fontSize: 11.5, color: `${FIS.offWhite}55`, marginTop: 3, fontFamily: "'Source Sans 3',sans-serif", fontWeight: 300, letterSpacing: 0.5 }}>12 Hero Journeys · 202 Epics · 72 Released · 21 Features Charted</div>
        </div>
        <div style={{ flex: "1 1 auto", maxWidth: 380, display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
          <div style={{ width: "100%" }}>
            <div style={{ width: "100%", display: "flex", gap: 0 }}>
              <input
                readOnly
                onClick={() => setSearch(true)}
                placeholder="Search by company or capability…"
                value={searchResult ? `"${searchResult.query}"` : ""}
                style={{
                  flex: 1,
                  background: `${FIS.midNav}55`,
                  borderStyle: "solid",
                  borderWidth: 1,
                  borderColor: searchResult ? `${FIS.green}66` : `${FIS.green}22`,
                  borderRightWidth: 0,
                  borderRadius: "3px 0 0 3px",
                  padding: "9px 14px",
                  fontSize: 13,
                  color: searchResult ? FIS.green : `${FIS.offWhite}44`,
                  fontFamily: "'Source Sans 3',sans-serif",
                  cursor: "pointer",
                  outline: "none",
                }}
              />
              <button
                onClick={() => {
                  if (searchResult) setResult(null);
                  else setSearch(true);
                }}
                style={{
                  padding: "9px 16px",
                  background: searchResult ? `${FIS.amber}22` : `${FIS.green}18`,
                  border: `1px solid ${searchResult ? `${FIS.amber}44` : `${FIS.green}33`}`,
                  borderRadius: "0 3px 3px 0",
                  color: searchResult ? FIS.amber : FIS.green,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'Source Sans 3',sans-serif",
                  cursor: "pointer",
                  letterSpacing: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {searchResult ? "✕ Clear" : "Search"}
              </button>
            </div>
            {searchResult && (
              <div
                style={{
                  marginTop: 5,
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: searchResult.queryType === "company" ? `${FIS.cyan}cc` : `${FIS.green}cc`,
                  fontFamily: "'Source Sans 3',sans-serif",
                }}
              >
                Search mode: {searchResult.queryType === "company" ? "Institution" : "Capability"}
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: `${FIS.amber}cc`,
                  }}
                >
                  {searchResult.matchedIds.length} results returned
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: "0 0 auto", display: "flex", gap: 8, alignItems: "flex-end", paddingBottom: 2 }}>
          <button onClick={() => setAnimating((a) => !a)} style={{ background: animating ? `${FIS.cyan}14` : "transparent", border: `1px solid ${animating ? `${FIS.cyan}44` : `${FIS.cyan}18`}`, color: animating ? FIS.cyan : `${FIS.cyan}44`, padding: "9px 14px", borderRadius: 3, fontSize: 11, letterSpacing: 1.5, cursor: "pointer", fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600 }}>{animating ? "⏸ PAUSE" : "▶ ORBIT"}</button>
        </div>
      </div>

      {!searchResult && (
        <div style={{ position: "relative", zIndex: 10, padding: "10px 28px", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${FIS.green}10` }}>
          {[{ id: "all", label: "All Journeys", color: "#ffffff" }, ...CLS_JOURNEY_DEFS].map((j) => {
            const active = journeyFilter === j.id;
            const c = j.color;
            return (
              <div
                key={j.id}
                className="chip"
                onClick={() => setJourney(j.id as "all" | JourneyId)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 3,
                  fontSize: 11,
                  letterSpacing: 1,
                  border: `1px solid ${c}${active ? "66" : "1a"}`,
                  background: active ? `${c}16` : "transparent",
                  color: active ? c : `${c}50`,
                  fontFamily: "'Source Sans 3',sans-serif",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {j.id === "all" ? "✦ ALL" : j.label}
              </div>
            );
          })}
          <div style={{ width: 1, height: 16, background: `${FIS.offWhite}14`, margin: "0 4px" }} />
          {(["ALL", "NOW", "NEXT", "LATER"] as const).map((label, idx) => {
            const val = idx as 0 | 1 | 2 | 3;
            const c = val === 0 ? "#ffffff" : CLS_ORBIT_COLOR[val];
            const active = orbitFilter === val;
            return (
              <div key={label} className="chip" onClick={() => setOrbit(val)} style={{ padding: "4px 12px", borderRadius: 3, fontSize: 11, letterSpacing: 1.5, border: `1px solid ${c}${active ? "55" : "1a"}`, background: active ? `${c}14` : "transparent", color: active ? c : `${c}44`, fontFamily: "'Source Sans 3',sans-serif", fontWeight: active ? 600 : 400 }}>
                {label}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ position: "relative", zIndex: 5, display: "flex", justifyContent: "center", marginTop: -4 }}>
        <svg viewBox="50 10 880 780" style={{ width: "100%", maxWidth: 920, height: "auto" }}>
          <defs>
            <radialGradient id="c-core-glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={FIS.green} stopOpacity="0.1" /><stop offset="100%" stopColor={FIS.navy} stopOpacity="0" /></radialGradient>
            <radialGradient id="c-core-fill" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={FIS.midNav} /><stop offset="100%" stopColor={FIS.navy} /></radialGradient>
            <filter id="c-gsm"><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <filter id="c-gmd"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>

          {[1, 2, 3].map((i) => (
            <circle
              key={i}
              cx={CLS_CENTER_X}
              cy={CLS_CENTER_Y}
              r={CLS_ORBIT_R[i as 1 | 2 | 3]}
              fill="none"
              stroke={CLS_ORBIT_COLOR[i as 1 | 2 | 3]}
              strokeWidth={1}
              strokeDasharray="4 10"
              className="ring"
              style={{ animationDelay: `${i * 1.6}s`, animationPlayState: animating ? "running" : "paused" }}
            />
          ))}

          {selectedFeature && !isSearchActive && selectedFeature.outcomes.map((oid) => {
            const o = CLS_STRATEGIC_OUTCOMES.find((x) => x.id === oid);
            if (!o) return null;
            const p = pos(selectedFeature);
            return <line key={oid} x1={o.x} y1={o.y} x2={p.x} y2={p.y} stroke={o.color} strokeWidth={0.8} opacity={0.25} strokeDasharray="4 8" />;
          })}

          {!isSearchActive && CLS_STRATEGIC_OUTCOMES.map((o) => (
            <g key={o.id}>
              <circle cx={o.x} cy={o.y} r={13} fill={`${o.color}14`} stroke={o.color} strokeWidth={1} filter="url(#c-gsm)" opacity={0.7} />
              <text x={o.x} y={o.y + 3} textAnchor="middle" fontSize={7} fill={o.color} fontFamily="'Source Sans 3',sans-serif" fontWeight={600} style={{ pointerEvents: "none" }}>◈</text>
              <text x={o.x} y={o.y + 23} textAnchor="middle" fontSize={7.5} fill={o.color} fontFamily="'Source Sans 3',sans-serif" letterSpacing={0.4} opacity={0.6} style={{ pointerEvents: "none" }}>{o.label.toUpperCase()}</text>
            </g>
          ))}

          <g
            onClick={() => {
              setVision((v) => !v);
              setSelected(null);
            }}
            className="core"
            style={{ animationPlayState: animating ? "running" : "paused" }}
          >
            <circle cx={CLS_CENTER_X} cy={CLS_CENTER_Y} r={110} fill="url(#c-core-glow)" />
            <circle cx={CLS_CENTER_X} cy={CLS_CENTER_Y} r={42} fill="url(#c-core-fill)" stroke={FIS.green} strokeWidth={1.2} />
            <text x={CLS_CENTER_X} y={CLS_CENTER_Y + 4} textAnchor="middle" fontSize={13} fill={FIS.green} fontFamily="'Barlow Condensed',sans-serif" fontWeight={800} letterSpacing={3} style={{ pointerEvents: "none" }}>CLS</text>
          </g>

          {FEATURES.map((f) => {
            const p = pos(f);
            const c = CLS_JCOLOR[f.journey] ?? FIS.offWhite;
            const relevance = getRelevance(f.id);
            const isMatched = isSearchActive && relevance !== null && relevance >= activeThreshold;
            const vis = isVisible(f);
            const opacity = isSearchActive ? (isMatched ? 1 : 0.07) : vis ? 1 : 0.06;
            const isClickable = !isSearchActive || isMatched;
            const isH = hovered === f.id;
            const isS = selected === f.id;
            const bright = isH || isS;
            const sz = f.size * (f.impact === "high" ? 1 : 0.85);
            const arcR = sz + 5.5;
            const relevancePct = relevance ? Math.round(relevance * 100) : null;

            return (
              <g
                key={f.id}
                className="planet"
                style={{ opacity, pointerEvents: isClickable ? "auto" : "none", cursor: isClickable ? "pointer" : "default" }}
                onClick={() => {
                  if (!isClickable) return;
                  setSelected(isS ? null : f.id);
                }}
                onMouseEnter={() => {
                  if (isClickable) setHovered(f.id);
                }}
                onMouseLeave={() => setHovered(null)}
              >
                {isMatched && <circle cx={p.x} cy={p.y} r={sz + 14} fill="none" stroke={c} strokeWidth={1.2} opacity={0.4} style={{ animation: "resultPulse 2s ease-in-out infinite" }} />}
                {bright && <circle cx={p.x} cy={p.y} r={sz + 10} fill="none" stroke={c} strokeWidth={0.8} opacity={0.25} />}
                <ProgressArc cx={p.x} cy={p.y} r={arcR} pct={f.progress / 100} color={c} />
                <circle cx={p.x} cy={p.y} r={sz} fill={`${c}18`} stroke={c} strokeWidth={isS ? 2 : isMatched ? 1.8 : 1.2} filter={bright || isMatched ? "url(#c-gmd)" : "url(#c-gsm)"} />
                <text x={p.x} y={p.y + sz + 12} textAnchor="middle" fontSize={7} fill={c} fontFamily="'Source Sans 3',sans-serif" fontWeight={600} letterSpacing={0.5} opacity={bright ? 1 : 0.75} style={{ pointerEvents: "none" }}>
                  {f.name.length > 24 ? `${f.name.slice(0, 23)}…` : f.name}
                </text>
                {isMatched && relevancePct && (
                  <g transform={`translate(${p.x},${p.y - sz - 10})`}>
                    <rect x={-14} y={-8} width={28} height={16} rx={2} fill={FIS.navy} stroke={c} strokeWidth={0.8} opacity={0.95} />
                    <text y={4} textAnchor="middle" fontSize={7.5} fill={c} fontFamily="'Source Sans 3',sans-serif" fontWeight={700}>{relevancePct}%</text>
                  </g>
                )}
                <g transform={`translate(${p.x + sz - 2},${p.y - sz + 2})`}>
                  <circle r={7} fill={FIS.navy} stroke={c} strokeWidth={0.7} opacity={0.85} />
                  <text y={2.5} textAnchor="middle" fontSize={5} fill={c} fontFamily="'Source Sans 3',sans-serif" fontWeight={600}>{votes[f.id] > 99 ? "99+" : votes[f.id]}</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      <FeaturePanel
        sel={selectedFeature}
        onClose={() => setSelected(null)}
        votes={votes}
        votedIds={votedIds}
        onVote={(id) => {
          if (!votedIds.has(id)) {
            setVotes((v) => ({ ...v, [id]: v[id] + 1 }));
            setVotedIds((s) => new Set([...s, id]));
          }
        }}
        searchResult={searchResult}
      />

      {showVision && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 249, background: "rgba(1,40,52,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setVision(false)} />
          <div style={{ position: "fixed", inset: 0, zIndex: 250, pointerEvents: "none" }}><div style={{ pointerEvents: "auto" }}><VisionPanel onClose={() => setVision(false)} /></div></div>
        </>
      )}

      {showSearch && <SearchOverlay onClose={() => setSearch(false)} onResults={(r) => { setResult(r); setSelected(null); }} />}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "8px 28px", background: `${FIS.navy}ee`, borderTop: `1px solid ${FIS.green}14`, zIndex: 20, display: "flex", gap: 20, alignItems: "center", backdropFilter: "blur(8px)" }}>
        {Object.entries(CLS_EFFORT_COLOR).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, color: `${v}70`, letterSpacing: 1.5, fontFamily: "'Source Sans 3',sans-serif" }}><div style={{ width: 7, height: 7, borderRadius: "50%", border: `1px solid ${v}`, background: `${v}28` }} />{k}</div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 9, color: `${FIS.offWhite}18`, letterSpacing: 1.5, fontFamily: "'Source Sans 3',sans-serif" }}>FIS · CLS UI MODERNIZATION ACCELERATION</div>
      </div>
    </div>
  );
}

function UniverseView({ onZoomCLS }: { onZoomCLS: () => void }) {
  const [selectedGalaxy, setSelGal] = useState<string | null>(null);
  const [hoveredGalaxy, setHovGal] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [angles, setAngles] = useState<Record<string, number>>(() =>
    Object.fromEntries(GALAXIES.map((g) => [g.id, g.angle])) as Record<string, number>,
  );
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  const CX = 500;
  const CY = 390;

  useEffect(() => {
    if (!animating) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
      return;
    }
    const tick = (t: number) => {
      if (lastRef.current != null) {
        const dt = t - lastRef.current;
        setAngles((prev) => {
          const n = { ...prev };
          GALAXIES.forEach((g) => {
            n[g.id] = (prev[g.id] + (GALAXY_SPEED[g.id] || 0.002) * dt * 0.055) % 360;
          });
          return n;
        });
      }
      lastRef.current = t;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [animating]);

  const gPos = (g: Galaxy): { x: number; y: number } => {
    const rad = (angles[g.id] * Math.PI) / 180;
    return { x: CX + g.orbitR * Math.cos(rad), y: CY + g.orbitR * Math.sin(rad) };
  };

  return (
    <div style={{ background: FIS.navy, minHeight: "100vh", fontFamily: "'Source Sans 3','Segoe UI',sans-serif", color: FIS.offWhite, overflow: "hidden", position: "relative" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }} aria-hidden>
        <defs>
          <radialGradient id="u-nbTL" cx="5%" cy="8%" r="30%"><stop offset="0%" stopColor={FIS.midNav} stopOpacity="0.15" /><stop offset="100%" stopColor={FIS.navy} stopOpacity="0" /></radialGradient>
          <radialGradient id="u-nbBR" cx="95%" cy="92%" r="28%"><stop offset="0%" stopColor={FIS.deepNav} stopOpacity="0.12" /><stop offset="100%" stopColor={FIS.navy} stopOpacity="0" /></radialGradient>
          <radialGradient id="u-cg" cx="50%" cy="50%" r="35%"><stop offset="0%" stopColor={FIS.green} stopOpacity="0.04" /><stop offset="100%" stopColor={FIS.navy} stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#u-nbTL)" />
        <rect width="100%" height="100%" fill="url(#u-nbBR)" />
        <rect width="100%" height="100%" fill="url(#u-cg)" />
        {STARS.map((s) => (
          <circle
            key={s.id}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.r}
            fill="#fff"
            opacity={s.op}
            style={{
              "--op": s.op,
              animation: animating ? `twinkle ${3 + s.d}s ease-in-out infinite` : "none",
              animationDelay: `${s.d}s`,
            } as CSSProperties}
          />
        ))}
      </svg>

      <div style={{ position: "relative", zIndex: 10, padding: "18px 28px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: `1px solid ${FIS.green}18`, gap: 16 }}>
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: FIS.green, marginBottom: 5, fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600, textTransform: "uppercase" }}>FIS · Lending Division · Portfolio Overview</div>
          <h1 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: 2, lineHeight: 1, textTransform: "uppercase", color: "#ffffff" }}>FIS Lending Universe</h1>
          <div style={{ fontSize: 11.5, color: `${FIS.offWhite}55`, marginTop: 3, fontFamily: "'Source Sans 3',sans-serif", fontWeight: 300, letterSpacing: 0.5 }}>8 Solution Galaxies · Click to Explore</div>
        </div>
        <div style={{ display: "grid", gap: 8, justifyItems: "end", alignContent: "start", paddingTop: 2 }}>
          <button onClick={() => setAnimating((a) => !a)} style={{ background: animating ? `${FIS.cyan}14` : "transparent", border: `1px solid ${animating ? `${FIS.cyan}44` : `${FIS.cyan}18`}`, color: animating ? FIS.cyan : `${FIS.cyan}44`, padding: "9px 14px", borderRadius: 3, fontSize: 11, letterSpacing: 1.5, cursor: "pointer", fontFamily: "'Source Sans 3',sans-serif", fontWeight: 600 }}>{animating ? "⏸ PAUSE" : "▶ DRIFT"}</button>
          <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
            <div style={{ fontSize: 10, color: `${FIS.green}66`, fontFamily: "'Source Sans 3',sans-serif", letterSpacing: 1 }}>◉ Galaxy size = product scale &amp; breadth</div>
            <div style={{ fontSize: 10, color: `${FIS.cyan}55`, fontFamily: "'Source Sans 3',sans-serif", letterSpacing: 1 }}>◈ Click any galaxy to explore</div>
            <div style={{ fontSize: 10, color: `${FIS.cyan}88`, fontFamily: "'Source Sans 3',sans-serif", letterSpacing: 1, fontWeight: 600 }}>✦ CLS — click to zoom into product roadmap</div>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 5, display: "flex", justifyContent: "center", marginTop: -18 }}>
        <svg viewBox="0 0 1000 840" style={{ width: "100%", maxWidth: 1040, height: "auto" }}>
          <defs>
            <radialGradient id="u-centerCore" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={FIS.midNav} /><stop offset="60%" stopColor="#013040" /><stop offset="100%" stopColor={FIS.navy} /></radialGradient>
            <radialGradient id="u-centerHalo" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={FIS.green} stopOpacity="0.08" /><stop offset="100%" stopColor={FIS.navy} stopOpacity="0" /></radialGradient>
            <filter id="u-glowS"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <filter id="u-glowM"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            {GALAXIES.map((g) => (
              <radialGradient key={`grd-${g.id}`} id={`grd-${g.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={g.color} stopOpacity="0.22" />
                <stop offset="55%" stopColor={g.color} stopOpacity="0.06" />
                <stop offset="100%" stopColor={g.color} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>

          <circle cx={CX} cy={CY} r={300} fill="none" stroke={FIS.green} strokeWidth={0.6} strokeDasharray="2 18" opacity={0.08} />
          {GALAXIES.map((g) => {
            const p = gPos(g);
            return <line key={`l-${g.id}`} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={g.color} strokeWidth={0.6} opacity={0.08} strokeDasharray="3 12" />;
          })}

          <g style={{ animation: animating ? "corePulse 4s ease-in-out infinite" : "none" }}>
            <circle cx={CX} cy={CY} r={200} fill="url(#u-centerHalo)" />
            <circle cx={CX} cy={CY} r={72} fill="url(#u-centerCore)" stroke={FIS.green} strokeWidth={1.5} filter="url(#u-glowM)" />
            <circle cx={CX} cy={CY} r={82} fill="none" stroke={FIS.green} strokeWidth={0.6} strokeDasharray="2 5" opacity={0.3} />
            <text x={CX} y={CY - 12} textAnchor="middle" fontSize={10} fill={FIS.green} fontFamily="'Barlow Condensed',sans-serif" fontWeight={800} letterSpacing={2}>FIS</text>
            <text x={CX} y={CY + 3} textAnchor="middle" fontSize={10} fill={FIS.green} fontFamily="'Barlow Condensed',sans-serif" fontWeight={800} letterSpacing={1.5}>LENDING</text>
            <text x={CX} y={CY + 17} textAnchor="middle" fontSize={9} fill={`${FIS.green}88`} fontFamily="'Barlow Condensed',sans-serif" fontWeight={700} letterSpacing={1}>SOLUTIONS</text>
          </g>

          {GALAXIES.map((g) => {
            const p = gPos(g);
            const isHov = hoveredGalaxy === g.id;
            const isSel = selectedGalaxy === g.id;
            const bright = isHov || isSel;
            const miniStars = galaxyStars(g, p.x, p.y);
            const lines = g.label.split("\n");
            return (
              <g key={g.id} style={{ cursor: "pointer" }} onClick={() => setSelGal(isSel ? null : g.id)} onMouseEnter={() => setHovGal(g.id)} onMouseLeave={() => setHovGal(null)}>
                <circle cx={p.x} cy={p.y} r={g.galaxyR + 22} fill={`url(#grd-${g.id})`} opacity={bright ? 1 : 0.7} style={{ transition: "opacity 0.3s" }} />
                {miniStars.map((s, i) => (
                  <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={g.color} opacity={bright ? s.op * 2.5 : s.op} style={{ transition: "opacity 0.3s" }} />
                ))}
                {bright && <circle cx={p.x} cy={p.y} r={g.galaxyR + 8} fill="none" stroke={g.color} strokeWidth={0.8} opacity={0.35} filter="url(#u-glowS)" />}
                <circle cx={p.x} cy={p.y} r={g.galaxyR} fill={`${g.color}12`} stroke={g.color} strokeWidth={bright ? 1.8 : 1} filter={bright ? "url(#u-glowM)" : "url(#u-glowS)"} style={{ transition: "all 0.25s" }} />
                {g.wired && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={g.galaxyR + 5}
                    fill="none"
                    stroke={g.color}
                    strokeWidth={0.8}
                    strokeDasharray="3 4"
                    opacity={bright ? 0.7 : 0.35}
                    style={{ animation: animating ? "haloSpin 20s linear infinite" : "none" }}
                  />
                )}
                {lines.map((line, li) => (
                  <text key={li} x={p.x} y={p.y + g.galaxyR + 16 + li * 13} textAnchor="middle" fontSize={9.5} fill={bright ? g.color : `${g.color}88`} fontFamily="'Source Sans 3',sans-serif" fontWeight={bright ? 700 : 500} letterSpacing={0.5} style={{ pointerEvents: "none", transition: "fill 0.2s" }}>{line}</text>
                ))}
                {bright && (
                  <g>
                    <rect x={p.x - 28} y={p.y - g.galaxyR - 20} width={56} height={14} rx={2} fill={FIS.navy} stroke={g.color} strokeWidth={0.7} opacity={0.95} />
                    <text x={p.x} y={p.y - g.galaxyR - 9} textAnchor="middle" fontSize={7} fill={g.color} fontFamily="'Source Sans 3',sans-serif" fontWeight={600} letterSpacing={1}>{g.tag}</text>
                  </g>
                )}
                {g.wired && bright && (
                  <g>
                    <rect x={p.x - 32} y={p.y + g.galaxyR + 38} width={64} height={14} rx={2} fill={`${g.color}22`} stroke={g.color} strokeWidth={0.7} />
                    <text x={p.x} y={p.y + g.galaxyR + 49} textAnchor="middle" fontSize={7} fill={g.color} fontFamily="'Source Sans 3',sans-serif" fontWeight={700} letterSpacing={1.5}>CLICK TO ZOOM →</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {selectedGalaxy && (
        <GalaxyInfoPanel
          galaxy={GALAXIES.find((g) => g.id === selectedGalaxy)}
          onClose={() => setSelGal(null)}
          onZoomIn={onZoomCLS}
        />
      )}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "8px 28px", background: `${FIS.navy}ee`, borderTop: `1px solid ${FIS.green}14`, zIndex: 20, display: "flex", gap: 20, alignItems: "center", backdropFilter: "blur(8px)" }}>
        {GALAXIES.map((g) => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: `${g.color}60`, letterSpacing: 1, fontFamily: "'Source Sans 3',sans-serif" }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: g.color, opacity: 0.6 }} />{g.shortLabel}</div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 9, color: `${FIS.offWhite}18`, letterSpacing: 1.5, fontFamily: "'Source Sans 3',sans-serif" }}>FIS · LENDING SOLUTIONS UNIVERSE</div>
      </div>
    </div>
  );
}

export const UniverseApp = (): JSX.Element => {
  const [view, setView] = useState<UniverseViewMode>("universe");
  const [fading, setFading] = useState(false);

  const zoomToCLS = (): void => {
    setFading(true);
    window.setTimeout(() => {
      setView("cls");
      setFading(false);
    }, 500);
  };

  const backToUniverse = (): void => {
    setFading(true);
    window.setTimeout(() => {
      setView("universe");
      setFading(false);
    }, 500);
  };

  return (
    <>
      <style>{`
        @keyframes twinkle{0%,100%{opacity:var(--op)}50%{opacity:calc(var(--op)*0.3)}}
        @keyframes ring-breathe{0%,100%{stroke-opacity:0.14}50%{stroke-opacity:0.28}}
        @keyframes corePulse{0%,100%{filter:drop-shadow(0 0 18px #4BCD3E55)}50%{filter:drop-shadow(0 0 38px #4BCD3E88)}}
        @keyframes haloSpin{from{stroke-dashoffset:0}to{stroke-dashoffset:-60}}
        @keyframes visionFade{from{opacity:0;transform:translate(-50%,-48%) scale(0.97)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        @keyframes panelIn{from{opacity:0;transform:translateY(-48%) translateX(16px)}to{opacity:1;transform:translateY(-50%) translateX(0)}}
        @keyframes resultPulse{0%,100%{filter:drop-shadow(0 0 6px #3BCFF0)}50%{filter:drop-shadow(0 0 18px #3BCFF0)}}
        .ring{animation:ring-breathe 6s ease-in-out infinite}
        .core{animation:corePulse 3.5s ease-in-out infinite;cursor:pointer}
        .core:hover{filter:drop-shadow(0 0 20px #4BCD3Ecc) brightness(1.15)}
        .chip{cursor:pointer;user-select:none;transition:all 0.15s}
        .chip:hover{transform:translateY(-1px)}
        .planet{cursor:pointer;transition:opacity 0.35s}
        .panel{animation:panelIn 0.25s cubic-bezier(.22,1,.36,1) both}
      `}</style>
      <div style={{ opacity: fading ? 0 : 1, transition: "opacity 0.4s ease" }}>
        {view === "universe" ? <UniverseView onZoomCLS={zoomToCLS} /> : <CLSGalaxyView onBack={backToUniverse} />}
      </div>
    </>
  );
};
