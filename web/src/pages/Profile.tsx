import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Droplets, Flag, Trophy, UserRound } from "lucide-react";
import { api, type PublicProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { toast } from "sonner";

export function ProfilePage() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const isMine = !!user && !!profile && user.id === profile.id;

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

  const shellRole = user?.role === "admin" ? "admin" : "student";
  const profileRole = profile?.role === "admin" ? "admin" : "student";
  const roleLabel = profileRole === "admin" ? t("role_admin") : t("role_student");

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
      <section className="card panel-fill profile-card">
        <div className="profile-hero">
          <div className="profile-avatar" aria-hidden>
            <UserRound size={36} className="profile-avatar-icon" strokeWidth={1.6} />
          </div>
          <div className="profile-hero-text">
            <div className="profile-name-row">
              <h1 style={{ margin: 0 }}>{profile.username}</h1>
              <span className={`role-pill role-${profileRole}`}>{roleLabel}</span>
            </div>
            <div className="profile-id-row">
              <span className="small-text">{t("public_id")}</span>
              <code className="font-mono profile-id-value">{profile.id}</code>
            </div>
          </div>
        </div>

        <div className="profile-stats">
          <div className="profile-stat">
            <Trophy size={18} />
            <div>
              <div className="profile-stat-value font-mono">{profile.points ?? 0}</div>
              <div className="small-text">{t("points")}</div>
            </div>
          </div>
          <div className="profile-stat">
            <Flag size={18} />
            <div>
              <div className="profile-stat-value font-mono">{profile.solved ?? 0}</div>
              <div className="small-text">{t("challenges_solved")}</div>
            </div>
          </div>
          <div className="profile-stat">
            <Droplets size={18} />
            <div>
              <div className="profile-stat-value font-mono">{profile.first_bloods ?? 0}</div>
              <div className="small-text">{t("first_bloods")}</div>
            </div>
          </div>
        </div>

        {isMine && user?.role !== "admin" ? (
          <form onSubmit={(e) => void onSave(e)} className="profile-handle-form">
            <label className="small-text">{t("handle")}</label>
            <div className="inline-field">
              <input
                className="font-mono"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                placeholder={profile.id}
                pattern="[a-z0-9_]{3,24}"
              />
              <button type="submit" className="btn-compact" disabled={busy}>
                {t("save")}
              </button>
            </div>
            <p className="small-text" style={{ marginTop: 8 }}>
              {t("handle_hint")}
            </p>
          </form>
        ) : null}
      </section>
    </>
  );

  if (user) {
    return <Shell role={shellRole}>{body}</Shell>;
  }
  return (
    <div className="auth-shell">
      <div className="auth-card">{body}</div>
    </div>
  );
}
