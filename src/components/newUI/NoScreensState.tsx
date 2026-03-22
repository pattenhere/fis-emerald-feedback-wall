import { memo } from "react";

interface NoScreensStateProps {
  placeholderSrc: string;
  screenName: string;
  onSubmitFeedback: () => void;
}

export const NoScreensState = memo(({
  placeholderSrc,
  screenName,
  onSubmitFeedback,
}: NoScreensStateProps): JSX.Element => {
  return (
    <section className="newui-hero">
      <div className="newui-carousel-frame newui-carousel-frame--empty">
        <img
          className="newui-carousel-image"
          src={placeholderSrc}
          alt={`${screenName} placeholder wireframe`}
        />
        <p className="newui-empty-state-title">••• No screens available</p>
        <p className="newui-carousel-label">Representative wireframe only · not final UI</p>
      </div>
      <div className="newui-hero-controls">
        <button type="button" className="primary-btn newui-submit-btn" onClick={onSubmitFeedback}>
          Leave Feedback
        </button>
        {screenName ? <p className="newui-active-screen-context">Giving feedback on: {screenName}</p> : null}
      </div>
    </section>
  );
});
