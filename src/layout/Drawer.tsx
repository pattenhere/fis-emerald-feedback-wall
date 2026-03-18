import { memo } from "react";
import type { DrawerTab } from "../types/domain";

interface DrawerProps {
  open: boolean;
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  onToggle: () => void;
  children: JSX.Element;
}

const iconForTab = (tab: DrawerTab): JSX.Element => {
  if (tab === "features") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (tab === "kudos") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.5 14.6 9l6 .5-4.5 3.8 1.4 5.8-5.5-3.2-5.5 3.2 1.4-5.8L3.4 9.5l6-.5L12 3.5Z" />
      </svg>
    );
  }
  if (tab === "card-sort") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 6h10M7 12h8M7 18h6" />
        <path d="m4 6 1.3 1.3L7.5 5" />
        <path d="m4 12 1.3 1.3L7.5 11" />
        <path d="m4 18 1.3 1.3L7.5 17" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 5v5h-5" />
    </svg>
  );
};

const TABS: Array<{ id: DrawerTab; label: string }> = [
  { id: "features", label: "Feature Requests" },
  { id: "kudos", label: "Comments" },
];

export const Drawer = memo(({
  open,
  activeTab,
  onTabChange,
  onToggle,
  children,
}: DrawerProps): JSX.Element => {
  if (!open) {
    return (
      <aside className="drawer is-collapsed" aria-label="Feedback panel collapsed">
        <button
          type="button"
          className="drawer-tab-trigger"
          onClick={onToggle}
          aria-label="Open feedback panel"
          title="Open feedback panel"
        >
          <span aria-hidden="true">Feedback</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="drawer is-open" aria-label="Feedback panel">
      <section className="drawer-panel">
        <div className="drawer-head">
          <nav className="drawer-tabs" aria-label="Feedback panel tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`drawer-tab ${activeTab === tab.id ? "is-active" : ""}`}
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-label={tab.label}
                title={tab.label}
              >
                <span className="drawer-tab-icon" aria-hidden="true">
                  {iconForTab(tab.id)}
                </span>
                <span className="drawer-tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="drawer-collapse-btn"
            onClick={onToggle}
            aria-label="Collapse feedback panel"
            title="Collapse"
          >
            <span aria-hidden="true">Collapse</span>
          </button>
        </div>
        <section className="drawer-content">{children}</section>
      </section>
    </aside>
  );
});
