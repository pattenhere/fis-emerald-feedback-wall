import React from "react";
import ReactDOM from "react-dom/client";
import { UniverseApp } from "./universe/UniverseApp";
import { initGanttShortcut } from "./utils/ganttShortcut";
import "./styles/reset.css";
import "./styles/universe.css";

initGanttShortcut();

ReactDOM.createRoot(document.getElementById("universe-root")!).render(
  <React.StrictMode>
    <UniverseApp />
  </React.StrictMode>,
);
