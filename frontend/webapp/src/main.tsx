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
  let style = document.getElementById("mm-theme-root") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "mm-theme-root";
    document.head.appendChild(style);
  }
  style.textContent = themeRootCss;
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
