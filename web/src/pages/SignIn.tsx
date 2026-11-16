import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { BrandMark } from "@/components/BrandMark";
import { LangSwitch } from "@/components/LangSwitch";

export function SignInPage() {
  const { t } = useI18n();
  const { user, setUser, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const isRoot = username.trim().toLowerCase() === "root";
      const next = isRoot
        ? await api.adminLogin("root", password)
        : await api.login(username.trim(), password);
      setUser(next);
      navigate(next.role === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch {
      toast.error(t("invalid_credentials"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered-page">
      <div className="centered-container">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LangSwitch />
        </div>
        <div className="card auth-card">
          <BrandMark />
          <h2 style={{ margin: "14px 0 6px" }}>{t("sign_in_title")}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {t("sign_in_body")}
          </p>
          <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
            <label htmlFor="username">{t("username")}</label>
            <input
              id="username"
              className="font-mono"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("username")}
              required
              autoFocus
            />
            <label htmlFor="password">{t("password")}</label>
            <input
              id="password"
              type="password"
              className="font-mono"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("password")}
              required
            />
            <button type="submit" style={{ width: "100%", marginTop: 4 }} disabled={busy}>
              {busy ? t("loading") : t("sign_in_button")}
            </button>
          </form>
          <p className="small-text" style={{ marginTop: 12 }}>
            <Link to="/reset-password">{t("forgot_password")}</Link>
          </p>
          <p className="small-text">
            {t("no_account")} <Link to="/sign-up">{t("sign_up_link")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
