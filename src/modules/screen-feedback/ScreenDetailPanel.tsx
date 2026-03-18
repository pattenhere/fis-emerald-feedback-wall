import { memo, type FormEvent, useMemo, useState } from "react";
import type { AppScreen, FeedbackType, ScreenFeedback } from "../../types/domain";
import { SubmittedFeedbackTable } from "./SubmittedFeedbackTable";
import { WireframePreview } from "./WireframePreview";

const FEEDBACK_TYPES: Array<{ id: FeedbackType; label: string }> = [
  { id: "issue", label: "Issue" },
  { id: "suggestion", label: "Suggestion" },
  { id: "missing", label: "Missing" },
  { id: "works-well", label: "Works Well" },
];

interface ScreenDetailPanelProps {
  screen: AppScreen;
  feedbackHistory: ScreenFeedback[];
  onSubmitFeedback: (input: {
    app: AppScreen["app"];
    productId: number;
    featureId?: number;
    screenId?: number;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => number;
}

export const ScreenDetailPanel = memo(({
  screen,
  feedbackHistory,
  onSubmitFeedback,
}: ScreenDetailPanelProps): JSX.Element => {
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [error, setError] = useState("");

  const helperText = useMemo(() => "Select a feedback type, add details, and submit.", []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!feedbackType) {
      setError("Select a feedback type before submitting.");
      return;
    }

    onSubmitFeedback({
      app: screen.app,
      productId: screen.productId ?? 0,
      featureId: screen.featureId,
      screenId: Number(screen.id),
      screenName: screen.name,
      type: feedbackType,
      text: feedbackText,
    });

    setError("");
    setFeedbackType(null);
    setFeedbackText("");
  };

  return (
    <section className="screen-detail">
      <div className="detail-shell">
        <WireframePreview title={screen.name} />

        <form className="feedback-panel feature-feedback-panel" onSubmit={handleSubmit}>
          <h3>Feature feedback</h3>
          <p className="helper-copy">{helperText}</p>

          <div className="compose-feedback-shell">
            <div className="feedback-types">
              {FEEDBACK_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={`chip ${feedbackType === type.id ? "is-active" : ""}`}
                  onClick={() => {
                    setFeedbackType(type.id);
                    setError("");
                  }}
                >
                  {type.label}
                </button>
              ))}
            </div>
            <textarea
              className="feedback-detail-textarea"
              rows={5}
              placeholder="What specifically on this feature worked well, is missing, or needs improvement?"
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
            />
            {error && <p className="error-text">{error}</p>}

            <div className="feedback-actions feedback-actions--anchored">
              <button type="submit" className="primary-btn feedback-submit-btn">
                Submit Feedback
              </button>
            </div>
          </div>

        </form>
      </div>
      <SubmittedFeedbackTable feedbackHistory={feedbackHistory} />
    </section>
  );
});
