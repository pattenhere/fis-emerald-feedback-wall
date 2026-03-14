import { memo, useState } from "react";

interface SplashPageProps {
  imageSrc: string;
  onContinue: () => void;
}

export const SplashPage = memo(({
  imageSrc,
  onContinue,
}: SplashPageProps): JSX.Element => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <section className="splash-page">
      <div className="splash-layout">
        <div className="splash-media" aria-label="Splash illustration">
          {!imageFailed && (
            <img
              src={imageSrc}
              alt="FIS Lending Suite Feedback Wall"
              className={`splash-image ${imageLoaded ? "is-loaded" : ""}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
            />
          )}
          {(!imageLoaded || imageFailed) && (
            <div className="splash-image-placeholder">
              Image placeholder
            </div>
          )}
        </div>

        <div className="splash-content">
          <p className="splash-eyebrow">FIS Lending Suite</p>
          <h1>
            Welcome to the
            <br />
            FIS Lending Suite Feedback Wall
          </h1>
          <p className="splash-copy">
            Review products, capture feedback, and monitor responses in one place.
          </p>
          <button type="button" className="primary-btn splash-continue-btn" onClick={onContinue}>
            Enter Feedback Wall
          </button>
        </div>
      </div>
    </section>
  );
});
