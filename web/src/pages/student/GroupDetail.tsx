import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Droplets, Flag, Layers, Trophy, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge, type Group, type GroupAssignment, type LabInstance } from "@/lib/api";
import { getGroup, listChallenges } from "@/lib/platform";
import {
  challengePoints,
  groupBySet,
  parseSubmittedFlags,
  pointsFromSubmitted,
  solvedCount,
} from "@/lib/challengeMeta";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { PageTabs } from "@/components/PageTabs";

type Member = { id: string; username: string; path: string };
type BoardRow = {
  user_id: string;
  username: string;
  points: number;
  solved: number;
  first_bloods: number;
};

export function StudentGroupDetailPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [bloods, setBloods] = useState<Record<string, string>>({});
  const [labs, setLabs] = useState<LabInstance[]>([]);
  const [assignments, setAssignments] = useState<GroupAssignment[]>([]);
  const [tab, setTab] = useState("assignments");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    setGroup(null);

    void (async () => {
      try {
        const [g, mem, stats, labRes, c, asg] = await Promise.all([
          getGroup(id),
          api.groupMembers(id),
          api.groupSetStats(id).catch(() => null),
          api.listLabs().catch(() => ({ labs: [] as LabInstance[] })),
          listChallenges().catch(() => [] as Challenge[]),
          api.listAssignments(id).catch(() => ({ assignments: [] as GroupAssignment[] })),
        ]);
        if (!alive) return;
        setGroup(g);
        setMembers(mem.members ?? []);
        setBoard(stats?.board ?? []);
        setBloods(stats?.bloods ?? {});
        setLabs(labRes.labs ?? []);
        setAssignments(asg.assignments ?? []);
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
  const challengeMap = useMemo(() => {
    const m = new Map<string, Challenge>();
    for (const ch of challenges) m.set(ch.id, ch);
    return m;
  }, [challenges]);

  const submitted = useMemo(() => {
    const tags = new Set(challenges.map((ch) => ch.image_tag));
    const all: string[] = [];
    for (const lab of labs) {
      const ch = challenges.find((c) => c.id === lab.challenge_id);
      const tag = lab.image_tag || ch?.image_tag;
      if (!tag || !tags.has(tag)) continue;
      all.push(...parseSubmittedFlags(lab.submitted_flags));
    }
    return [...new Set(all)];
  }, [labs, challenges]);

  const mySolved = solvedCount(challenges, submitted);
  const myPoints = pointsFromSubmitted(challenges, submitted);
  const totalChallenges = challenges.length;
  const totalPoints = challenges.reduce((s, ch) => s + challengePoints(ch.flags), 0);
  const myBloods = useMemo(() => {
    if (!user?.username) return 0;
    return Object.values(bloods).filter((name) => name === user.username).length;
  }, [bloods, user?.username]);
  const setsTouched = useMemo(() => {
    let n = 0;
    for (const [, items] of sets) {
      if (solvedCount(items, submitted) > 0 || pointsFromSubmitted(items, submitted) > 0) n++;
    }
    return n;
  }, [sets, submitted]);

  const tabs = useMemo(
    () => [
      { id: "assignments", label: t("tab_assignments") },
      { id: "board", label: t("tab_board") },
      { id: "members", label: t("tab_members") },
      { id: "progress", label: t("tab_my_progress") },
    ],
    [t],
  );

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
          <div className="group-hero">
            <h1 style={{ margin: 0 }}>{group.name}</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {members.length} {t("students_count")}
            </p>
          </div>

          <section className="card panel-fill body-with-tabs">
            <PageTabs tabs={tabs} active={tab} onChange={setTab} />

            {tab === "assignments" ? (
              <div className="tab-panel">
                {assignments.length === 0 && sets.length === 0 ? (
                  <div className="tab-empty">
                    <Layers size={28} className="tab-empty-icon" aria-hidden />
                    <p className="muted" style={{ margin: 0 }}>
                      {t("no_assigned_labs")}
                    </p>
                  </div>
                ) : assignments.length > 0 ? (
                  <div className="assign-list">
                    {assignments.map((a) => {
                      const items = a.challenge_ids
                        .map((cid) => challengeMap.get(cid))
                        .filter(Boolean) as Challenge[];
                      const points = items.reduce((s, ch) => s + challengePoints(ch.flags), 0);
                      const solved = solvedCount(items, submitted);
                      const setPath = a.set_key || a.display_name;
                      const locked =
                        !!a.deadline_at && new Date(a.deadline_at).getTime() < Date.now();
                      return (
                        <Link
                          key={a.id}
                          to={`/groups/${group.id}/sets/${encodeURIComponent(setPath)}`}
                          className="assign-row"
                        >
                          <div className="assign-row-icon">
                            <Layers size={18} />
                          </div>
                          <div className="assign-row-body">
                            <strong>{a.display_name || a.set_key}</strong>
                            <div className="small-text">
                              {solved}/{items.length} {t("challenges_count")} · {points} {t("points")}
                              {a.deadline_at
                                ? ` · ${new Date(a.deadline_at).toLocaleString()}`
                                : ""}
                            </div>
                          </div>
                          <span className="assign-row-status">
                            {locked ? t("assignment_locked") : t("open")}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="assign-list">
                    {sets.map(([name, items]) => {
                      const points = items.reduce((s, ch) => s + challengePoints(ch.flags), 0);
                      const solved = solvedCount(items, submitted);
                      return (
                        <Link
                          key={name}
                          to={`/groups/${group.id}/sets/${encodeURIComponent(name)}`}
                          className="assign-row"
                        >
                          <div className="assign-row-icon">
                            <Layers size={18} />
                          </div>
                          <div className="assign-row-body">
                            <strong>{name}</strong>
                            <div className="small-text">
                              {solved}/{items.length} {t("challenges_count")} · {points} {t("points")}
                            </div>
                          </div>
                          <span className="assign-row-status">{t("open")}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "board" ? (
              <div className="tab-panel">
                <div className="row" style={{ marginBottom: 12 }}>
                  <strong>{t("group_scoreboard")}</strong>
                  <span className="small-text">
                    {board.length} {t("players")}
                  </span>
                </div>
                {board.length === 0 ? (
                  <p className="muted">{t("no_scores")}</p>
                ) : (
                  <div className="set-board">
                    <div className="set-board-head">
                      <span>#</span>
                      <span>{t("username")}</span>
                      <span>{t("solved")}</span>
                      <span>{t("first_bloods")}</span>
                      <span>{t("points")}</span>
                    </div>
                    {board.map((row, i) => (
                      <div
                        key={row.user_id}
                        className={`set-board-row${row.user_id === user?.id ? " is-me" : ""}`}
                      >
                        <span className="font-mono">{i + 1}</span>
                        <span>
                          <strong>{row.username}</strong>
                          {row.first_bloods > 0 ? (
                            <span className="fb-tag">
                              <Droplets size={10} /> {row.first_bloods}
                            </span>
                          ) : null}
                        </span>
                        <span className="font-mono">{row.solved}</span>
                        <span className="font-mono">{row.first_bloods}</span>
                        <span className="font-mono points-yellow">{row.points}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "members" ? (
              <div className="tab-panel">
                {members.length === 0 ? (
                  <p className="muted">{t("no_members")}</p>
                ) : (
                  <ul className="member-list">
                    {members.map((m) => (
                      <li key={m.id}>
                        <Link to={m.path} className="member-row">
                          <span className="member-avatar" aria-hidden>
                            <UserRound size={16} />
                          </span>
                          <span>
                            <strong>{m.username}</strong>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === "progress" ? (
              <div className="tab-panel">
                <h2 className="progress-title">{t("tab_my_progress")}</h2>
                <div className="progress-cards">
                  <div className="progress-card">
                    <div className="progress-card-label progress-sets">{t("sets")}</div>
                    <div className="progress-card-row">
                      <span>{t("in_progress")}</span>
                      <strong className="font-mono">
                        {setsTouched}/{sets.length}
                      </strong>
                    </div>
                    <div className="progress-card-row">
                      <span>{t("assigned_sets")}</span>
                      <strong className="font-mono">{sets.length}</strong>
                    </div>
                  </div>
                  <div className="progress-card">
                    <div className="progress-card-label progress-ctf">{t("ctf_challenges")}</div>
                    <div className="progress-card-row">
                      <span>{t("solved")}</span>
                      <strong className="font-mono">
                        {mySolved}/{totalChallenges}
                      </strong>
                    </div>
                    <div className="progress-card-row">
                      <span>{t("points")}</span>
                      <strong className="font-mono points-yellow">
                        {myPoints}/{totalPoints}
                      </strong>
                    </div>
                    <div className="progress-card-row">
                      <span>{t("first_bloods")}</span>
                      <strong className="font-mono">{myBloods}</strong>
                    </div>
                  </div>
                  <div className="progress-card">
                    <div className="progress-card-label progress-rank">{t("tab_board")}</div>
                    <div className="progress-card-row">
                      <span>{t("your_rank")}</span>
                      <strong className="font-mono">
                        {(() => {
                          const idx = board.findIndex((r) => r.user_id === user?.id);
                          return idx >= 0 ? `#${idx + 1}` : "—";
                        })()}
                      </strong>
                    </div>
                    <div className="progress-card-row">
                      <span>{t("players")}</span>
                      <strong className="font-mono">{board.length}</strong>
                    </div>
                  </div>
                </div>
                <div className="progress-icons muted small-text" style={{ marginTop: 14 }}>
                  <span>
                    <Flag size={12} /> {mySolved} {t("solved")}
                  </span>
                  <span>
                    <Trophy size={12} /> {myPoints} {t("points")}
                  </span>
                  <span>
                    <Droplets size={12} /> {myBloods} {t("first_bloods")}
                  </span>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}
    </Shell>
  );
}
