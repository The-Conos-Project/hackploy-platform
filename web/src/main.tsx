import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { AuthProvider } from "@/lib/auth";
import { AppToaster } from "@/components/toaster";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
        <AppToaster />
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
