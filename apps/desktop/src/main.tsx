import React from "react";
import ReactDOM from "react-dom/client";
import { AppRouter } from "./app/router";
import { loadLocale } from "./lib/i18n";
import { adoptUiScale, readUiScale } from "./lib/ui-scale";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

void Promise.all([loadLocale(), readUiScale().then(adoptUiScale)]).finally(
  () => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <AppRouter />
      </React.StrictMode>,
    );
  },
);
