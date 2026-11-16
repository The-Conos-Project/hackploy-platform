import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge, type Group } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function AdminGroupsPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [name, setName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Group | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [g, c] = await Promise.all([api.listGroups(), api.listChallenges()]);
    setGroups(g.groups ?? []);
    setChallenges(c.challenges ?? []);
  };

  useEffect(() => {
    void load().catch((cause) =>
      toast.error(cause instanceof Error ? cause.message : "load failed"),
    );
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

  const openAssign = (g: Group) => {
    setSelected(g);
    setPicked([...g.challenge_ids]);
  };

  const onAssign = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.assignLabs(selected.id, picked);
      setSelected(null);
      toast.success(t("labs_assigned"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "assign failed");
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

      {groups.length === 0 ? (
        <section className="empty-state card">
          <p className="muted" style={{ margin: 0 }}>
            {t("no_groups")}
          </p>
        </section>
      ) : (
        <section className="card">
          <ul className="list">
            {groups.map((g) => (
              <li key={g.id} className="row">
                <div>
                  <Link to={`/admin/groups/${g.id}`} className="group-title-link">
                    <strong>{g.name}</strong>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                  <div className="small-text font-mono" style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {t("join_code")}
                    <ChevronRight size={12} aria-hidden />
                    {g.join_code}
                  </div>
                  <div className="small-text" style={{ marginTop: 4 }}>
                    {g.member_ids.length} {t("members")} · {g.challenge_ids.length} {t("assigned_labs")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="secondary btn-compact" onClick={() => openAssign(g)}>
                    {t("assign_labs")}
                  </button>
                  <button
                    type="button"
                    className="secondary btn-compact"
                    disabled={busy}
                    onClick={() =>
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
                      })()
                    }
                  >
                    {t("delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {createOpen ? (
        <div className="modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}>
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

      {selected ? (
        <div className="modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal-content" style={{ width: "90%", maxWidth: 480 }}>
            <div className="row" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {t("assign_labs")}
                <ChevronRight size={16} aria-hidden />
                {selected.name}
              </h3>
              <button type="button" className="modal-close" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <ul className="list">
              {challenges.length === 0 ? <li>{t("no_challenges")}</li> : null}
              {challenges.map((ch) => {
                const on = picked.includes(ch.id);
                return (
                  <li key={ch.id}>
                    <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicked((prev) =>
                            on ? prev.filter((id) => id !== ch.id) : [...prev, ch.id],
                          )
                        }
                      />
                      <span>{ch.display_name || ch.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn-compact" disabled={busy} onClick={() => void onAssign()} style={{ marginTop: 12 }}>
              {t("save")}
            </button>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
