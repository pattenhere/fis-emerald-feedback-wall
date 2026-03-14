import { memo, type CSSProperties } from "react";
import type { AppArea } from "../../types/domain";

interface AppSelectorProps {
  apps: Array<{ id: AppArea; label: string; dark?: boolean }>;
  activeApp: AppArea;
  heatmapIntensity: Record<AppArea, number>;
  onChange: (app: AppArea) => void;
}

export const AppSelector = memo(({
  apps,
  activeApp,
  heatmapIntensity,
  onChange,
}: AppSelectorProps): JSX.Element => {
  return (
    <div className="app-selector" role="tablist" aria-label="Application areas">
      {apps.map((app) => (
        <button
          key={app.id}
          className={`app-pill ${activeApp === app.id ? "is-active" : ""} ${app.dark ? "is-dark" : ""}`}
          type="button"
          onClick={() => onChange(app.id)}
          style={{ "--heat": heatmapIntensity[app.id] ?? 0 } as CSSProperties}
        >
          {app.label}
        </button>
      ))}
    </div>
  );
});
