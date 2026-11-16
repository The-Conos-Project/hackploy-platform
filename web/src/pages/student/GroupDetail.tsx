import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Challenge, Group } from "@/lib/api";
import { getGroup, listChallenges } from "@/lib/platform";
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
        <section className="card">
          <h1 style={{ marginTop: 0 }}>{t("not_found_title")}</h1>
          <p className="muted">{t("not_found_body")}</p>
          <Link to="/groups">{t("nav_my_classes")}</Link>
        </section>
      ) : (
        <>
          <h1>{group.name}</h1>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>{t("assigned_labs")}</h2>
            <ul className="list">
              {challenges.length === 0 ? <li>{t("no_assigned_labs")}</li> : null}
              {challenges.map((ch) => (
                <li key={ch.id}>
                  <strong>{ch.display_name || ch.name}</strong>
                  <div className="small-text">{ch.description}</div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Shell>
  );
}
