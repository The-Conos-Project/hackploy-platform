import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { api, type Group } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { toast } from "sonner";

export function StudentGroupsPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const load = async () => {
    const data = await api.listGroups();
    setGroups(data.groups ?? []);
  };

  useEffect(() => {
    void load().catch((cause) =>
      toast.error(cause instanceof Error ? cause.message : "load failed"),
    );
  }, []);

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.joinGroup(code.trim());
      setCode("");
      setJoinOpen(false);
      toast.success(t("joined_group"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "join failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell role="student">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{t("nav_my_classes")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("groups_student_body")}
          </p>
        </div>
        <button type="button" onClick={() => setJoinOpen(true)}>
          {t("join_group")}
        </button>
      </div>

      {groups.length === 0 ? (
        <section className="empty-state card">
          <p className="muted" style={{ margin: 0 }}>
            {t("no_groups")}
          </p>
          <button type="button" className="secondary" onClick={() => setJoinOpen(true)}>
            {t("join_group")}
          </button>
        </section>
      ) : (
        <section className="card">
          <ul className="list">
            {groups.map((g) => (
              <li key={g.id}>
                <Link to={`/groups/${g.id}`} className="group-title-link">
                  <strong>{g.name}</strong>
                  <ChevronRight size={16} aria-hidden />
                </Link>
                <div className="small-text" style={{ marginTop: 4 }}>
                  {g.challenge_ids.length} {t("assigned_labs")}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {joinOpen ? (
        <div className="modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setJoinOpen(false)}>
          <div className="modal-content" style={{ width: "90%", maxWidth: 420 }}>
            <div className="row" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>{t("join_group")}</h3>
              <button type="button" className="modal-close" onClick={() => setJoinOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={(e) => void onJoin(e)}>
              <label className="small-text">{t("join_code")}</label>
              <input
                className="font-mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
              />
              <button type="submit" disabled={busy} style={{ marginTop: 12 }}>
                {t("join_group")}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
