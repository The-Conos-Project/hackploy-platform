import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { BrandMark } from "@/components/BrandMark";
import { LangSwitch } from "@/components/LangSwitch";

export function SignUpPage() {
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
      const next = await api.register(username.trim(), password);
      setUser(next);
      navigate("/dashboard", { replace: true });
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "";
      toast.error(msg.includes("taken") || msg.includes("exists") ? t("username_exists") : msg || t("username_exists"));
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
          <h2 style={{ margin: "14px 0 6px" }}>{t("sign_up_title")}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {t("sign_up_body")}
          </p>
          <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
            <label htmlFor="username">{t("username")}</label>
            <input
              id="username"
              className="font-mono"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
            <label htmlFor="password">{t("password")}</label>
            <input
              id="password"
              type="password"
              className="font-mono"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <button type="submit" style={{ width: "100%", marginTop: 4 }} disabled={busy}>
              {busy ? t("loading") : t("sign_up_button")}
            </button>
          </form>
          <p className="small-text">
            {t("have_account")} <Link to="/sign-in">{t("sign_in")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
