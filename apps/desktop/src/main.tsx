import React from "react";
import ReactDOM from "react-dom/client";
import { AppRouter } from "./app/router";
import { loadLocale } from "./lib/i18n";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

void loadLocale().finally(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AppRouter />
    </React.StrictMode>,
  );
});
