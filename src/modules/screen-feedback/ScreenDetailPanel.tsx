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
      <article className="wireframe-mock">
        <p className="wireframe-tag">{screen.wireframeLabel}</p>
        <h2>{screen.name}</h2>
        <p>{screen.description}</p>
      </article>

      <form className="feedback-panel" onSubmit={handleSubmit}>
        <h3>Screen Feedback</h3>
        <p className="helper-copy">{helperText}</p>

        {flowStage === "compose" && (
          <>
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
              placeholder="Optional: what happened, where, and why it matters in your workflow"
              rows={4}
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              maxLength={900}
            />
            {error && <p className="error-text">{error}</p>}

            <div className="feedback-actions">
              <button type="submit" className="primary-btn">
                Submit Feedback
              </button>
            </div>
          </>
        )}

        {flowStage === "follow-up" && (
          <div className="follow-up-shell">
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
                className="primary-btn"
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
              Feedback Another Screen
            </button>
          </div>
        )}
      </form>
    </section>
  );
});
