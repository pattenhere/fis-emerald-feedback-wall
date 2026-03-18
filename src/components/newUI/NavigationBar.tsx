import { memo, useEffect, useMemo, useState } from "react";
import type { AppSection } from "./types";

interface NavigationBarProps {
  appSections: AppSection[];
  selectedCategory: string | null;
  selectedScreen: string | null;
  screenFeedbackCounts: Record<string, number>;
  onCategorySelect: (categorySlug: string) => void;
  onScreenSelect: (screenName: string) => void;
  stickyTopPx?: number;
}

export const NavigationBar = memo(({
  appSections,
  selectedCategory,
  selectedScreen,
  screenFeedbackCounts,
  onCategorySelect,
  onScreenSelect,
  stickyTopPx = 68,
}: NavigationBarProps): JSX.Element => {
  const [crossfadeClass, setCrossfadeClass] = useState("");

  const activeCategory = selectedCategory ?? "";
  const categoryScreens = useMemo(
    () => appSections.find((section) => section.slug === activeCategory)?.screens ?? [],
    [activeCategory, appSections],
  );

  useEffect(() => {
    setCrossfadeClass("is-fading");
    const timer = window.setTimeout(() => setCrossfadeClass(""), 150);
    return () => window.clearTimeout(timer);
  }, [activeCategory]);

  return (
    <section className="newui-nav" style={{ top: `${stickyTopPx}px` }}>
      <div className="newui-nav-row newui-nav-row--categories" role="tablist" aria-label="Application sections">
        {appSections.map((section) => (
          <button
            key={section.slug}
            type="button"
            className={`app-pill ${activeCategory === section.slug ? "is-active" : ""}`}
            onClick={() => onCategorySelect(section.slug)}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className={`newui-nav-row newui-nav-row--screens nav-row--features ${crossfadeClass}`} role="tablist" aria-label="Screens">
        {categoryScreens.map((screen) => {
          const count = screenFeedbackCounts[`${activeCategory}::${screen.name}`] ?? 0;
          const isActive = selectedScreen === screen.name;
          return (
            <button
              key={`${activeCategory}-${screen.id}`}
              type="button"
              className={`nav-pill--feature ${isActive ? "active" : ""}`}
              onClick={() => onScreenSelect(screen.name)}
            >
              <span className="pill-label">{screen.name}</span>
              {count > 0 && <span className="pill-count">· {count}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
});
