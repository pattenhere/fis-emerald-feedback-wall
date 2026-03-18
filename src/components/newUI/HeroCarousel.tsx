import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import type { ScreenRecord } from "./types";
import { NoScreensState } from "./NoScreensState";
import { WireframePreview } from "../../modules/screen-feedback/WireframePreview";

interface HeroCarouselProps {
  selectedScreen: ScreenRecord | null;
  onSubmitFeedbackClick: () => void;
  onOpenBroaderFeedback: () => void;
}

const NO_SCREENS_PLACEHOLDER = "/assets/screens/_placeholders/no-screens-available.png";
const SWIPE_THRESHOLD_PX = 50;

const toPublicAssetPath = (assetPath: string): string => {
  const trimmed = assetPath.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("/assets/")) return trimmed;
  if (trimmed.startsWith("assets/")) return `/${trimmed}`;
  if (trimmed.startsWith("/")) return trimmed;
  return `/assets/${trimmed}`;
};

export const HeroCarousel = memo(({
  selectedScreen,
  onSubmitFeedbackClick,
  onOpenBroaderFeedback,
}: HeroCarouselProps): JSX.Element => {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // Reset before paint so we never flash the prior screen's final slide.
  useLayoutEffect(() => {
    setActiveIndex(0);
  }, [selectedScreen]);

  const assets = useMemo(
    () =>
      (selectedScreen?.assets ?? [])
        .filter((asset) => typeof asset === "string" && asset.trim().length > 0)
        .map((asset) => toPublicAssetPath(asset)),
    [selectedScreen?.assets],
  );
  const hasMultipleAssets = assets.length > 1;
  const activeAsset = assets.length > 0 ? assets[activeIndex % assets.length] : null;

  const movePrev = useCallback((): void => {
    if (!hasMultipleAssets) return;
    setActiveIndex((current) => (current - 1 + assets.length) % assets.length);
  }, [assets.length, hasMultipleAssets]);

  const moveNext = useCallback((): void => {
    if (!hasMultipleAssets) return;
    setActiveIndex((current) => (current + 1) % assets.length);
  }, [assets.length, hasMultipleAssets]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!hasMultipleAssets) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveNext();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      movePrev();
    }
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>): void => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>): void => {
    if (!hasMultipleAssets || touchStartX.current == null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const deltaX = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    if (deltaX < 0) {
      moveNext();
      return;
    }
    movePrev();
  };

  if (!selectedScreen) {
    return (
      <section className="newui-hero newui-hero--empty-selection">
        <div className="newui-empty-selection-copy">
          <p>
            Select a screen above to leave feedback or, if you have a broader thought,{" "}
            <button type="button" className="newui-inline-link" onClick={onOpenBroaderFeedback}>
              click here
            </button>
            .
          </p>
        </div>
      </section>
    );
  }

  if (assets.length === 0) {
    return (
      <NoScreensState
        placeholderSrc={NO_SCREENS_PLACEHOLDER}
        screenName={selectedScreen.name}
        onSubmitFeedback={onSubmitFeedbackClick}
      />
    );
  }

  return (
    <section className="newui-hero">
      <div
        className="newui-carousel-frame"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {activeAsset ? (
          <img
            className="newui-carousel-image"
            src={activeAsset}
            alt={`${selectedScreen.name} wireframe ${activeIndex + 1}`}
          />
        ) : (
          <WireframePreview title={selectedScreen.name} />
        )}
        {hasMultipleAssets && (
          <>
            <button type="button" className="newui-carousel-arrow is-left" onClick={movePrev} aria-label="Previous image">
              ‹
            </button>
            <button type="button" className="newui-carousel-arrow is-right" onClick={moveNext} aria-label="Next image">
              ›
            </button>
          </>
        )}
      </div>
      <div className="newui-hero-controls">
        {hasMultipleAssets && (
          <div className="newui-carousel-dots" role="tablist" aria-label="Carousel images">
            {assets.map((asset, index) => (
              <button
                key={`${asset}-${index}`}
                type="button"
                className={`newui-dot ${index === activeIndex ? "is-active" : ""}`}
                onClick={() => setActiveIndex(index)}
                aria-label={`Show image ${index + 1}`}
              />
            ))}
          </div>
        )}
        <button type="button" className="primary-btn newui-submit-btn" onClick={onSubmitFeedbackClick}>
          Submit Feedback
        </button>
      </div>
    </section>
  );
});
