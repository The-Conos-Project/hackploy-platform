import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, type Group } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { GroupTile } from "@/components/GroupTile";

export function StudentGroupsPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const data = await api.listGroups();
    setGroups(data.groups ?? []);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void load()
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
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
        <button type="button" className="btn-compact" onClick={() => setJoinOpen(true)}>
          {t("join_group")}
        </button>
      </div>

      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : groups.length === 0 ? (
        <section className="empty-state card panel-fill">
          <p className="muted" style={{ margin: 0 }}>
            {t("no_groups")}
          </p>
          <button type="button" className="secondary btn-compact" onClick={() => setJoinOpen(true)}>
            {t("join_group")}
          </button>
        </section>
      ) : (
        <div className="tile-panel panel-fill">
          <div className="tile-grid">
            {groups.map((g) => (
              <GroupTile key={g.id} group={g} to={`/groups/${g.id}`} />
            ))}
          </div>
        </div>
      )}

      {joinOpen ? (
        <div
          className="modal"
          style={{ display: "flex" }}
          onClick={(e) => e.target === e.currentTarget && setJoinOpen(false)}
        >
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
              <button type="submit" className="btn-compact" disabled={busy} style={{ marginTop: 12 }}>
                {t("join_group")}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
