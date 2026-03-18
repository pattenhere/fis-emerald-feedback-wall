import { useCallback, useEffect, useMemo, useState } from "react";
import { synthesisModuleApi, type FlaggedInputRecord } from "../services/synthesisModuleApi";

type ModerationCardState = "active" | "keeping" | "kept" | "removing";

interface ModerationCard extends FlaggedInputRecord {
  state: ModerationCardState;
  error: string | null;
}

interface SynthesisModerationPageProps {
  onPendingCountChange: (count: number) => void;
}

const sortBySubmittedAt = (items: ModerationCard[]): ModerationCard[] => {
  return items
    .slice()
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
};

const formatSubmittedAt = (value: string): string => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const SynthesisModerationPage = ({ onPendingCountChange }: SynthesisModerationPageProps): JSX.Element => {
  const [cards, setCards] = useState<ModerationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const refreshFlaggedQueue = useCallback(async (): Promise<void> => {
    setPageError(null);
    try {
      const payload = await synthesisModuleApi.getFlaggedInputs();
      const mapped = payload.items.map((item) => ({
        ...item,
        state: "active" as const,
        error: null,
      }));
      const sorted = sortBySubmittedAt(mapped);
      setCards(sorted);
      onPendingCountChange(payload.pendingCount);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load moderation queue.");
      setCards([]);
      onPendingCountChange(0);
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    void refreshFlaggedQueue();
  }, [refreshFlaggedQueue]);

  const pendingCount = useMemo(
    () => cards.filter((card) => card.state === "active").length,
    [cards],
  );

  const queueIsDone = !loading && pendingCount === 0;

  const handleKeep = useCallback(async (cardId: string) => {
    const target = cards.find((card) => card.id === cardId);
    if (!target || target.state !== "active") return;

    setCards((current) =>
      current.map((card) =>
        card.id === cardId
          ? { ...card, state: "keeping", error: null }
          : card,
      ),
    );
    onPendingCountChange(Math.max(0, pendingCount - 1));

    try {
      const result = await synthesisModuleApi.keepFlaggedInput(cardId);
      setCards((current) =>
        current.map((card) =>
          card.id === cardId
            ? { ...card, state: "kept", error: null }
            : card,
        ),
      );
      onPendingCountChange(Math.max(0, Number(result.pendingCount ?? 0)));
    } catch (error) {
      setCards((current) =>
        current.map((card) =>
          card.id === cardId
            ? { ...card, state: "active", error: error instanceof Error ? error.message : "Unable to keep this input." }
            : card,
        ),
      );
      onPendingCountChange(pendingCount);
    }
  }, [cards, onPendingCountChange, pendingCount]);

  const handleRemove = useCallback(async (cardId: string) => {
    const target = cards.find((card) => card.id === cardId);
    if (!target || target.state !== "active") return;

    setCards((current) =>
      current.map((card) =>
        card.id === cardId
          ? { ...card, state: "removing", error: null }
          : card,
      ),
    );
    onPendingCountChange(Math.max(0, pendingCount - 1));

    try {
      const result = await synthesisModuleApi.removeFlaggedInput(cardId);
      window.setTimeout(() => {
        setCards((current) => current.filter((card) => card.id !== cardId));
      }, 220);
      onPendingCountChange(Math.max(0, Number(result.pendingCount ?? 0)));
    } catch (error) {
      setCards((current) =>
        current.map((card) =>
          card.id === cardId
            ? { ...card, state: "active", error: error instanceof Error ? error.message : "Unable to remove this input." }
            : card,
        ),
      );
      onPendingCountChange(pendingCount);
    }
  }, [cards, onPendingCountChange, pendingCount]);

  return (
    <section className="synthesis-moderation">
      <header className="synthesis-moderation-head">
        <h2>Moderation queue</h2>
        <p>Review flagged inputs before synthesis to keep generated outputs focused and safe.</p>
        <p className="synthesis-moderation-count">{pendingCount.toLocaleString()} items pending review.</p>
      </header>

      {loading && (
        <div className="synthesis-moderation-loading">
          <p>Loading moderation queue...</p>
        </div>
      )}

      {!loading && pageError && (
        <div className="synthesis-moderation-error">
          <p>{pageError}</p>
        </div>
      )}

      {queueIsDone && !pageError && (
        <div className="synthesis-moderation-success">
          <p>All inputs reviewed. Ready to run synthesis.</p>
        </div>
      )}

      {!loading && !queueIsDone && !pageError && (
        <div className="synthesis-moderation-list">
          {cards.map((card) => {
            const cardDisabled = card.state !== "active";
            const isRemoving = card.state === "removing";
            const isKept = card.state === "kept";
            return (
              <article
                key={card.id}
                className={`moderation-card ${isRemoving ? "is-removing" : ""} ${isKept ? "is-kept" : ""}`}
              >
                <div className={`moderation-type-badge type-${card.type}`}>{card.type.replace("_", " ")}</div>
                <p className="moderation-card-text">{card.text}</p>
                <p className="moderation-card-reason">{card.flagReason}</p>
                <p className="moderation-card-submitted">{formatSubmittedAt(card.submittedAt)}</p>
                <div className="moderation-actions">
                  <button
                    type="button"
                    className="moderation-keep-btn"
                    onClick={() => void handleKeep(card.id)}
                    disabled={cardDisabled}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className="moderation-remove-btn"
                    onClick={() => void handleRemove(card.id)}
                    disabled={cardDisabled}
                  >
                    Remove
                  </button>
                </div>
                {card.error && <p className="moderation-card-error">{card.error}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
