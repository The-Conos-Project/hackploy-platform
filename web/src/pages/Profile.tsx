import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type PublicProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { toast } from "sonner";
import { CopyButton } from "@/components/CopyButton";

export function ProfilePage() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const isMine = !!user && user.role === "student" && user.id === profile?.id;

  useEffect(() => {
    void api
      .getProfile(slug)
      .then((p) => {
        setProfile(p);
        setHandle(p.handle || "");
        setMissing(false);
      })
      .catch(() => setMissing(true));
  }, [slug]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api.updateProfile(handle.trim());
      setProfile(p);
      toast.success(t("profile_saved"));
      await refresh();
      if (p.path !== `/u/${slug}`) {
        window.history.replaceState(null, "", p.path);
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const role = user?.role === "admin" ? "admin" : "student";
  const body = missing ? (
    <>
      <h1>{t("not_found_title")}</h1>
      <p className="muted">{t("not_found_body")}</p>
      <Link to="/">{t("go_home")}</Link>
    </>
  ) : !profile ? (
    <p className="muted">{t("loading")}</p>
  ) : (
    <>
      <h1>{profile.username}</h1>
      <p className="muted font-mono">{profile.path}</p>
      <section className="card" style={{ marginTop: 16, maxWidth: 440 }}>
        <div className="row">
          <div>
            <div className="small-text">{t("public_id")}</div>
            <div className="font-mono" style={{ marginTop: 4 }}>
              {profile.id}
            </div>
          </div>
          <CopyButton value={profile.path} />
        </div>
        {isMine ? (
          <form onSubmit={(e) => void onSave(e)} style={{ marginTop: 16 }}>
            <label className="small-text">{t("handle")}</label>
            <input
              className="font-mono"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              placeholder={profile.id}
              pattern="[a-z0-9_]{3,24}"
            />
            <p className="small-text" style={{ marginTop: 8 }}>
              {t("handle_hint")}
            </p>
            <button type="submit" disabled={busy} style={{ marginTop: 12 }}>
              {t("save")}
            </button>
          </form>
        ) : null}
      </section>
    </>
  );

  if (user) {
    return <Shell role={role}>{body}</Shell>;
  }
  return (
    <div className="auth-shell">
      <div className="auth-card">{body}</div>
    </div>
  );
}
