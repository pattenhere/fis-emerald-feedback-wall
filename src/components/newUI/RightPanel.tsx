import { memo, useEffect, useMemo, useState, type FormEvent } from "react";
import type { FeedbackType } from "../../types/domain";
import type { RightPanelSubmitPayload, ScreenRecord } from "./types";

interface RightPanelProps {
  isOpen: boolean;
  activeScreenName: string | null;
  onClose: () => void;
  onSubmitSuccess: () => void;
  stayOpenAfterSubmit: boolean;
  activeScreen: ScreenRecord | null;
  onSubmitFeedback: (payload: RightPanelSubmitPayload) => number;
  onAppendFollowUp: (feedbackId: number, question: string, response?: string) => void;
}

type FormType = "issue" | "suggestion" | "missing" | "works_well";

const typeToFeedback: Record<FormType, FeedbackType> = {
  issue: "issue",
  suggestion: "suggestion",
  missing: "missing",
  works_well: "works-well",
};

const typeLabel: Record<FormType, string> = {
  issue: "Issue",
  suggestion: "Suggestion",
  missing: "Missing",
  works_well: "Works Well",
};

const typePlaceholder: Record<FormType, string> = {
  issue: "What is creating friction on this screen?",
  suggestion: "What change would improve this screen?",
  missing: "What element or workflow is missing?",
  works_well: "What is working especially well here?",
};

const followUpQuestionByType: Record<FormType, string> = {
  issue: "What outcome was blocked because of this issue?",
  suggestion: "What impact would this suggestion have for your workflow?",
  missing: "Where in your flow did you expect to see this missing element?",
  works_well: "What made this part work well for you?",
};

export const RightPanel = memo(({
  isOpen,
  activeScreenName,
  onClose,
  onSubmitSuccess,
  stayOpenAfterSubmit,
  activeScreen,
  onSubmitFeedback,
  onAppendFollowUp,
}: RightPanelProps): JSX.Element => {
  const [type, setType] = useState<FormType | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [followUpState, setFollowUpState] = useState<{
    feedbackId: number;
    question: string;
    response: string;
  } | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(""), 2000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setFollowUpState(null);
    }
  }, [isOpen]);

  const placeholder = useMemo(() => (type ? typePlaceholder[type] : "Select a feedback type to begin."), [type]);

  const resetForm = (): void => {
    setType(null);
    setText("");
    setError(null);
  };

  const finalizeAfterSubmit = (): void => {
    if (!stayOpenAfterSubmit) {
      onSubmitSuccess();
      onClose();
      return;
    }
    setSuccessMessage("Feedback submitted!");
    resetForm();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!activeScreen) {
      setError("Select a screen before submitting feedback.");
      return;
    }
    if (!type) {
      setError("Select a feedback type.");
      return;
    }

    const feedbackId = onSubmitFeedback({
      app: activeScreen.app,
      productId: activeScreen.productId,
      featureId: activeScreen.featureId,
      screenId: activeScreen.id,
      screenName: activeScreen.name,
      type: typeToFeedback[type],
      text,
    });
    setError(null);
    setFollowUpState({
      feedbackId,
      question: followUpQuestionByType[type],
      response: "",
    });
  };

  const submitFollowUp = (skip = false): void => {
    if (!followUpState) return;
    onAppendFollowUp(
      followUpState.feedbackId,
      followUpState.question,
      skip ? undefined : followUpState.response,
    );
    setFollowUpState(null);
    finalizeAfterSubmit();
  };

  return (
    <aside className={`newui-right-panel ${isOpen ? "is-open" : ""}`} aria-label="Screen feedback panel">
      <header className="newui-right-head">
        <h3>Feedback for: {activeScreenName ?? "—"}</h3>
        <button type="button" className="newui-right-close" onClick={onClose} aria-label="Close feedback panel">
          ×
        </button>
      </header>

      {!followUpState ? (
        <form className="newui-right-form" onSubmit={handleSubmit}>
          <div className="feedback-types">
            {(Object.keys(typeLabel) as FormType[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`chip ${type === id ? "is-active" : ""}`}
                onClick={() => {
                  setType(id);
                  setError(null);
                }}
              >
                {typeLabel[id]}
              </button>
            ))}
          </div>
          <textarea
            className="feedback-detail-textarea"
            rows={5}
            value={text}
            placeholder={placeholder}
            onChange={(event) => setText(event.target.value)}
          />
          {error && <p className="error-text">{error}</p>}
          {successMessage && <p className="newui-inline-success">{successMessage}</p>}
          <button type="submit" className="primary-btn">
            Submit Feedback
          </button>
        </form>
      ) : (
        <section className="follow-up-shell newui-follow-up">
          <p className="follow-up-question">{followUpState.question}</p>
          <textarea
            className="feedback-detail-textarea"
            rows={4}
            placeholder="Optional follow-up response"
            value={followUpState.response}
            onChange={(event) => setFollowUpState((current) => (current ? { ...current, response: event.target.value } : null))}
          />
          <div className="feedback-actions">
            <button type="button" className="primary-btn" onClick={() => submitFollowUp(false)}>
              Submit answer
            </button>
            <button type="button" className="secondary-btn" onClick={() => submitFollowUp(true)}>
              Skip
            </button>
          </div>
        </section>
      )}
    </aside>
  );
});
