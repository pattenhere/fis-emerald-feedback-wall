import { memo, useMemo, useState, type FormEvent } from "react";
import type { FeatureRequest, KudosQuote, KudosRole } from "../../types/domain";

interface LeftPanelProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  featureItems: FeatureRequest[];
  commentItems: KudosQuote[];
  onAddFeature: (input: { title: string; workflowContext?: string }) => void;
  onAddComment: (input: { text: string; role: KudosRole; consentPublic: boolean }) => void;
  onSeeAll: (tab: "features" | "comments") => void;
}

export const LeftPanel = memo(({
  isOpen,
  onOpen,
  onClose,
  featureItems,
  commentItems,
  onAddFeature,
  onAddComment,
  onSeeAll,
}: LeftPanelProps): JSX.Element => {
  const [activeTab, setActiveTab] = useState<"features" | "comments">("features");
  const [featureTitle, setFeatureTitle] = useState("");
  const [featureContext, setFeatureContext] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentRole, setCommentRole] = useState<KudosRole>("unspecified");
  const [commentConsent, setCommentConsent] = useState(false);

  const recentFeatures = useMemo(
    () =>
      featureItems
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [featureItems],
  );
  const recentComments = useMemo(
    () =>
      commentItems
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [commentItems],
  );

  const togglePanel = (): void => {
    if (isOpen) {
      onClose();
      return;
    }
    onOpen();
  };

  const truncate = (value: string, max: number): string =>
    value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;

  const handleFeatureSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!featureTitle.trim()) return;
    onAddFeature({
      title: featureTitle.trim(),
      workflowContext: featureContext.trim() || undefined,
    });
    setFeatureTitle("");
    setFeatureContext("");
  };

  const handleCommentSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!commentText.trim()) return;
    onAddComment({
      text: commentText.trim(),
      role: commentRole,
      consentPublic: commentConsent,
    });
    setCommentText("");
    setCommentRole("unspecified");
    setCommentConsent(false);
  };

  return (
    <>
      <button
        type="button"
        className={`newui-left-trigger ${isOpen ? "is-open" : ""}`}
        onClick={togglePanel}
        aria-label={isOpen ? "Close feedback panel" : "Open feedback panel"}
      >
        Feedback
      </button>

      <aside className={`newui-left-panel ${isOpen ? "is-open" : ""}`} aria-label="Feedback panel">
        <header className="newui-left-head">
          <nav className="newui-left-tabs" aria-label="Feedback tabs">
            <button
              type="button"
              className={`newui-left-tab ${activeTab === "features" ? "is-active" : ""}`}
              onClick={() => setActiveTab("features")}
            >
              Features
            </button>
            <button
              type="button"
              className={`newui-left-tab ${activeTab === "comments" ? "is-active" : ""}`}
              onClick={() => setActiveTab("comments")}
            >
              Comments
            </button>
          </nav>
          <button type="button" className="newui-left-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <section className="newui-left-content">
          {activeTab === "features" ? (
            <section className="panel-stack">
              <header>
                <h2>Feature Requests</h2>
              </header>
              <form className="inline-form" onSubmit={handleFeatureSubmit}>
                <input
                  type="text"
                  placeholder="Add Feature (press Enter to save)"
                  value={featureTitle}
                  onChange={(event) => setFeatureTitle(event.target.value)}
                  maxLength={180}
                />
                <input
                  type="text"
                  placeholder="Optional workflow context"
                  value={featureContext}
                  onChange={(event) => setFeatureContext(event.target.value)}
                  maxLength={180}
                />
                <button type="submit" className="primary-btn" disabled={!featureTitle.trim()}>
                  Submit Feature
                </button>
              </form>
              <ul className="list-reset panel-list newui-truncated-list">
                {recentFeatures.length === 0 ? (
                  <li className="quote-card">
                    <p>No feature requests yet. Be the first!</p>
                  </li>
                ) : (
                  recentFeatures.slice(0, 3).map((feature) => (
                    <li key={feature.id} className="quote-card newui-mini-card">
                      <p className="card-title">{truncate(feature.title, 60)}</p>
                      <p className="card-meta">
                        <span className="newui-mini-vote">↑ {feature.votes}</span>
                        {typeof feature.impactScore === "number" ? ` · Impact ${feature.impactScore}/5` : ""}
                      </p>
                    </li>
                  ))
                )}
              </ul>
              {recentFeatures.length > 3 && (
                <button type="button" className="newui-see-all-link" onClick={() => onSeeAll("features")}>
                  See all {recentFeatures.length.toLocaleString()} feature requests →
                </button>
              )}
            </section>
          ) : (
            <section className="panel-stack">
              <header>
                <h2>Comments</h2>
              </header>
              <form className="inline-form" onSubmit={handleCommentSubmit}>
                <textarea
                  rows={4}
                  placeholder="Share a comment or a quote"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  maxLength={800}
                />
                <select value={commentRole} onChange={(event) => setCommentRole(event.target.value as KudosRole)}>
                  <option value="unspecified">Select role (optional)</option>
                  <option value="ops">OPS</option>
                  <option value="eng">ENG</option>
                  <option value="product">PRODUCT</option>
                  <option value="finance">FINANCE</option>
                  <option value="exec">EXEC</option>
                </select>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={commentConsent}
                    onChange={(event) => setCommentConsent(event.target.checked)}
                  />
                  <span>I consent to this quote being used publicly.</span>
                </label>
                <button type="submit" className="primary-btn" disabled={!commentText.trim()}>
                  Submit Comment
                </button>
              </form>
              <ul className="list-reset panel-list newui-truncated-list">
                {recentComments.length === 0 ? (
                  <li className="quote-card">
                    <p>No comments yet. Be the first!</p>
                  </li>
                ) : (
                  recentComments.slice(0, 3).map((comment) => (
                    <li key={comment.id} className="quote-card newui-mini-card">
                      <p>{truncate(comment.text, 80)}</p>
                      <p className="card-meta">
                        {comment.roleLabel ?? (comment.role !== "unspecified" ? comment.role.toUpperCase() : "")}
                        {(comment.roleLabel || comment.role !== "unspecified") && (comment.isPublicSafe ?? comment.consentPublic) ? " · " : ""}
                        {comment.isPublicSafe ?? comment.consentPublic ? "Public OK" : ""}
                      </p>
                    </li>
                  ))
                )}
              </ul>
              {recentComments.length > 3 && (
                <button type="button" className="newui-see-all-link" onClick={() => onSeeAll("comments")}>
                  See all {recentComments.length.toLocaleString()} comments →
                </button>
              )}
            </section>
          )}
        </section>
      </aside>
    </>
  );
});
