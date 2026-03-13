import React from "react";
import ReactDOM from "react-dom/client";
import { UniverseApp } from "./universe/UniverseApp";
import "./styles/reset.css";
import "./styles/styleguide.css";
import "./styles/universe.css";

ReactDOM.createRoot(document.getElementById("universe-root")!).render(
  <React.StrictMode>
    <UniverseApp />
  </React.StrictMode>,
);
