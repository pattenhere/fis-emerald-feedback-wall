import { memo, type KeyboardEvent } from "react";
import type { ThemeSnapshot } from "../../themeSnapshots/types";

interface IdleOverlayProps {
  snapshot: ThemeSnapshot;
  onDismiss: () => void;
}

const formatUpdatedAt = (publishedAt: string): string => {
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return publishedAt;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const IdleOverlay = memo(({ snapshot, onDismiss }: IdleOverlayProps): JSX.Element => {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onDismiss();
    }
  };

  return (
    <div
      className="newui-idle-overlay"
      onClick={onDismiss}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Dismiss theme snapshot overlay"
    >
      <div className="newui-idle-overlay-content">
        <header className="newui-idle-overlay-head">
          <h2>What we're hearing today</h2>
          <p>Updated {formatUpdatedAt(snapshot.publishedAt ?? snapshot.generatedAt)}</p>
        </header>
        <div className="newui-idle-theme-grid" aria-live="polite">
          {snapshot.themes.map((theme, index) => (
            <article key={`${snapshot.id}-${index}`} className="newui-idle-theme-card">
              <span className="newui-idle-theme-index">{index + 1}</span>
              <p>{theme}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
});
