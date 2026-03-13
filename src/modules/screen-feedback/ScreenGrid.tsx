import type { AppScreen } from "../../types/domain";

interface ScreenGridProps {
  screens: AppScreen[];
  selectedScreenId: string;
  onSelectScreen: (id: string) => void;
}

export const ScreenGrid = ({
  screens,
  selectedScreenId,
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
          <span className="screen-thumb-title">{screen.name}</span>
          <span className="screen-thumb-caption">Wireframe preview</span>
        </button>
      ))}
    </section>
  );
};
