import { Link } from "react-router-dom";
import { Package, Terminal, Users } from "lucide-react";
import { useI18n } from "@/i18n";
import { BrandMark } from "@/components/BrandMark";
import { LangSwitch } from "@/components/LangSwitch";

export function LandingPage() {
  const { t } = useI18n();
  return (
    <>
      <header className="row topbar">
        <BrandMark />
        <div className="topbar-actions">
          <LangSwitch />
          <Link to="/sign-in">
            <button type="button" className="secondary">
              {t("sign_in")}
            </button>
          </Link>
          <Link to="/sign-up">
            <button type="button">{t("get_started")}</button>
          </Link>
        </div>
      </header>
      <section className="hero">
        <div className="badge">{t("badge")}</div>
        <h1>{t("hero_title")}</h1>
        <p>{t("hero_body")}</p>
        <Link to="/sign-up">
          <button type="button">{t("start_learning")}</button>
        </Link>
        <div className="grid" style={{ marginTop: 58, textAlign: "left" }}>
          <div className="card">
            <Package />
            <h3>{t("feature_isolated")}</h3>
            <p className="small-text">{t("feature_isolated_body")}</p>
          </div>
          <div className="card">
            <Users />
            <h3>{t("feature_classes")}</h3>
            <p className="small-text">{t("feature_classes_body")}</p>
          </div>
          <div className="card">
            <Terminal />
            <h3>{t("feature_docker")}</h3>
            <p className="small-text">{t("feature_docker_body")}</p>
          </div>
        </div>
      </section>
      <footer className="footer">{t("footer")}</footer>
    </>
  );
}
