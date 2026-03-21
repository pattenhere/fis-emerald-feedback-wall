export type SynthesisSectionId = "facilitator" | "admin";

export type SynthesisRouteId =
  | "overview"
  | "moderation"
  | "synthesis-parameters"
  | "synthesis-competing-views"
  | "run"
  | "sizing"
  | "ceremony"
  | "day2-reveal"
  | "session-config"
  | "tables";

export interface SynthesisRouteDefinition {
  id: SynthesisRouteId;
  path: string;
  label: string;
  description: string;
  section: SynthesisSectionId;
  visibleInNav: boolean;
}

export interface SynthesisNavRouteItem {
  id: SynthesisRouteId;
  label: string;
  path: string;
  badge?: number;
}

export interface SynthesisNavGroup {
  id: string;
  label: string;
  defaultOpen: boolean;
  items: SynthesisNavRouteItem[];
}

export interface SynthesisNavSection {
  id: SynthesisSectionId;
  label: string;
  items: Array<SynthesisNavRouteItem | SynthesisNavGroup>;
}

export const SYNTHESIS_ROUTE_DEFINITIONS: SynthesisRouteDefinition[] = [
  {
    id: "overview",
    path: "/facilitator/overview",
    label: "Overview",
    description: "Session summary, signal health, and readiness checkpoints for synthesis kickoff.",
    section: "facilitator",
    visibleInNav: true,
  },
  {
    id: "moderation",
    path: "/facilitator/moderation",
    label: "Moderation",
    description: "Review and curate submissions before synthesis generation.",
    section: "facilitator",
    visibleInNav: true,
  },
  {
    id: "synthesis-parameters",
    path: "/facilitator/synthesis/parameters",
    label: "Parameters",
    description: "Tune the synthesis inputs and generation parameters before the session runs.",
    section: "facilitator",
    visibleInNav: true,
  },
  {
    id: "synthesis-competing-views",
    path: "/facilitator/synthesis/competing-views",
    label: "Competing views",
    description: "Compare alternate interpretations before the facilitator commits to a direction.",
    section: "facilitator",
    visibleInNav: true,
  },
  {
    id: "ceremony",
    path: "/facilitator/ceremony",
    label: "Ceremony",
    description: "Prepare the live handoff, timing, and facilitator ritual for the session.",
    section: "facilitator",
    visibleInNav: true,
  },
  {
    id: "day2-reveal",
    path: "/facilitator/day2-reveal",
    label: "Day 2 reveal",
    description: "Presentation-optimized Day 2 reveal view sourced from saved synthesis artifacts.",
    section: "facilitator",
    visibleInNav: true,
  },
  {
    id: "session-config",
    path: "/admin/session-config",
    label: "Session config",
    description: "Administer wall behavior, thresholds, and session timing controls.",
    section: "admin",
    visibleInNav: true,
  },
  {
    id: "run",
    path: "/facilitator/synthesis/run",
    label: "Run synthesis",
    description: "Run synthesis to generate structured outputs from weighted participant inputs.",
    section: "facilitator",
    visibleInNav: true,
  },
  {
    id: "sizing",
    path: "/facilitator/t-shirt-sizing",
    label: "T-shirt sizing",
    description: "Estimate implementation size and complexity for prioritized initiatives.",
    section: "facilitator",
    visibleInNav: true,
  },
  {
    id: "tables",
    path: "/synthesis/tables",
    label: "Tables",
    description: "Inspect available seed tables and schema data used by the session.",
    section: "admin",
    visibleInNav: true,
  },
  {
    id: "overview",
    path: "/synthesis/overview",
    label: "Overview",
    description: "Session summary, signal health, and readiness checkpoints for synthesis kickoff.",
    section: "facilitator",
    visibleInNav: false,
  },
  {
    id: "moderation",
    path: "/synthesis/moderation",
    label: "Moderation",
    description: "Review and curate submissions before synthesis generation.",
    section: "facilitator",
    visibleInNav: false,
  },
  {
    id: "run",
    path: "/synthesis/run",
    label: "Run synthesis",
    description: "Run synthesis to generate structured outputs from weighted participant inputs.",
    section: "facilitator",
    visibleInNav: false,
  },
  {
    id: "sizing",
    path: "/synthesis/sizing",
    label: "T-shirt sizing",
    description: "Estimate implementation size and complexity for prioritized initiatives.",
    section: "facilitator",
    visibleInNav: false,
  },
];

export const SYNTHESIS_NAV_SECTIONS: SynthesisNavSection[] = [
  {
    id: "facilitator",
    label: "FACILITATOR",
    items: [
      { id: "overview", label: "Overview", path: "/facilitator/overview" },
      { id: "moderation", label: "Moderation", path: "/facilitator/moderation" },
      {
        id: "synthesis-group",
        label: "Synthesis",
        defaultOpen: true,
        items: [
          { id: "synthesis-parameters", label: "Parameters", path: "/facilitator/synthesis/parameters" },
          {
            id: "synthesis-competing-views",
            label: "Competing views",
            path: "/facilitator/synthesis/competing-views",
          },
          { id: "run", label: "Run synthesis", path: "/facilitator/synthesis/run" },
        ],
      },
      { id: "sizing", label: "T-shirt sizing", path: "/facilitator/t-shirt-sizing" },
      { id: "ceremony", label: "Ceremony", path: "/facilitator/ceremony" },
      { id: "day2-reveal", label: "Day 2 reveal", path: "/facilitator/day2-reveal" },
    ],
  },
  {
    id: "admin",
    label: "ADMIN",
    items: [
      { id: "session-config", label: "Session config", path: "/admin/session-config" },
      { id: "tables", label: "Tables", path: "/synthesis/tables" },
    ],
  },
];

const ROUTE_BY_PATH = new Map<string, SynthesisRouteDefinition>(
  SYNTHESIS_ROUTE_DEFINITIONS.map((route) => [route.path, route]),
);

export const DEFAULT_SYNTHESIS_PATH = "/facilitator/overview";

export const normalizeSynthesisPath = (pathname: string): string => {
  const normalizedPath = String(pathname ?? "").replace(/\/+$/u, "") || "/";
  if (
    normalizedPath === "/" ||
    normalizedPath === "/synthesis" ||
    normalizedPath === "/facilitator" ||
    normalizedPath === "/admin"
  ) {
    return DEFAULT_SYNTHESIS_PATH;
  }
  return ROUTE_BY_PATH.has(normalizedPath) ? normalizedPath : DEFAULT_SYNTHESIS_PATH;
};

export const getSynthesisRoute = (pathname: string): SynthesisRouteDefinition => {
  const normalized = normalizeSynthesisPath(pathname);
  return ROUTE_BY_PATH.get(normalized) ?? SYNTHESIS_ROUTE_DEFINITIONS[0];
};
