import { memo, useMemo, useState } from "react";
import type { FeatureRequest, KudosQuote } from "../../types/domain";

interface SeeAllViewProps {
  tab: "features" | "comments";
  onClose: () => void;
  featureItems: FeatureRequest[];
  commentItems: KudosQuote[];
  onUpvoteFeature: (featureId: number) => void;
}

export const SeeAllView = memo(({
  tab,
  onClose,
  featureItems,
  commentItems,
  onUpvoteFeature,
}: SeeAllViewProps): JSX.Element => {
  const [featureSort, setFeatureSort] = useState<"votes" | "recent">("votes");

  const sortedFeatures = useMemo(() => {
    const rows = featureItems.slice();
    if (featureSort === "recent") {
      return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return rows.sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [featureItems, featureSort]);

  const sortedComments = useMemo(
    () => commentItems.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [commentItems],
  );

  return (
    <section className="newui-see-all" aria-label="See all responses">
      <header className="newui-see-all-head">
        <h2>{tab === "features" ? "All Feature Requests" : "All Comments"}</h2>
        <button type="button" className="newui-see-all-back" onClick={onClose}>
          ← Back to screens
        </button>
      </header>

      {tab === "features" ? (
        <>
          <div className="newui-see-all-sort">
            <span>Sort:</span>
            <button
              type="button"
              className={featureSort === "votes" ? "is-active" : ""}
              onClick={() => setFeatureSort("votes")}
            >
              Most voted
            </button>
            <button
              type="button"
              className={featureSort === "recent" ? "is-active" : ""}
              onClick={() => setFeatureSort("recent")}
            >
              Most recent
            </button>
          </div>
          <div className="newui-see-all-list">
            {sortedFeatures.length === 0 ? (
              <article className="newui-see-all-card is-empty">
                <p>No feature requests yet. Be the first!</p>
              </article>
            ) : (
              sortedFeatures.map((feature) => (
                <article key={feature.id} className="newui-see-all-card">
                  <h3>{feature.title}</h3>
                  {feature.workflowContext && <p className="newui-see-all-context">{feature.workflowContext}</p>}
                  <p className="newui-see-all-meta">
                    {typeof feature.impactScore === "number" ? `Impact ${feature.impactScore}/5 · ` : ""}
                    Votes: {feature.votes}
                  </p>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => onUpvoteFeature(Number(feature.id))}
                  >
                    ↑ Upvote
                  </button>
                </article>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="newui-see-all-list">
          {sortedComments.length === 0 ? (
            <article className="newui-see-all-card is-empty">
              <p>No comments yet. Be the first!</p>
            </article>
          ) : (
            sortedComments.map((comment) => (
              <article key={comment.id} className="newui-see-all-card">
                <p>{comment.text}</p>
                <p className="newui-see-all-meta">
                  {comment.roleLabel ?? (comment.role === "unspecified" ? "Unattributed" : comment.role.toUpperCase())}
                  {comment.isPublicSafe ?? comment.consentPublic ? " · Public OK" : ""}
                </p>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
});
