import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SynthesisP0Item } from "../synthesisRunStore";
import { estimateTShirtSizing } from "./aiEstimate";
import { SIZE_HOUR_MIDPOINTS, type AIEstimate, type TShirtSize } from "./types";

export type TShirtSizingCardProps = {
  item: SynthesisP0Item;
  size: TShirtSize | null;
  notes: string;
  aiEstimate: AIEstimate | null;
  alreadySizedItems: Array<{ title: string; size: TShirtSize | null }>;
  onSizeChange: (size: TShirtSize | null) => void;
  onNotesChange: (notes: string) => void;
  onAIEstimateChange: (estimate: AIEstimate | null) => void;
};

const SIZE_OPTIONS: TShirtSize[] = ["XS", "S", "M", "L"];
const AI_ERROR_TEXT = "AI estimate unavailable. Size manually.";

const computeHoursRemaining = (items: Array<{ title: string; size: TShirtSize | null }>): number =>
  8 - items.reduce((total, item) => total + (item.size ? SIZE_HOUR_MIDPOINTS[item.size] : 0), 0);

const normalizeSizedItems = (
  item: SynthesisP0Item,
  size: TShirtSize | null,
  alreadySizedItems: Array<{ title: string; size: TShirtSize | null }>,
): Array<{ title: string; size: TShirtSize }> => {
  const rows = alreadySizedItems
    .filter((entry): entry is { title: string; size: TShirtSize } => entry != null && entry.size != null)
    .map((entry) => ({ title: entry.title, size: entry.size }));

  if (size && !rows.some((entry) => entry.title === item.title)) {
    rows.push({ title: item.title, size });
  }

  return rows;
};

const autoResizeTextarea = (textarea: HTMLTextAreaElement | null): void => {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
};

export const TShirtSizingCard = ({
  item,
  size,
  notes,
  aiEstimate,
  alreadySizedItems,
  onSizeChange,
  onNotesChange,
  onAIEstimateChange,
}: TShirtSizingCardProps): JSX.Element => {
  const [isRationaleOpen, setIsRationaleOpen] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const sizeRef = useRef<TShirtSize | null>(size);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    autoResizeTextarea(notesRef.current);
  }, [notes]);

  const alreadySizedSnapshot = useMemo(
    () => normalizeSizedItems(item, size, alreadySizedItems),
    [alreadySizedItems, item, size],
  );

  const handleSizeSelect = (nextSize: TShirtSize): void => {
    onSizeChange(size === nextSize ? null : nextSize);
  };

  const handleEstimate = async (): Promise<void> => {
    const hoursRemaining = computeHoursRemaining(alreadySizedSnapshot);
    console.log(`[tshirt-sizing] Estimating: ${item.title} | Budget remaining: ${hoursRemaining}h`);
    setIsEstimating(true);
    setErrorText(null);

    try {
      const estimate = await estimateTShirtSizing({
        title: item.title,
        rationale: item.rationale.slice(0, 200),
        evidenceSources: item.evidenceSources,
        feasibilityNote: item.feasibilityNote ?? "",
        alreadySizedItems: alreadySizedSnapshot,
        hoursRemaining,
      });
      onAIEstimateChange(estimate);
      if (!sizeRef.current) {
        onSizeChange(estimate.size);
      }
    } catch {
      onAIEstimateChange(null);
      setErrorText(AI_ERROR_TEXT);
    } finally {
      setIsEstimating(false);
    }
  };

  const feasibilityNote = item.feasibilityNote?.trim() ?? "";
  const hasFeasibilityNote = feasibilityNote.length > 0;

  return (
    <article className="synthesis-tshirt-card">
      <div className="synthesis-tshirt-card-header">
        <div className="synthesis-tshirt-card-title-row">
          <h3>{item.title}</h3>
        </div>
        <button
          type="button"
          className="synthesis-tshirt-rationale-toggle"
          aria-expanded={isRationaleOpen}
          onClick={() => setIsRationaleOpen((current) => !current)}
        >
          {isRationaleOpen ? (<><span>Hide</span> <ChevronUp size={13} /></>) : (<><span>Why this was selected</span> <ChevronDown size={13} /></>)}
        </button>
        {hasFeasibilityNote ? <span className="synthesis-tshirt-feasibility-note">Feasibility: {feasibilityNote}</span> : null}
      </div>

      {isRationaleOpen ? <p className="synthesis-tshirt-rationale-copy">{item.rationale}</p> : null}

      <div className="synthesis-tshirt-size-selector" role="radiogroup" aria-label={`T-shirt size for ${item.title}`}>
        {SIZE_OPTIONS.map((candidate) => {
          const isSelected = size === candidate;
          return (
            <button
              key={candidate}
              type="button"
              className={`synthesis-tshirt-size-button${isSelected ? " is-selected" : ""}`}
              aria-pressed={isSelected}
              onClick={() => handleSizeSelect(candidate)}
            >
              {candidate}
            </button>
          );
        })}
      </div>

      <label className="synthesis-tshirt-notes-field">
        <span>Notes</span>
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(event) => {
            onNotesChange(event.target.value);
            autoResizeTextarea(event.currentTarget);
          }}
          rows={3}
          placeholder="Add sizing notes or assumptions..."
        />
      </label>

      <div className="synthesis-tshirt-ai-section">
        <button
          type="button"
          className="synthesis-tshirt-ai-button"
          onClick={() => void handleEstimate()}
          disabled={isEstimating}
        >
          {isEstimating ? "Estimating..." : "Get AI estimate"}
        </button>
      </div>

      {aiEstimate ? (
        <section className="synthesis-tshirt-ai-result" aria-live="polite">
          <strong className="synthesis-tshirt-ai-title">AI estimate</strong>
          <div className="synthesis-tshirt-ai-result-grid">
            <div>
              <span className="synthesis-tshirt-ai-label">Size suggestion</span>
              <strong>{aiEstimate.size}</strong>
            </div>
            <div>
              <span className="synthesis-tshirt-ai-label">Hours estimate</span>
              <strong>{aiEstimate.hoursEstimate}</strong>
            </div>
          </div>
          <div className="synthesis-tshirt-ai-result-body">
            <div>
              <span className="synthesis-tshirt-ai-label">Rationale</span>
              <p>{aiEstimate.rationale}</p>
            </div>
            <div>
              <span className="synthesis-tshirt-ai-label">Risk</span>
              <p>{aiEstimate.risk}</p>
            </div>
          </div>
        </section>
      ) : null}

      {errorText ? <p className="synthesis-tshirt-ai-error">{errorText}</p> : null}
    </article>
  );
};
