import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { UI_VARIANT } from "./config";
import { NewUILayout } from "./layouts/NewUILayout";
import { SynthesisModuleApp } from "./synthesis/SynthesisModuleApp";
import { initGanttShortcut } from "./utils/ganttShortcut";
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
const LegacyLayout = App;
const RootComponent = isSynthesisRoute
  ? SynthesisModuleApp
  : UI_VARIANT === "newUI"
    ? NewUILayout
    : LegacyLayout;

initGanttShortcut();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
