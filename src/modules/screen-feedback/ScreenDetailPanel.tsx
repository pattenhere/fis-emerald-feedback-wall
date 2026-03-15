import { memo, type FormEvent, useEffect, useMemo, useState } from "react";
import { PaginationControls } from "../pagination/PaginationControls";
import { usePagination } from "../pagination/usePagination";
import type { AppScreen, FeedbackType, ScreenFeedback } from "../../types/domain";

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
  const [feedbackPage, setFeedbackPage] = useState(1);
  const feedbackPagination = usePagination(feedbackHistory, feedbackPage, 5);

  useEffect(() => {
    setFeedbackPage(1);
  }, [screen.id]);

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

  const formatFeedbackType = (type: FeedbackType): string =>
    type
      .split("-")
      .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
      .join(" ");

  const formatCreatedAt = (createdAt: string): string => {
    const timestamp = new Date(createdAt);
    if (Number.isNaN(timestamp.getTime())) {
      return createdAt;
    }
    return timestamp.toLocaleString([], {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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
          <p className="wireframe-caption">Representative wireframe only · not final UI</p>
        </article>

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
      {feedbackHistory.length > 0 && (
        <article className="feature-feedback-history">
          <header className="feature-feedback-history-head">
            <h3>Submitted Feedback</h3>
            <p>
              Showing {feedbackPagination.startItem}-{feedbackPagination.endItem} of{" "}
              {feedbackPagination.totalItems}
            </p>
          </header>
          <div className="feature-feedback-table-wrap">
            <table className="feature-feedback-table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Type</th>
                  <th>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {feedbackPagination.pageItems.map((item) => (
                  <tr key={item.id}>
                    <td>{formatCreatedAt(item.createdAt)}</td>
                    <td>{formatFeedbackType(item.type)}</td>
                    <td>{item.text?.trim() || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="feature-feedback-history-footer">
            <PaginationControls
              page={feedbackPagination.page}
              totalPages={feedbackPagination.totalPages}
              onPageChange={setFeedbackPage}
            />
          </footer>
        </article>
      )}
    </section>
  );
});
