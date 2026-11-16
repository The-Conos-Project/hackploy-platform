import { Link } from "react-router-dom";
import { CircleAlert } from "lucide-react";
import { useI18n } from "@/i18n";
import { LangSwitch } from "@/components/LangSwitch";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="centered-page">
      <div className="centered-container">
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <CircleAlert />
          </div>
          <h2 style={{ marginTop: 0 }}>{t("not_found_title")}</h2>
          <p className="muted">{t("not_found_body")}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
            <Link to="/">
              <button type="button">{t("go_home")}</button>
            </Link>
            <Link to="/sign-in">
              <button type="button" className="secondary">
                {t("sign_in")}
              </button>
            </Link>
          </div>
          <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
            <LangSwitch />
          </div>
        </div>
      </div>
    </div>
  );
}
