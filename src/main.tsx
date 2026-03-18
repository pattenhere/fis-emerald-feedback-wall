import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { UI_VARIANT } from "./config";
import { NewUILayout } from "./layouts/NewUILayout";
import { SynthesisModuleApp } from "./synthesis/SynthesisModuleApp";
import "./styles/reset.css";
import "./styles/styleguide.css";

const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
const isSynthesisRoute = pathname === "/synthesis" || pathname.startsWith("/synthesis/");
const LegacyLayout = App;
const RootComponent = isSynthesisRoute
  ? SynthesisModuleApp
  : UI_VARIANT === "newUI"
    ? NewUILayout
    : LegacyLayout;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
