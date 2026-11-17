import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Droplets, Flag, Trophy, UserRound } from "lucide-react";
import { api, type PublicProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function ProfilePage() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void api
      .getProfile(slug)
      .then((p) => {
        setProfile(p);
        setMissing(false);
      })
      .catch(() => setMissing(true));
  }, [slug]);

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
            <span className="small-text">{t("username")}</span>
            <code className="font-mono profile-id-value">{profile.username}</code>
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

      {(profile.awards?.length ?? 0) > 0 ? (
        <div style={{ marginTop: 18 }}>
          <strong>{t("awards")}</strong>
          <ul className="awards-list">
            {profile.awards!.map((a) => (
              <li key={a.id}>
                <Trophy size={14} />
                <span>{a.label || a.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );

  if (user) {
    return (
      <Shell role={shellRole}>
        <div className="profile-page">{body}</div>
      </Shell>
    );
  }
  return (
    <div className="auth-shell">
      <div className="auth-card">{body}</div>
    </div>
  );
}
