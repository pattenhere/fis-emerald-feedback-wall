import { type KeyboardEvent, useState } from "react";
import type { AppArea, AppScreen, FeatureRequest } from "../../types/domain";

interface FeaturesPanelProps {
  items: FeatureRequest[];
  activeApp: AppArea;
  selectedScreen: AppScreen;
  onAdd: (input: {
    title: string;
    app: AppArea;
    screenId: string;
    screenName: string;
  }) => void;
  onUpvote: (featureId: string) => void;
}

export const FeaturesPanel = ({
  items,
  activeApp,
  selectedScreen,
  onAdd,
  onUpvote,
}: FeaturesPanelProps): JSX.Element => {
  const [title, setTitle] = useState("");

  const handleSubmit = (): void => {
    if (!title.trim()) {
      return;
    }

    onAdd({
      title,
      app: activeApp,
      screenId: selectedScreen.id,
      screenName: selectedScreen.name,
    });
    setTitle("");
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
        <p>Area: {selectedScreen.name}</p>
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
      </div>

      <ul className="list-reset panel-list">
        {items.map((feature) => (
          <li key={feature.id} className="feature-card">
            <div className="feature-card-body">
              <p className="card-title">{feature.title}</p>
              <p className="feature-brief">{feature.workflowContext ?? feature.title}</p>
              <p className="card-meta">Area: {feature.screenName}</p>
            </div>
            <button type="button" className="vote-pill" onClick={() => onUpvote(feature.id)}>
              Votes {feature.votes}
            </button>
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
};
