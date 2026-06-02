import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n/I18nContext";
import { StoreProvider } from "./store/StoreContext";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StoreProvider>
  </StrictMode>
);
