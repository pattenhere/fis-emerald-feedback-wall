import { memo, useEffect, useState } from "react";
import type { FeedbackType, ScreenFeedback } from "../../types/domain";
import { PaginationControls } from "../pagination/PaginationControls";
import { usePagination } from "../pagination/usePagination";

interface SubmittedFeedbackTableProps {
  title?: string;
  feedbackHistory: ScreenFeedback[];
  pageSize?: number;
  className?: string;
}

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

export const SubmittedFeedbackTable = memo(({
  title = "Submitted Feedback",
  feedbackHistory,
  pageSize = 5,
  className = "feature-feedback-history",
}: SubmittedFeedbackTableProps): JSX.Element | null => {
  const [feedbackPage, setFeedbackPage] = useState(1);
  const feedbackPagination = usePagination(feedbackHistory, feedbackPage, pageSize);

  useEffect(() => {
    setFeedbackPage(1);
  }, [feedbackHistory]);

  if (feedbackHistory.length === 0) {
    return null;
  }

  return (
    <article className={className}>
      <header className="feature-feedback-history-head">
        <h3>{title}</h3>
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
  );
});
