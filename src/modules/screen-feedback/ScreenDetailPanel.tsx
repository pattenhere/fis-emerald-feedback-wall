import { memo, type FormEvent, useMemo, useState } from "react";
import type { AppScreen, FeedbackType } from "../../types/domain";

const FEEDBACK_TYPES: Array<{ id: FeedbackType; label: string }> = [
  { id: "pain-point", label: "Pain Point" },
  { id: "confusing", label: "Confusing" },
  { id: "missing-element", label: "Missing Element" },
  { id: "works-well", label: "Works Well" },
  { id: "suggestion", label: "Suggestion" },
];

const FOLLOW_UP_FALLBACK: Record<FeedbackType, string> = {
  "pain-point": "What would you have expected to happen instead?",
  confusing: "Was it the terminology, the layout, or something else?",
  "missing-element": "What action or information did you expect to see here?",
  "works-well": "What would make this even better for your workflow?",
  suggestion: "If we only changed one thing first, what should it be?",
};

interface ScreenDetailPanelProps {
  screen: AppScreen;
  onSubmitFeedback: (input: {
    app: AppScreen["app"];
    screenId: string;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => string;
  onSaveFollowUp: (feedbackId: string, question: string, response?: string) => void;
  onPromptNextScreen: () => void;
  canPromptNextScreen: boolean;
}

type FlowStage = "compose" | "follow-up" | "done";

export const ScreenDetailPanel = memo(({
  screen,
  onSubmitFeedback,
  onSaveFollowUp,
  onPromptNextScreen,
  canPromptNextScreen,
}: ScreenDetailPanelProps): JSX.Element => {
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [error, setError] = useState("");
  const [flowStage, setFlowStage] = useState<FlowStage>("compose");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null);

  const helperText = useMemo(() => {
    if (flowStage === "done") {
      return "Feedback captured. You can continue to another screen.";
    }
    if (flowStage === "follow-up") {
      return "Optional: add one more detail to strengthen synthesis quality.";
    }
    return "Tag your feedback and optionally add context.";
  }, [flowStage]);

  const requestFollowUpQuestion = (type: FeedbackType): void => {
    const fallbackQuestion = FOLLOW_UP_FALLBACK[type];
    setFollowUpQuestion(fallbackQuestion);

    const start = performance.now();
    window.setTimeout(() => {
      if (performance.now() - start > 1500) {
        return;
      }
      const generated = `${fallbackQuestion} (about ${screen.name})`;
      setFollowUpQuestion(generated);
    }, 700);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!feedbackType) {
      setError("Select a feedback type before submitting.");
      return;
    }

    const submissionId = onSubmitFeedback({
      app: screen.app,
      screenId: screen.id,
      screenName: screen.name,
      type: feedbackType,
      text: feedbackText,
    });

    setError("");
    setFeedbackText("");
    setLastSubmissionId(submissionId);
    requestFollowUpQuestion(feedbackType);
    setFlowStage("follow-up");
  };

  const handleFollowUp = (response?: string): void => {
    if (!lastSubmissionId || !feedbackType) {
      return;
    }
    onSaveFollowUp(lastSubmissionId, followUpQuestion || FOLLOW_UP_FALLBACK[feedbackType], response);
    setFollowUpAnswer("");
    setFeedbackType(null);
    setFlowStage("done");
  };

  return (
    <section className="screen-detail">
      <div className="detail-shell">
        <article className="wireframe-mock ai-treatment">
          <div className="wireframe-window">
            <div className="wireframe-window-bar">
              <div className="wireframe-dots" aria-hidden="true">
                <span className="wireframe-dot" />
                <span className="wireframe-dot" />
                <span className="wireframe-dot" />
              </div>
              <p className="wireframe-window-title">{screen.name}</p>
            </div>
            <div className="wireframe-window-body" aria-hidden="true">
              <div className="wireframe-line wireframe-line-short" />
              <div className="wireframe-line wireframe-line-mid" />
              <div className="wireframe-blocks">
                <div className="wireframe-block" />
                <div className="wireframe-block" />
              </div>
              <div className="wireframe-line wireframe-line-long" />
              <div className="wireframe-line wireframe-line-mid" />
              <div className="wireframe-footer-line">
                <span className="wireframe-footer-dot" />
                <span className="wireframe-footer-stroke" />
              </div>
            </div>
          </div>
          <p className="wireframe-caption">Representative wireframe · not final UI</p>
        </article>

        <form className="feedback-panel feature-feedback-panel" onSubmit={handleSubmit}>
          <h3>Type of feedback</h3>
          <p className="helper-copy">{helperText}</p>

          {flowStage === "compose" && (
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

              <h3>Tell us more</h3>
              <textarea
                className="feedback-detail-textarea"
                placeholder="What specifically on this screen? Be as detailed as you like..."
                rows={4}
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                maxLength={900}
              />
              {error && <p className="error-text">{error}</p>}

              <div className="feedback-actions feedback-actions--anchored">
                <button type="submit" className="primary-btn feedback-submit-btn">
                  Submit Feedback
                </button>
              </div>
            </div>
          )}

          {flowStage === "follow-up" && (
            <div className="follow-up-shell">
              <h3>Tell us more</h3>
              <p className="follow-up-question">{followUpQuestion}</p>
              <input
                type="text"
                value={followUpAnswer}
                maxLength={240}
                placeholder="Optional follow-up response"
                onChange={(event) => setFollowUpAnswer(event.target.value)}
              />
              <div className="feedback-actions">
                <button
                  type="button"
                  className="primary-btn feedback-submit-btn"
                  onClick={() => handleFollowUp(followUpAnswer)}
                >
                  Save Follow-up
                </button>
                <button type="button" className="secondary-btn" onClick={() => handleFollowUp()}>
                  Skip
                </button>
              </div>
            </div>
          )}

          {flowStage === "done" && (
            <div className="feedback-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={!canPromptNextScreen}
                onClick={() => {
                  onPromptNextScreen();
                  setFlowStage("compose");
                }}
              >
                Feedback another screen →
              </button>
            </div>
          )}
        </form>
      </div>
    </section>
  );
});
