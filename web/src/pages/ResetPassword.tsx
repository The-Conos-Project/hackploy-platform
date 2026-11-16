import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import { BrandMark } from "@/components/BrandMark";
import { LangSwitch } from "@/components/LangSwitch";

export function ResetPasswordPage() {
  const { t } = useI18n();
  return (
    <div className="centered-page">
      <div className="centered-container">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LangSwitch />
        </div>
        <div className="card auth-card">
          <BrandMark />
          <h2 style={{ margin: "14px 0 6px" }}>{t("forgot_password")}</h2>
          <p className="muted">{t("reset_body")}</p>
          <p className="small-text">
            <Link to="/sign-in">{t("back_sign_in")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
