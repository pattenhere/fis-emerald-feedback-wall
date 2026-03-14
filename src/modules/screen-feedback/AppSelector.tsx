import { memo, type CSSProperties } from "react";

interface AppSelectorProps {
  tabs: Array<{ id: string; label: string; dark?: boolean }>;
  activeTabId: string;
  signalIntensity?: Record<string, number>;
  onChange: (id: string) => void;
}

export const AppSelector = memo(({
  tabs,
  activeTabId,
  signalIntensity = {},
  onChange,
}: AppSelectorProps): JSX.Element => {
  return (
    <div className="app-selector" role="tablist" aria-label="Product categories">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`app-pill ${activeTabId === tab.id ? "is-active" : ""} ${tab.dark ? "is-dark" : ""}`}
          type="button"
          onClick={() => onChange(tab.id)}
          style={{ "--signal": signalIntensity[tab.id] ?? 0 } as CSSProperties}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
});
