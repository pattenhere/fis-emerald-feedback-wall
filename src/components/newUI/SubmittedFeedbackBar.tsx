import { memo } from "react";
import { SubmittedFeedbackTable } from "../../modules/screen-feedback/SubmittedFeedbackTable";
import type { ScreenFeedback } from "../../types/domain";

interface SubmittedFeedbackBarProps {
  feedbackHistory: ScreenFeedback[];
}

export const SubmittedFeedbackBar = memo(({ feedbackHistory }: SubmittedFeedbackBarProps): JSX.Element => {
  return (
    <div className="newui-submitted-bar">
      {feedbackHistory.length > 0 ? (
        <SubmittedFeedbackTable
          title="Submitted Feedback"
          feedbackHistory={feedbackHistory}
          className="feature-feedback-history newui-feedback-history"
        />
      ) : (
        <article className="feature-feedback-history newui-feedback-history is-empty">
          <header className="feature-feedback-history-head">
            <h3>Submitted Feedback</h3>
            <p>No responses captured yet.</p>
          </header>
        </article>
      )}
    </div>
  );
});
