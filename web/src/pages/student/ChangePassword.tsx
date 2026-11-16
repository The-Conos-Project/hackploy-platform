import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { toast } from "sonner";

export function ChangePasswordPage() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
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
      <h1>{t("nav_password")}</h1>
      <p className="muted">{t("password_body")}</p>
      <section className="card" style={{ maxWidth: 420 }}>
        <form onSubmit={(e) => void onSubmit(e)}>
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
      </section>
    </Shell>
  );
}
