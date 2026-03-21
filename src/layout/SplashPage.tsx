import { memo, useState } from "react";

interface SplashPageProps {
  imageSrc: string;
  onContinue: () => void;
  isDataLoaded: boolean;
  loadError?: string | null;
  onRetryLoad?: () => void;
}

export const SplashPage = memo(({
  imageSrc,
  onContinue,
  isDataLoaded,
  loadError = null,
  onRetryLoad,
}: SplashPageProps): JSX.Element => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const isSmallScreen = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isSmallScreen ? "column" : "row",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#f0f1f0",
      }}
    >
      <div
        aria-label="Splash illustration"
        style={{
          flex: isSmallScreen ? "0 0 auto" : "0 0 50%",
          width: isSmallScreen ? "100%" : "50%",
          height: isSmallScreen ? "280px" : "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isSmallScreen ? "20px" : "48px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "640px",
            aspectRatio: "1236 / 1080",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {!imageFailed && (
            <img
              src={imageSrc}
              alt="FIS Lending Suite Feedback Wall"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                opacity: imageLoaded ? 1 : 0,
                transition: "opacity 300ms ease",
              }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
            />
          )}
          {(!imageLoaded || imageFailed) && (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f3f4f6",
                color: "#6b7280",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              Image placeholder
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          flex: isSmallScreen ? "1 1 auto" : "0 0 50%",
          width: isSmallScreen ? "100%" : "50%",
          height: isSmallScreen ? "auto" : "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: isSmallScreen ? "40px 24px" : "48px 64px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "640px",
            aspectRatio: isSmallScreen ? undefined : "1236 / 1080",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#6b7280",
                margin: 0,
              }}
            >
              FIS Lending Suite
            </p>
            <h1
              style={{
                fontSize: "3rem",
                fontWeight: 800,
                lineHeight: 1.15,
                color: "#1a2b4a",
                margin: 0,
                maxWidth: "500px",
              }}
            >
              Welcome to the
              <br />
              FIS Lending Suite Feedback Wall
            </h1>
            <p
              style={{
                fontSize: "1.125rem",
                lineHeight: 1.6,
                color: "#6b7280",
                margin: 0,
                maxWidth: "460px",
              }}
            >
              Review products, capture feedback, and monitor responses in one place.
            </p>
          </div>

          <div>
            {isDataLoaded ? (
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: "420px",
                  padding: "18px 32px",
                  backgroundColor: "#16a34a",
                  color: "#ffffff",
                  fontSize: "1rem",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "center",
                }}
                onClick={onContinue}
              >
                Enter Feedback Wall
              </button>
            ) : loadError ? (
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  maxWidth: "420px",
                  flexDirection: "column",
                  gap: "12px",
                  borderRadius: "8px",
                  border: "1px solid #fecaca",
                  backgroundColor: "#fef2f2",
                  padding: "16px",
                  boxSizing: "border-box",
                }}
              >
                <p style={{ margin: 0, fontSize: "14px", color: "#b91c1c" }}>{loadError}</p>
                <button
                  type="button"
                  style={{
                    borderRadius: "8px",
                    border: "1px solid #d1d5db",
                    backgroundColor: "#ffffff",
                    padding: "12px 24px",
                    color: "#374151",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  onClick={onRetryLoad}
                >
                  Retry Loading
                </button>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>Loading data...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
