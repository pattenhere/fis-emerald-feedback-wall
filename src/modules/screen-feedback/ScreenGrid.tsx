import { memo } from "react";
import type { AppScreen } from "../../types/domain";

interface ScreenGridProps {
  screens: AppScreen[];
  selectedScreenId: number;
  submissionCounts: Record<number, number>;
  onSelectScreen: (id: number) => void;
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
          className={`screen-thumb ${selectedScreenId === Number(screen.id) ? "is-active" : ""}`}
          type="button"
          onClick={() => onSelectScreen(Number(screen.id))}
        >
          {(submissionCounts[Number(screen.id)] ?? 0) > 0 && (
            <span className="screen-count-badge">{submissionCounts[Number(screen.id)]}</span>
          )}
          <span className="screen-thumb-title">{screen.name}</span>
        </button>
      ))}
    </section>
  );
});
