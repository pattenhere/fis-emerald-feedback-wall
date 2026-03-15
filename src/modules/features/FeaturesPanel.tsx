import { memo, type KeyboardEvent, useState } from "react";
import type { AppArea, AppScreen, FeatureRequest } from "../../types/domain";

interface FeaturesPanelProps {
  items: FeatureRequest[];
  activeApp: AppArea;
  selectedScreen: AppScreen;
  selectedCategoryLabel: string;
  onAdd: (input: {
    title: string;
    workflowContext?: string;
    app: AppArea;
    productId: number;
    featureId?: number;
    screenId?: number;
    screenName: string;
  }) => void;
  onUpvote: (featureId: number) => void;
}

export const FeaturesPanel = memo(({
  items,
  activeApp,
  selectedScreen,
  selectedCategoryLabel,
  onAdd,
  onUpvote,
}: FeaturesPanelProps): JSX.Element => {
  const [title, setTitle] = useState("");
  const [workflowContext, setWorkflowContext] = useState("");

  const handleSubmit = (): void => {
    if (!title.trim()) {
      return;
    }

    onAdd({
      title,
      workflowContext,
      app: activeApp,
      productId: selectedScreen.productId ?? 0,
      featureId: selectedScreen.featureId,
      screenId: Number(selectedScreen.id),
      screenName: selectedScreen.name,
    });
    setTitle("");
    setWorkflowContext("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    handleSubmit();
  };

  return (
    <section className="panel-stack">
      <header>
        <h2>Feature Requests</h2>
        <p>Area: {selectedCategoryLabel}</p>
      </header>

      <div className="inline-form">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add Feature (press Enter to save)"
          maxLength={180}
          aria-label="Add feature"
        />
        <input
          type="text"
          value={workflowContext}
          onChange={(event) => setWorkflowContext(event.target.value)}
          placeholder="Optional workflow context"
          maxLength={180}
          aria-label="Workflow context"
        />
      </div>

      <ul className="list-reset panel-list">
        {items.map((feature) => (
          <li key={feature.id} className="feature-card feature-card--stacked-vote">
            <div className="feature-card-body">
              <p className="card-title">{feature.title}</p>
              <p className="feature-brief">{feature.workflowContext ?? feature.title}</p>
              <p className="card-meta">Area: {feature.screenName}</p>
              <button
                type="button"
                className={`vote-pill ${feature.votes >= 0 ? "is-positive" : "is-negative"}`}
                onClick={() => onUpvote(Number(feature.id))}
              >
                {feature.votes >= 0 ? "↑" : "↓"} {Math.abs(feature.votes)}
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="quote-card">
            <p>No features captured for this area yet.</p>
          </li>
        )}
      </ul>
    </section>
  );
});
