import { useMemo, useState } from "react";
import { APP_AREAS, SCREENS_BY_APP } from "./state/seedData";
import type { AppArea, KudosRole } from "./types/domain";
import { makeId } from "./utils/id";

interface MobileFeature {
  id: string;
  app: AppArea;
  screenId: string;
  title: string;
  votes: number;
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

export const MobileApp = (): JSX.Element => {
  const initial = useMemo(loadState, []);
  const [activeTab, setActiveTab] = useState<"features" | "kudos">("features");
  const [features, setFeatures] = useState<MobileFeature[]>(initial.features);
  const [kudos, setKudos] = useState<MobileKudos[]>(initial.kudos);
  const [title, setTitle] = useState("");
  const [app, setApp] = useState<AppArea>(APP_AREAS[0].id);
  const [kudosText, setKudosText] = useState("");
  const [kudosRole, setKudosRole] = useState<KudosRole>("unspecified");
  const [consent, setConsent] = useState(false);

  const persist = (nextFeatures: MobileFeature[], nextKudos: MobileKudos[]): void => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ features: nextFeatures, kudos: nextKudos }));
  };

  const handleAddFeature = (): void => {
    if (!title.trim()) {
      return;
    }
    const screenId = SCREENS_BY_APP[app][0]?.id ?? "";
    const next = [{ id: makeId(), app, screenId, title: title.trim(), votes: 1 }, ...features];
    setFeatures(next);
    persist(next, kudos);
    setTitle("");
  };

  const handleVote = (id: string): void => {
    const next = features.map((item) => (item.id === id ? { ...item, votes: item.votes + 1 } : item));
    setFeatures(next);
    persist(next, kudos);
  };

  const handleAddKudos = (): void => {
    if (!kudosText.trim()) {
      return;
    }
    const next = [
      { id: makeId(), text: kudosText.trim(), role: kudosRole, consent },
      ...kudos,
    ];
    setKudos(next);
    persist(features, next);
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
        <button type="button" className={activeTab === "kudos" ? "is-active" : ""} onClick={() => setActiveTab("kudos")}>Kudos</button>
      </div>

      {activeTab === "features" ? (
        <section className="mobile-section">
          <div className="inline-form">
            <select value={app} onChange={(event) => setApp(event.target.value as AppArea)}>
              {APP_AREAS.map((area) => (
                <option key={area.id} value={area.id}>{area.label}</option>
              ))}
            </select>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add feature request" />
            <button type="button" className="primary-btn" onClick={handleAddFeature}>Save</button>
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
          <div className="inline-form">
            <textarea rows={4} value={kudosText} onChange={(event) => setKudosText(event.target.value)} placeholder="Share kudos" />
            <select value={kudosRole} onChange={(event) => setKudosRole(event.target.value as KudosRole)}>
              <option value="unspecified">Select role</option>
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
            <button type="button" className="primary-btn" onClick={handleAddKudos}>Submit</button>
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
