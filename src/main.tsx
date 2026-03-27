import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { UI_VARIANT } from "./config";
import { NewUILayout } from "./layouts/NewUILayout";
import { GreeterApp } from "./greeter/GreeterApp";
import { SynthesisModuleApp } from "./synthesis/SynthesisModuleApp";
import "./styles/reset.css";

const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
const isSynthesisRoute =
  pathname === "/synthesis" ||
  pathname.startsWith("/synthesis/") ||
  pathname === "/facilitator" ||
  pathname.startsWith("/facilitator/") ||
  pathname === "/admin" ||
  pathname.startsWith("/admin/") ||
  pathname.startsWith("/reveal/");
const isGreeterRoute = pathname === "/greeter" || pathname.startsWith("/greeter/");
const LegacyLayout = App;
const RootComponent = isGreeterRoute
  ? GreeterApp
  : isSynthesisRoute
    ? SynthesisModuleApp
    : UI_VARIANT === "newUI"
      ? NewUILayout
      : LegacyLayout;

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
