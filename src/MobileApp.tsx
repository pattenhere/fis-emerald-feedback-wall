import { useEffect, useMemo, useState } from "react";
import type { KudosRole } from "./types/domain";
import { makeId } from "./utils/id";
import { dataApi } from "./services/dataApi";

interface MobileFeature {
  id: string;
  productId?: number;
  title: string;
  votes: number;
  workflowContext?: string;
}

interface MobileKudos {
  id: string;
  text: string;
  role: KudosRole;
  consent: boolean;
}

const STORAGE_KEY = "emerald-mobile-session-v1";

const loadState = (): { features: MobileFeature[]; kudos: MobileKudos[] } => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { features: [], kudos: [] };
    }
    return JSON.parse(raw) as { features: MobileFeature[]; kudos: MobileKudos[] };
  } catch {
    return { features: [], kudos: [] };
  }
};

const toMobileFeature = (item: {
  id: number | string;
  productId?: number;
  title: string;
  votes: number;
  workflowContext?: string;
}): MobileFeature => ({
  id: String(item.id),
  productId: typeof item.productId === "number" ? item.productId : undefined,
  title: item.title,
  votes: Number(item.votes ?? 0),
  workflowContext: item.workflowContext,
});

const toMobileKudos = (item: {
  id: number | string;
  text: string;
  role: KudosRole;
  consentPublic?: boolean;
}): MobileKudos => ({
  id: String(item.id),
  text: item.text,
  role: item.role,
  consent: Boolean(item.consentPublic),
});

export const MobileApp = (): JSX.Element => {
  const initial = useMemo(loadState, []);
  const [activeTab, setActiveTab] = useState<"features" | "kudos">("features");
  const [features, setFeatures] = useState<MobileFeature[]>(initial.features);
  const [kudos, setKudos] = useState<MobileKudos[]>(initial.kudos);
  const [defaultProductId, setDefaultProductId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [workflowContext, setWorkflowContext] = useState<string>("");
  const [kudosText, setKudosText] = useState("");
  const [kudosRole, setKudosRole] = useState<KudosRole>("unspecified");
  const [consent, setConsent] = useState(false);

  const persist = (nextFeatures: MobileFeature[], nextKudos: MobileKudos[]): void => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ features: nextFeatures, kudos: nextKudos }));
  };

  useEffect(() => {
    let cancelled = false;
    const loadFromApi = async (): Promise<void> => {
      try {
        const bootstrap = await dataApi.getBootstrap();
        if (cancelled) return;
        const firstProductId =
          Number(bootstrap.products.find((product) => Number.isFinite(Number(product.id)))?.id ?? 0) || null;
        setDefaultProductId(firstProductId);
        const apiFeatures = bootstrap.featureRequests.map(toMobileFeature);
        const apiKudos = bootstrap.kudosQuotes.map(toMobileKudos);
        setFeatures(apiFeatures);
        setKudos(apiKudos);
        persist(apiFeatures, apiKudos);
      } catch {
        // Keep session-backed fallback if API load fails.
      }
    };
    void loadFromApi();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddFeature = async (): Promise<void> => {
    if (!title.trim()) {
      return;
    }
    const resolvedProductId =
      defaultProductId ??
      features.find((item) => Number.isFinite(Number(item.productId)))?.productId ??
      1;
    const next = [{
      id: makeId(),
      productId: resolvedProductId,
      title: title.trim(),
      votes: 1,
      workflowContext: workflowContext.trim() || undefined,
    }, ...features];
    setFeatures(next);
    persist(next, kudos);
    try {
      await dataApi.addFeatureRequest({
        id: -Date.now(),
        productId: resolvedProductId,
        title: title.trim(),
        description: title.trim(),
        workflowContext: workflowContext.trim() || undefined,
        votes: 1,
        createdAt: new Date().toISOString(),
        status: "open",
        origin: "mobile",
      });
      const bootstrap = await dataApi.getBootstrap();
      const apiFeatures = bootstrap.featureRequests.map(toMobileFeature);
      setFeatures(apiFeatures);
      persist(apiFeatures, kudos);
    } catch (error) {
      // Keep optimistic local value if API write fails.
      // eslint-disable-next-line no-console
      console.error("[mobile] failed to persist feature request", error);
    }
    setTitle("");
    setWorkflowContext("");
  };

  const handleVote = async (id: string): Promise<void> => {
    const next = features.map((item) => (item.id === id ? { ...item, votes: item.votes + 1 } : item));
    setFeatures(next);
    persist(next, kudos);
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return;
    }
    try {
      await dataApi.upvoteFeatureRequest(numericId);
      const bootstrap = await dataApi.getBootstrap();
      const apiFeatures = bootstrap.featureRequests.map(toMobileFeature);
      setFeatures(apiFeatures);
      persist(apiFeatures, kudos);
    } catch {
      // Keep optimistic local vote if API write fails.
    }
  };

  const handleAddKudos = async (): Promise<void> => {
    if (!kudosText.trim()) {
      return;
    }

    const resolvedProductId =
      defaultProductId ??
      features.find((item) => Number.isFinite(Number(item.productId)))?.productId ??
      1;

    const next = [
      { id: makeId(), text: kudosText.trim(), role: kudosRole, consent },
      ...kudos,
    ];
    setKudos(next);
    persist(features, next);

    try {
      await dataApi.addKudos({
        id: -Date.now(),
        productId: resolvedProductId,
        text: kudosText.trim(),
        role: kudosRole,
        consentPublic: consent,
        createdAt: new Date().toISOString(),
      });
      const bootstrap = await dataApi.getBootstrap();
      const apiFeatures = bootstrap.featureRequests.map(toMobileFeature);
      const apiKudos = bootstrap.kudosQuotes.map(toMobileKudos);
      setFeatures(apiFeatures);
      setKudos(apiKudos);
      persist(apiFeatures, apiKudos);
    } catch (error) {
      // Keep optimistic local value if API write fails.
      // eslint-disable-next-line no-console
      console.error("[mobile] failed to persist comment", error);
    }

    setKudosText("");
    setKudosRole("unspecified");
    setConsent(false);
  };

  return (
    <div className="mobile-shell">
      <header className="mobile-header">
        <h1>Emerald Feedback Wall</h1>
        <p>Mobile companion</p>
      </header>

      <div className="mobile-tabs">
        <button type="button" className={activeTab === "features" ? "is-active" : ""} onClick={() => setActiveTab("features")}>Features</button>
        <button type="button" className={activeTab === "kudos" ? "is-active" : ""} onClick={() => setActiveTab("kudos")}>Comments</button>
      </div>

      {activeTab === "features" ? (
        <section className="mobile-section">
          <h2 className="mobile-section-heading">Feature Requests</h2>
          <div className="inline-form">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add Feature (press Enter to save)" />
            <input
              type="text"
              value={workflowContext}
              onChange={(event) => setWorkflowContext(event.target.value)}
              placeholder="Optional workflow context"
            />
            <button type="button" className="primary-btn" onClick={handleAddFeature}>Submit Feature</button>
          </div>
          <ul className="list-reset panel-list">
            {features.map((feature) => (
              <li key={feature.id} className="feature-card">
                <p className="card-title">{feature.title}</p>
                <button
                  type="button"
                  className={`vote-pill ${feature.votes >= 0 ? "is-positive" : "is-negative"}`}
                  onClick={() => handleVote(feature.id)}
                >
                  {feature.votes >= 0 ? "↑" : "↓"} {Math.abs(feature.votes)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mobile-section">
          <h2 className="mobile-section-heading">Comments</h2>
          <div className="inline-form">
            <textarea rows={4} value={kudosText} onChange={(event) => setKudosText(event.target.value)} placeholder="Share a comment or a quote" />
            <select value={kudosRole} onChange={(event) => setKudosRole(event.target.value as KudosRole)}>
              <option value="unspecified">Select role (optional)</option>
              <option value="ops">Ops</option>
              <option value="eng">Eng</option>
              <option value="product">Product</option>
              <option value="finance">Finance</option>
              <option value="exec">Exec</option>
            </select>
            <label className="checkbox-row">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>Public-safe quote</span>
            </label>
            <button type="button" className="primary-btn" onClick={handleAddKudos}>Submit Comment</button>
          </div>
          <ul className="list-reset panel-list">
            {kudos.map((item) => (
              <li key={item.id} className="quote-card">
                <p>{item.text}</p>
                <p className="card-meta">
                  {item.role.toUpperCase()} · {item.consent ? "Public OK" : "Private"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
