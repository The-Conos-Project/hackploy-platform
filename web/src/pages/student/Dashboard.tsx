import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import { api, type Challenge, type Group, type LabInstance } from "@/lib/api";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import {
  challengePoints,
  formatDuration,
  groupBySet,
  remainingSeconds,
  setName,
} from "@/lib/challengeMeta";

type ActiveSet = {
  key: string;
  name: string;
  description: string;
  groupId: string;
  groupName: string;
  challenges: number;
  points: number;
  running: boolean;
  leftSec: number;
};

export function StudentDashboardPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [labs, setLabs] = useState<LabInstance[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void Promise.all([api.listGroups(), api.listChallenges(), api.listLabs()])
      .then(([g, c, l]) => {
        setGroups(g.groups ?? []);
        setChallenges(c.challenges ?? []);
        setLabs(l.labs ?? []);
      })
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const challengeMap = useMemo(() => {
    const m = new Map<string, Challenge>();
    for (const ch of challenges) m.set(ch.id, ch);
    return m;
  }, [challenges]);

  const active = useMemo(() => {
    const out: ActiveSet[] = [];
    const seen = new Set<string>();
    for (const g of groups) {
      const assigned = g.challenge_ids
        .map((cid) => challengeMap.get(cid))
        .filter(Boolean) as Challenge[];
      for (const [name, items] of groupBySet(assigned)) {
        const key = `${g.id}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const tag = items[0]?.image_tag;
        const lab =
          labs.find((l) => {
            if (l.status !== "running") return false;
            const ch = challengeMap.get(l.challenge_id);
            return ch?.image_tag === tag;
          }) ?? null;
        out.push({
          key,
          name,
          description: items[0]?.description || "",
          groupId: g.id,
          groupName: g.name,
          challenges: items.length,
          points: items.reduce((s, ch) => s + challengePoints(ch.flags), 0),
          running: !!lab,
          leftSec: lab ? remainingSeconds(lab.expires_at) : 0,
        });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, challengeMap, labs]);

  void now;

  return (
    <Shell role="student">
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{t("nav_dashboard")}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {t("student_dashboard_body")}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <section className="empty-state card panel-fill">
          <p className="muted" style={{ margin: 0 }}>
            {t("join_group_hint")}
          </p>
          <Link to="/groups" className="btn-compact">
            {t("nav_my_classes")}
          </Link>
        </section>
      ) : active.length === 0 ? (
        <section className="empty-state card panel-fill">
          <p className="muted" style={{ margin: 0 }}>
            {t("no_assigned_labs")}
          </p>
        </section>
      ) : (
        <div className="tile-panel panel-fill">
          <div className="tile-grid">
            {active.map((item) => (
              <Link
                key={item.key}
                to={`/groups/${item.groupId}/sets/${encodeURIComponent(item.name)}`}
                className="tile-card tile-link"
              >
                <div className="row" style={{ marginBottom: 8 }}>
                  <Layers size={18} />
                  <strong>{item.name || setName(item.name)}</strong>
                </div>
                <div className="small-text">{item.description || item.groupName}</div>
                <div className="tile-meta" style={{ marginTop: 12 }}>
                  <span>
                    {item.challenges} {t("challenges_count")}
                  </span>
                  <span>
                    {item.points} {t("points")}
                  </span>
                  {item.running ? (
                    <span className="font-mono">{formatDuration(item.leftSec)}</span>
                  ) : (
                    <span>{item.groupName}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
