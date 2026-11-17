import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Swords } from "lucide-react";
import { toast } from "sonner";
import { api, type Competition } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function StudentCompetitionsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [list, setList] = useState<Competition[]>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .listCompetitions()
      .then((res) => setList(res.competitions ?? []))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"))
      .finally(() => setLoading(false));
  }, []);

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await api.joinCompetition(code.trim());
      toast.success(t("joined_competition"));
      navigate(`/competitions/${c.id}`);
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
          <h1 style={{ margin: 0 }}>{t("nav_competitions")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("competitions_blurb")}
          </p>
        </div>
      </div>

      <section className="card panel-fill" style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => void onJoin(e)} className="inline-field">
          <input
            className="font-mono"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("competition_code")}
            required
          />
          <button type="submit" className="btn-compact" disabled={busy}>
            {t("join")}
          </button>
        </form>
      </section>

      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : list.length === 0 ? (
        <section className="card panel-fill">
          <div className="tab-empty">
            <Swords size={28} className="tab-empty-icon" />
            <p className="muted" style={{ margin: 0 }}>
              {t("no_competitions")}
            </p>
          </div>
        </section>
      ) : (
        <div className="tile-panel panel-fill">
          <div className="tile-grid">
            {list.map((c) => (
              <Link key={c.id} to={`/competitions/${c.id}`} className="tile-card tile-link">
                <div className="row" style={{ marginBottom: 8 }}>
                  <Swords size={18} />
                  <strong>{c.name}</strong>
                </div>
                <div className="tile-meta">
                  <span className="status-badge">{c.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
