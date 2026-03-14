import { memo, type FormEvent, useState } from "react";
import type { KudosQuote, KudosRole } from "../../types/domain";

interface KudosPanelProps {
  items: KudosQuote[];
  onAdd: (quote: { text: string; role: KudosRole; consentPublic: boolean }) => void;
}

const ROLE_OPTIONS: KudosRole[] = ["ops", "eng", "product", "finance", "exec"];

export const KudosPanel = memo(({ items, onAdd }: KudosPanelProps): JSX.Element => {
  const [text, setText] = useState("");
  const [role, setRole] = useState<KudosRole>("unspecified");
  const [consentPublic, setConsentPublic] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!text.trim()) {
      setError("Quote text is required.");
      return;
    }
    setError("");
    onAdd({ text, role, consentPublic });
    setText("");
    setRole("unspecified");
    setConsentPublic(false);
  };

  return (
    <section className="panel-stack">
      <header>
        <h2>Kudos & Quotes</h2>
        <p>Role attribution is optional. Public quote usage is opt-in only.</p>
      </header>

      <form className="inline-form" onSubmit={handleSubmit}>
        <textarea
          placeholder="Share feedback or a quote"
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={800}
          required
        />
        <select value={role} onChange={(event) => setRole(event.target.value as KudosRole)}>
          <option value="unspecified">Select role (optional)</option>
          {ROLE_OPTIONS.map((roleOption) => (
            <option key={roleOption} value={roleOption}>
              {roleOption.toUpperCase()}
            </option>
          ))}
        </select>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={consentPublic}
            onChange={(event) => setConsentPublic(event.target.checked)}
          />
          <span>I consent to this quote being used publicly.</span>
        </label>
        <p className="privacy-notice">Your response is processed securely. No names are stored.</p>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="primary-btn" disabled={!text.trim()}>
          Submit Quote
        </button>
      </form>

      <ul className="list-reset panel-list">
        {items.map((quote) => (
          <li key={quote.id} className="quote-card">
            <p>{quote.text}</p>
            <p className="card-meta">
              Role: {quote.role.toUpperCase()} {quote.consentPublic ? " · ✓ Public OK" : " · Private"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
});
