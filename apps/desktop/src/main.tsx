import React from "react";
import ReactDOM from "react-dom/client";
import { AppRouter } from "./app/router";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("No se encontró #root");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
);
