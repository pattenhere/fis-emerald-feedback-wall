import { memo } from "react";
import type { AppScreen } from "../../types/domain";

interface ScreenGridProps {
  screens: AppScreen[];
  selectedScreenId: string;
  submissionCounts: Record<string, number>;
  onSelectScreen: (id: string) => void;
}

export const ScreenGrid = memo(({
  screens,
  selectedScreenId,
  submissionCounts,
  onSelectScreen,
}: ScreenGridProps): JSX.Element => {
  return (
    <section className="screen-grid" aria-label="Screen thumbnails">
      {screens.map((screen) => (
        <button
          key={screen.id}
          className={`screen-thumb ${selectedScreenId === screen.id ? "is-active" : ""}`}
          type="button"
          onClick={() => onSelectScreen(screen.id)}
        >
          {(submissionCounts[screen.id] ?? 0) > 0 && (
            <span className="screen-count-badge">{submissionCounts[screen.id]}</span>
          )}
          <span className="screen-thumb-title">{screen.name}</span>
        </button>
      ))}
    </section>
  );
});
