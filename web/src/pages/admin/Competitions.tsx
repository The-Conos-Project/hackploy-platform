import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Swords, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Competition } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function AdminCompetitionsPage() {
  const { t } = useI18n();
  const [list, setList] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [maxTeams, setMaxTeams] = useState(16);
  const [duration, setDuration] = useState(120);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api.listCompetitions();
    setList(res.competitions ?? []);
  };

  useEffect(() => {
    void load()
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"))
      .finally(() => setLoading(false));
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await api.createCompetition({
        name: name.trim(),
        max_teams: maxTeams,
        duration_min: duration,
      });
      toast.success(t("competition_created"));
      setCreateOpen(false);
      setName("");
      setList((prev) => [c, ...prev]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "create failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusy(true);
    try {
      await api.deleteCompetition(id);
      setList((prev) => prev.filter((c) => c.id !== id));
      toast.success(t("deleted"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell role="admin">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{t("nav_competitions")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("competitions_blurb")}
          </p>
        </div>
        <button type="button" className="btn-compact" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> {t("create_competition")}
        </button>
      </div>

      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : list.length === 0 ? (
        <section className="card panel-fill">
          <div className="tab-empty">
            <Swords size={28} className="tab-empty-icon" aria-hidden />
            <p className="muted" style={{ margin: 0 }}>
              {t("no_competitions")}
            </p>
          </div>
        </section>
      ) : (
        <div className="tile-panel panel-fill">
          <div className="tile-grid">
            {list.map((c) => (
              <div key={c.id} className="tile-card" style={{ position: "relative" }}>
                <Link to={`/admin/competitions/${c.id}`} className="tile-link" style={{ display: "block" }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <Swords size={18} />
                    <strong>{c.name}</strong>
                  </div>
                  <div className="tile-meta">
                    <span className="status-badge">{c.status}</span>
                    <code className="font-mono small-text">{c.join_code}</code>
                  </div>
                </Link>
                <button
                  type="button"
                  className="icon-action danger"
                  style={{ position: "absolute", top: 10, right: 10 }}
                  disabled={busy}
                  title={t("delete")}
                  onClick={() => void onDelete(c.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {createOpen ? (
        <div className="modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}>
          <div className="modal-content" style={{ width: "90%", maxWidth: 420 }}>
            <div className="row" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>{t("create_competition")}</h3>
              <button type="button" className="modal-close" onClick={() => setCreateOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={(e) => void onCreate(e)}>
              <label className="small-text">{t("name")}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
              <label className="small-text">{t("max_teams")}</label>
              <input
                type="number"
                min={2}
                max={128}
                value={maxTeams}
                onChange={(e) => setMaxTeams(Number(e.target.value) || 16)}
              />
              <label className="small-text">{t("duration_min")}</label>
              <input
                type="number"
                min={15}
                max={1440}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 120)}
              />
              <button type="submit" className="btn-compact" disabled={busy} style={{ marginTop: 12 }}>
                {t("create")}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
