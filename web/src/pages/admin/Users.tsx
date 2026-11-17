import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import { listUsers } from "@/lib/platform";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

type Row = { id: string; username: string; handle?: string; path: string; role?: string };

export function AdminUsersPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void listUsers()
      .then((list) => {
        if (!alive) return;
        setUsers(list);
      })
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Shell role="admin">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{t("nav_users")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("users_body")}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : users.length === 0 ? (
        <section className="empty-state card panel-fill">
          <p className="muted" style={{ margin: 0 }}>
            {t("no_users")}
          </p>
        </section>
      ) : (
        <div className="tile-panel panel-fill">
          <div className="tile-grid">
            {users.map((u) => (
              <Link key={u.id} to={u.path || `/u/${u.id}`} className="tile-card tile-link">
                <div className="row" style={{ marginBottom: 8 }}>
                  <UserRound size={18} />
                  <strong>{u.username}</strong>
                </div>
                <div className="small-text font-mono">{u.id}</div>
                <div className="tile-meta" style={{ marginTop: 10 }}>
                  <span>{u.role === "admin" ? t("role_admin") : t("role_student")}</span>
                  {u.handle ? <span>@{u.handle}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
