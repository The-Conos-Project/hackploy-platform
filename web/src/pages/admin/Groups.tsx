import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Group } from "@/lib/api";
import { listGroups } from "@/lib/platform";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { GroupTile } from "@/components/GroupTile";

export function AdminGroupsPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setGroups(await listGroups());
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

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createGroup(name.trim());
      setName("");
      setCreateOpen(false);
      toast.success(t("group_created"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell role="admin">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{t("nav_classes")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("groups_admin_body")}
          </p>
        </div>
        <button
          type="button"
          className="btn-compact"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={16} /> {t("create_group")}
        </button>
      </div>

      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : groups.length === 0 ? (
        <section className="empty-state card panel-fill">
          <p className="muted" style={{ margin: 0 }}>
            {t("no_groups")}
          </p>
        </section>
      ) : (
        <div className="tile-panel panel-fill">
          <div className="tile-grid">
            {groups.map((g) => (
              <GroupTile
                key={g.id}
                group={g}
                to={`/admin/groups/${g.id}`}
                action={
                  <button
                    type="button"
                    className="icon-action"
                    title={t("delete")}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void (async () => {
                        setBusy(true);
                        try {
                          await api.deleteGroup(g.id);
                          toast.success(t("deleted"));
                          await load();
                        } catch (cause) {
                          toast.error(cause instanceof Error ? cause.message : "delete failed");
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                    disabled={busy}
                  >
                    <Trash2 size={15} />
                  </button>
                }
              />
            ))}
          </div>
        </div>
      )}

      {createOpen ? (
        <div
          className="modal"
          style={{ display: "flex" }}
          onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}
        >
          <div className="modal-content" style={{ width: "90%", maxWidth: 420 }}>
            <div className="row" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>{t("create_group")}</h3>
              <button type="button" className="modal-close" onClick={() => setCreateOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={(e) => void onCreate(e)}>
              <label className="small-text">{t("group_name")}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              <button type="submit" className="btn-compact" disabled={busy} style={{ marginTop: 12 }}>
                {t("create_group")}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
