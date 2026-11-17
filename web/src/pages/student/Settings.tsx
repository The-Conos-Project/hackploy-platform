import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { PageTabs } from "@/components/PageTabs";

export function StudentSettingsPage() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "password" ? "password" : "handle";
  const [handle, setHandle] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const tabs = useMemo(
    () => [
      { id: "handle", label: t("handle") },
      { id: "password", label: t("nav_password") },
    ],
    [t],
  );

  useEffect(() => {
    if (!user) return;
    void api
      .getProfile(user.handle || user.id)
      .then((p) => setHandle(p.handle || ""))
      .catch(() => setHandle(user.handle || ""));
  }, [user]);

  const setTab = (id: string) => {
    setParams(id === "handle" ? {} : { tab: id }, { replace: true });
  };

  const onSaveHandle = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api.updateProfile(handle.trim());
      toast.success(t("profile_saved"));
      await refresh();
      if (p.path) {
        /* keep settings page */
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

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
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{t("nav_settings")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("student_settings_body")}
          </p>
        </div>
      </div>

      <section className="card panel-fill body-with-tabs settings-card">
        <PageTabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === "handle" ? (
          <div className="tab-panel">
            <h2 style={{ marginTop: 0 }}>{t("handle")}</h2>
            <p className="muted">{t("handle_hint")}</p>
            <form onSubmit={(e) => void onSaveHandle(e)}>
              <label className="small-text">{t("handle")}</label>
              <div className="inline-field">
                <input
                  className="font-mono"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  placeholder={user?.id}
                  pattern="[a-z0-9_]{3,24}"
                />
                <button type="submit" className="btn-compact" disabled={busy}>
                  {t("save")}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="tab-panel">
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
        )}
      </section>
    </Shell>
  );
}
