import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function StudentSettingsPage() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const onSavePassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      toast.success(t("password_changed"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell role="student">
      <div className="settings-page">
        <div className="page-head">
          <div>
            <h1 style={{ margin: 0 }}>{t("nav_settings")}</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {t("student_settings_body")}
            </p>
          </div>
        </div>

        <section className="card panel-fill settings-card">
          <div className="tab-panel" style={{ padding: "18px 22px 22px" }}>
            <h2 style={{ marginTop: 0 }}>{t("nav_password")}</h2>
            <p className="muted">{t("password_body")}</p>
            <form onSubmit={(e) => void onSavePassword(e)} style={{ maxWidth: 420 }}>
              <label className="small-text">{t("current_password")}</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
              <label className="small-text" style={{ marginTop: 12, display: "block" }}>
                {t("new_password")}
              </label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button type="submit" disabled={busy} style={{ marginTop: 14 }}>
                {busy ? t("loading") : t("save")}
              </button>
            </form>
          </div>
        </section>
      </div>
    </Shell>
  );
}
