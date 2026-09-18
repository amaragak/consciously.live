import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  applyColorScheme,
  colorSchemeBootScript,
  getStoredColorScheme,
  themeRootCss,
} from "@consciously/common/theme";
import { App } from "./App";
import "./index.css";

/** Apply shared theme CSS vars before first paint of React. */
function injectTheme(): void {
  if (typeof document === "undefined") return;
  if (!document.getElementById("mm-theme-root")) {
    const style = document.createElement("style");
    style.id = "mm-theme-root";
    style.textContent = themeRootCss;
    document.head.appendChild(style);
  }
  if (!document.getElementById("mm-color-scheme-boot")) {
    const boot = document.createElement("script");
    boot.id = "mm-color-scheme-boot";
    boot.textContent = colorSchemeBootScript;
    document.head.appendChild(boot);
  }
  applyColorScheme(getStoredColorScheme());
}

injectTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
