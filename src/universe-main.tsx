import React from "react";
import ReactDOM from "react-dom/client";
import { UniverseApp } from "./universe/UniverseApp";
import "./styles/reset.css";
import "./styles/universe.css";

if (typeof window !== "undefined" && !(window as any).__emeraldGanttShortcutBound) {
  (window as any).__emeraldGanttShortcutBound = true;
  window.addEventListener("keydown", (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
    }
    const key = String(event.key || "").toLowerCase();
    if (!event.ctrlKey || event.metaKey || !event.shiftKey || key !== "m") return;
    event.preventDefault();
    window.open("/assets/fis-emerald-gantt.html", "_blank", "noopener,noreferrer");
  });
}

ReactDOM.createRoot(document.getElementById("universe-root")!).render(
  <React.StrictMode>
    <UniverseApp />
  </React.StrictMode>,
);
