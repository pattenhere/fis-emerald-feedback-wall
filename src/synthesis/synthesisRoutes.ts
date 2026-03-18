export type SynthesisRouteId =
  | "overview"
  | "moderation"
  | "run"
  | "sizing"
  | "themes"
  | "artifacts"
  | "roadmap";

export interface SynthesisRouteDefinition {
  id: SynthesisRouteId;
  path: string;
  label: string;
}

export const SYNTHESIS_ROUTES: SynthesisRouteDefinition[] = [
  { id: "overview", path: "/synthesis/overview", label: "Overview" },
  { id: "moderation", path: "/synthesis/moderation", label: "Moderation" },
  { id: "run", path: "/synthesis/run", label: "Synthesis" },
  { id: "sizing", path: "/synthesis/sizing", label: "T-shirt sizing" },
  { id: "themes", path: "/synthesis/themes", label: "Themes view" },
  { id: "artifacts", path: "/synthesis/artifacts", label: "All artifacts" },
  { id: "roadmap", path: "/synthesis/roadmap", label: "Roadmap" },
];

export const DEFAULT_SYNTHESIS_PATH = "/synthesis/overview";

export const normalizeSynthesisPath = (pathname: string): string => {
  const normalizedPath = String(pathname ?? "").replace(/\/+$/u, "") || "/";
  if (normalizedPath === "/synthesis") {
    return DEFAULT_SYNTHESIS_PATH;
  }
  const match = SYNTHESIS_ROUTES.find((route) => route.path === normalizedPath);
  return match ? match.path : DEFAULT_SYNTHESIS_PATH;
};

export const getSynthesisRoute = (pathname: string): SynthesisRouteDefinition => {
  const normalized = normalizeSynthesisPath(pathname);
  return SYNTHESIS_ROUTES.find((route) => route.path === normalized) ?? SYNTHESIS_ROUTES[0];
};
