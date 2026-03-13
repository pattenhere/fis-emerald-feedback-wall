import { type FormEvent, useMemo, useState } from "react";
import type { AppScreen, FeedbackType } from "../../types/domain";

const FEEDBACK_TYPES: Array<{ id: FeedbackType; label: string }> = [
  { id: "pain-point", label: "Pain Point" },
  { id: "confusing", label: "Confusing" },
  { id: "missing-element", label: "Missing Element" },
  { id: "works-well", label: "Works Well" },
  { id: "suggestion", label: "Suggestion" },
];

interface ScreenDetailPanelProps {
  screen: AppScreen;
  onSubmitFeedback: (input: {
    app: AppScreen["app"];
    screenId: string;
    screenName: string;
    type: FeedbackType;
    text?: string;
  }) => void;
  onPromptNextScreen: () => void;
  canPromptNextScreen: boolean;
}

export const ScreenDetailPanel = ({
  screen,
  onSubmitFeedback,
  onPromptNextScreen,
  canPromptNextScreen,
}: ScreenDetailPanelProps): JSX.Element => {
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const helperText = useMemo(() => {
    if (submitted) {
      return "Feedback captured. You can submit another screen signal now.";
    }
    return "Tag your feedback and optionally add context.";
  }, [submitted]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!feedbackType) {
      setError("Select a feedback type before submitting.");
      return;
    }

    onSubmitFeedback({
      app: screen.app,
      screenId: screen.id,
      screenName: screen.name,
      type: feedbackType,
      text: feedbackText,
    });

    setError("");
    setSubmitted(true);
    setFeedbackText("");
    setFeedbackType(null);
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
          rows={5}
          value={feedbackText}
          onChange={(event) => setFeedbackText(event.target.value)}
          maxLength={900}
        />
        {error && <p className="error-text">{error}</p>}

        <div className="feedback-actions">
          <button type="submit" className="primary-btn">
            Submit Feedback
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={!submitted || !canPromptNextScreen}
            onClick={() => {
              onPromptNextScreen();
              setSubmitted(false);
            }}
          >
            Feedback Another Screen
          </button>
        </div>
      </form>
    </section>
  );
};
