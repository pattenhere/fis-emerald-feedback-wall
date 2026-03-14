import { memo, useMemo } from "react";
import type { CardSortConcept, CardSortResponse, CardSortTier } from "../../types/domain";

interface CardSortPanelProps {
  concepts: CardSortConcept[];
  responses: CardSortResponse[];
  onAssignTier: (conceptId: string, tier: CardSortTier) => void;
}

const TIERS: Array<{ id: CardSortTier; label: string }> = [
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

export const CardSortPanel = memo(({ concepts, responses, onAssignTier }: CardSortPanelProps): JSX.Element => {
  const responseByConceptId = useMemo(
    () => new Map(responses.map((response) => [response.conceptId, response.tier])),
    [responses],
  );

  return (
    <section className="panel-stack">
      <header>
        <h2>Card Sort</h2>
        <p>Optional depth step: rank AI concepts using High / Medium / Low priority.</p>
      </header>

      <ul className="list-reset panel-list">
        {concepts.map((concept) => {
          const activeTier = responseByConceptId.get(concept.id) ?? null;
          return (
            <li key={concept.id} className="quote-card card-sort-card">
              <p className="card-title">{concept.title}</p>
              <p className="feature-brief">{concept.description}</p>
              <div className="tier-row" role="group" aria-label={`${concept.title} priority`}>
                {TIERS.map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    className={`chip tier-chip ${activeTier === tier.id ? "is-active" : ""}`}
                    onClick={() => onAssignTier(concept.id, tier.id)}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
