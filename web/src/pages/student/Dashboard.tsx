import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Droplets, Flag, Layers, Trophy, Users } from "lucide-react";
import { api, type Challenge, type Group, type LabInstance, type PublicProfile } from "@/lib/api";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { GroupTile } from "@/components/GroupTile";
import {
  challengePoints,
  formatTimerMMSS,
  groupBySet,
  parseSubmittedFlags,
  pointsFromSubmitted,
  remainingSeconds,
  setName,
  solvedCount,
} from "@/lib/challengeMeta";

type ActiveSet = {
  key: string;
  name: string;
  description: string;
  groupId: string;
  groupName: string;
  challenges: Challenge[];
  total: number;
  solved: number;
  points: number;
  earned: number;
  running: boolean;
  leftSec: number;
};

export function StudentDashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [labs, setLabs] = useState<LabInstance[]>([]);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void Promise.all([
      api.listGroups(),
      api.listChallenges(),
      api.listLabs(),
      user ? api.getProfile(user.username || user.id).catch(() => null) : Promise.resolve(null),
    ])
      .then(([g, c, l, p]) => {
        setGroups(g.groups ?? []);
        setChallenges(c.challenges ?? []);
        setLabs(l.labs ?? []);
        setProfile(p);
      })
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"));
  }, [user]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const challengeMap = useMemo(() => {
    const m = new Map<string, Challenge>();
    for (const ch of challenges) m.set(ch.id, ch);
    return m;
  }, [challenges]);

  const submittedByTag = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const lab of labs) {
      const ch = challengeMap.get(lab.challenge_id);
      const tag = lab.image_tag || ch?.image_tag;
      if (!tag) continue;
      const flags = parseSubmittedFlags(lab.submitted_flags);
      if (flags.length === 0) continue;
      const prev = map.get(tag) ?? [];
      map.set(tag, [...new Set([...prev, ...flags])]);
    }
    return map;
  }, [labs, challengeMap]);

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
        const submitted = tag ? submittedByTag.get(tag) ?? [] : [];
        const lab =
          labs.find((l) => {
            if (l.status !== "running") return false;
            if (l.image_tag && l.image_tag === tag) return true;
            const ch = challengeMap.get(l.challenge_id);
            return ch?.image_tag === tag;
          }) ?? null;
        out.push({
          key,
          name,
          description: items[0]?.description || "",
          groupId: g.id,
          groupName: g.name,
          challenges: items,
          total: items.length,
          solved: solvedCount(items, submitted),
          points: items.reduce((s, ch) => s + challengePoints(ch.flags), 0),
          earned: pointsFromSubmitted(items, submitted),
          running: !!lab,
          leftSec: lab ? remainingSeconds(lab.expires_at) : 0,
        });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, challengeMap, labs, submittedByTag]);

  void now;
  const greetingName = user?.username || "—";

  return (
    <Shell role="student">
      <div className="page-head dash-head">
        <div>
          <h1 style={{ margin: 0 }}>
            {t("dash_greeting")}, {greetingName}
          </h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {active.length} {t("dash_sets_live")}
          </p>
        </div>
      </div>

      <div className="dash-stats">
        <div className="dash-stat">
          <Users size={18} />
          <div>
            <div className="dash-stat-value font-mono">{groups.length}</div>
            <div className="small-text">{t("dash_classes")}</div>
          </div>
        </div>
        <div className="dash-stat">
          <Flag size={18} />
          <div>
            <div className="dash-stat-value font-mono">{profile?.solved ?? 0}</div>
            <div className="small-text">{t("flags_captured")}</div>
          </div>
        </div>
        <div className="dash-stat">
          <Trophy size={18} />
          <div>
            <div className="dash-stat-value font-mono">{profile?.points ?? 0}</div>
            <div className="small-text">{t("points")}</div>
          </div>
        </div>
        <div className="dash-stat">
          <Droplets size={18} />
          <div>
            <div className="dash-stat-value font-mono">{profile?.first_bloods ?? 0}</div>
            <div className="small-text">{t("first_bloods")}</div>
          </div>
        </div>
      </div>

      <div className="dash-section-head">
        <h2>{t("assigned_sets")}</h2>
      </div>

      {groups.length === 0 ? (
        <section className="empty-state card">
          <p className="muted" style={{ margin: 0 }}>
            {t("join_group_hint")}
          </p>
          <Link to="/groups" className="btn-compact">
            {t("nav_my_classes")}
          </Link>
        </section>
      ) : active.length === 0 ? (
        <section className="empty-state card">
          <p className="muted" style={{ margin: 0 }}>
            {t("no_assigned_labs")}
          </p>
        </section>
      ) : (
        <div className="tile-panel">
          <div className="tile-grid dash-set-grid">
            {active.map((item) => {
              const pct = item.total ? Math.round((item.solved / item.total) * 100) : 0;
              return (
                <Link
                  key={item.key}
                  to={`/groups/${item.groupId}/sets/${encodeURIComponent(item.name)}`}
                  className="tile-card tile-link dash-set-card"
                >
                  <div className="row" style={{ marginBottom: 8 }}>
                    <Layers size={18} />
                    <strong>{item.name || setName(item.name)}</strong>
                  </div>
                  <div className="small-text">{item.groupName}</div>
                  <div className="dash-progress">
                    <div className="dash-progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="tile-meta" style={{ marginTop: 10 }}>
                    <span className="font-mono">
                      {item.solved}/{item.total}
                    </span>
                    <span className="points-yellow">
                      {item.earned}/{item.points} {t("points")}
                    </span>
                    {item.running ? (
                      <span className="font-mono">{formatTimerMMSS(item.leftSec)}</span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="dash-section-head" style={{ marginTop: 22 }}>
        <h2>{t("nav_my_classes")}</h2>
        <Link to="/groups" className="small-text">
          {t("all_groups")}
        </Link>
      </div>

      {groups.length === 0 ? (
        <section className="empty-state card panel-fill">
          <p className="muted" style={{ margin: 0 }}>
            {t("no_groups")}
          </p>
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
    </Shell>
  );
}
