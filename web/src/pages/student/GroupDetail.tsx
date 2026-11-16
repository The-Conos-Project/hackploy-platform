import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge, type Group } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function StudentGroupDetailPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [g, c] = await Promise.all([api.getGroup(id), api.listChallenges()]);
        setGroup(g);
        const map = new Map((c.challenges ?? []).map((ch) => [ch.id, ch]));
        setChallenges(g.challenge_ids.map((cid) => map.get(cid)).filter(Boolean) as Challenge[]);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "load failed");
      }
    })();
  }, [id]);

  return (
    <Shell role="student">
      <p className="small-text" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Link to="/groups">{t("nav_my_classes")}</Link>
        <ChevronRight size={14} aria-hidden />
        <span>{group?.name || "…"}</span>
      </p>
      <h1>{group?.name || t("loading")}</h1>
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
        <p className="small-text" style={{ marginTop: 12 }}>
          <Link to="/dashboard">{t("nav_dashboard")}</Link>
        </p>
      </section>
    </Shell>
  );
}
