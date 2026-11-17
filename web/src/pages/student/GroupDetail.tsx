import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Layers } from "lucide-react";
import { toast } from "sonner";
import type { Challenge, Group } from "@/lib/api";
import { getGroup, listChallenges } from "@/lib/platform";
import { challengePoints, groupBySet } from "@/lib/challengeMeta";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function StudentGroupDetailPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    setGroup(null);

    void (async () => {
      try {
        const g = await getGroup(id);
        if (!alive) return;
        setGroup(g);
        const c = await listChallenges().catch(() => [] as Challenge[]);
        if (!alive) return;
        const map = new Map(c.map((ch) => [ch.id, ch]));
        setChallenges(g.challenge_ids.map((cid) => map.get(cid)).filter(Boolean) as Challenge[]);
      } catch (cause) {
        if (!alive) return;
        setNotFound(true);
        toast.error(cause instanceof Error ? cause.message : "load failed");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const sets = useMemo(() => groupBySet(challenges), [challenges]);

  return (
    <Shell role="student">
      <p className="small-text" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Link to="/groups">{t("nav_my_classes")}</Link>
        <ChevronRight size={14} aria-hidden />
        <span>{loading ? "…" : group?.name || t("not_found_title")}</span>
      </p>

      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : notFound || !group ? (
        <section className="card panel-fill">
          <h1 style={{ marginTop: 0 }}>{t("not_found_title")}</h1>
          <p className="muted">{t("not_found_body")}</p>
          <Link to="/groups">{t("nav_my_classes")}</Link>
        </section>
      ) : (
        <>
          <h1>{group.name}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {t("pick_set")}
          </p>
          {sets.length === 0 ? (
            <section className="empty-state card panel-fill">
              <p className="muted" style={{ margin: 0 }}>
                {t("no_assigned_labs")}
              </p>
            </section>
          ) : (
            <div className="tile-panel panel-fill">
              <div className="tile-grid">
                {sets.map(([name, items]) => {
                  const points = items.reduce((s, ch) => s + challengePoints(ch.flags), 0);
                  return (
                    <Link
                      key={name}
                      to={`/groups/${group.id}/sets/${encodeURIComponent(name)}`}
                      className="tile-card tile-link"
                    >
                      <div className="row" style={{ marginBottom: 8 }}>
                        <Layers size={18} />
                        <strong>{name}</strong>
                      </div>
                      <div className="small-text">
                        {items[0]?.description || t("challenges_in_set")}
                      </div>
                      <div className="tile-meta" style={{ marginTop: 12 }}>
                        <span>
                          {items.length} {t("challenges_count")}
                        </span>
                        <span>
                          {points} {t("points")}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
