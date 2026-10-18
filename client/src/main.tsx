import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Fail clearly if the HTML entry page is missing the React mount point.
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error('Root element "#root" was not found.');

createRoot(rootElement).render(
  // StrictMode helps React surface unsafe patterns during development.
  <StrictMode>
    <App />
  </StrictMode>,
);
