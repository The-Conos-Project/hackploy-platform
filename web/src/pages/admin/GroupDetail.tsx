import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Droplets, Layers, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge, type Group, type GroupAssignment } from "@/lib/api";
import { getGroup, listChallenges, listUsers } from "@/lib/platform";
import { challengePoints } from "@/lib/challengeMeta";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { PageTabs } from "@/components/PageTabs";
import { AssignLabsModal, type AssignmentDraft } from "@/components/AssignLabsModal";
import { copyText } from "@/lib/clipboard";

type BoardRow = {
  user_id: string;
  username: string;
  points: number;
  solved: number;
  first_bloods: number;
};

export function AdminGroupDetailPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [allChallenges, setAllChallenges] = useState<Challenge[]>([]);
  const [assignments, setAssignments] = useState<GroupAssignment[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string; path: string }[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState("assignments");

  const load = async () => {
    const [g, c, u, stats, asg] = await Promise.all([
      getGroup(id),
      listChallenges().catch(() => [] as Challenge[]),
      listUsers().catch(() => [] as { id: string; username: string; path: string }[]),
      api.groupSetStats(id).catch(() => null),
      api.listAssignments(id).catch(() => ({ assignments: [] as GroupAssignment[] })),
    ]);
    setGroup(g);
    setAllChallenges(c);
    setUsers(u);
    setBoard(stats?.board ?? []);
    setAssignments(asg.assignments ?? []);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    void load()
      .catch((cause) => {
        if (!alive) return;
        setNotFound(true);
        toast.error(cause instanceof Error ? cause.message : "load failed");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const challengeMap = useMemo(() => {
    const m = new Map<string, Challenge>();
    for (const ch of allChallenges) m.set(ch.id, ch);
    return m;
  }, [allChallenges]);

  const members = useMemo(() => {
    if (!group) return [];
    const map = new Map(users.map((u) => [u.id, u]));
    return group.member_ids.map((mid) => map.get(mid) ?? { id: mid, username: mid, path: `/u/${mid}` });
  }, [group, users]);

  const tabs = useMemo(
    () => [
      { id: "assignments", label: t("tab_assignments") },
      { id: "board", label: t("tab_board") },
      { id: "members", label: t("tab_members") },
    ],
    [t],
  );

  const onCreateAssignment = async (draft: AssignmentDraft) => {
    setBusy(true);
    try {
      await api.createAssignment(id, {
        set_key: draft.set_key,
        display_name: draft.display_name,
        deadline_at: draft.deadline_at || undefined,
        challenge_ids: draft.challenge_ids,
      });
      toast.success(t("labs_assigned"));
      setAssignOpen(false);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const removeAssignment = async (aid: string) => {
    setBusy(true);
    try {
      await api.deleteAssignment(id, aid);
      toast.success(t("labs_assigned"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell role="admin">
      <p className="small-text" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Link to="/admin/groups">{t("nav_classes")}</Link>
        <ChevronRight size={14} aria-hidden />
        <span>{loading ? "…" : group?.name || t("not_found_title")}</span>
      </p>

      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : notFound || !group ? (
        <section className="card">
          <h1 style={{ marginTop: 0 }}>{t("not_found_title")}</h1>
          <p className="muted">{t("not_found_body")}</p>
          <Link to="/admin/groups">{t("nav_classes")}</Link>
        </section>
      ) : (
        <>
          <div className="page-head">
            <div>
              <h1 style={{ margin: 0 }}>{group.name}</h1>
              <div className="group-id-row">
                <span className="small-text">{t("join_code")}</span>
                <code
                  className="font-mono group-id-value code-copy"
                  title={t("copy")}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    void copyText(group.join_code)
                      .then(() => toast.success(t("copied")))
                      .catch(() => toast.error(t("copy_failed")))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void copyText(group.join_code)
                        .then(() => toast.success(t("copied")))
                        .catch(() => toast.error(t("copy_failed")));
                    }
                  }}
                >
                  {group.join_code}
                </code>
                <span className="group-id-sep" aria-hidden />
                <span className="small-text">
                  {members.length} {t("students_count")}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-compact"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => setAssignOpen(true)}
            >
              <Plus size={16} /> {t("assign_new")}
            </button>
          </div>

          <section className="card panel-fill body-with-tabs">
            <PageTabs tabs={tabs} active={tab} onChange={setTab} />

            {tab === "assignments" ? (
              <div className="tab-panel">
                {assignments.length === 0 ? (
                  <div className="tab-empty">
                    <Layers size={28} className="tab-empty-icon" aria-hidden />
                    <p className="muted" style={{ margin: 0 }}>
                      {t("no_assigned_labs")}
                    </p>
                  </div>
                ) : (
                  <div className="assign-list">
                    {assignments.map((a) => {
                      const items = a.challenge_ids
                        .map((cid) => challengeMap.get(cid))
                        .filter(Boolean) as Challenge[];
                      const points = items.reduce((s, ch) => s + challengePoints(ch.flags), 0);
                      const setPath = a.set_key || a.display_name;
                      const locked =
                        a.deadline_at && new Date(a.deadline_at).getTime() < Date.now();
                      return (
                        <div key={a.id} className="assign-row admin-assign-row">
                          <Link
                            to={`/admin/groups/${group.id}/sets/${encodeURIComponent(setPath)}`}
                            className="assign-row-main"
                          >
                            <div className="assign-row-icon">
                              <Layers size={18} />
                            </div>
                            <div className="assign-row-body">
                              <strong>{a.display_name || a.set_key}</strong>
                              <div className="small-text">
                                {items.length} {t("challenges_count")} · {points} {t("points")}
                                {a.deadline_at
                                  ? ` · ${new Date(a.deadline_at).toLocaleString()}`
                                  : ""}
                              </div>
                            </div>
                            <span className="assign-row-status">
                              {locked ? t("assignment_locked") : t("open")}
                            </span>
                          </Link>
                          <button
                            type="button"
                            className="btn-compact secondary assign-row-action"
                            disabled={busy}
                            title={t("unassign_set")}
                            onClick={() => void removeAssignment(a.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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
                  <div className="tab-empty">
                    <Droplets size={28} className="tab-empty-icon" aria-hidden />
                    <p className="muted" style={{ margin: 0 }}>
                      {t("no_scores")}
                    </p>
                  </div>
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
                      <div key={row.user_id} className="set-board-row">
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
                  <div className="tab-empty">
                    <UserRound size={28} className="tab-empty-icon" aria-hidden />
                    <p className="muted" style={{ margin: 0 }}>
                      {t("no_members")}
                    </p>
                  </div>
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
                          <code className="small-text font-mono">{m.username}</code>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>

          {assignOpen ? (
            <AssignLabsModal
              title={`${t("assign_labs")} · ${group.name}`}
              challenges={allChallenges}
              onClose={() => setAssignOpen(false)}
              onSave={(draft) => void onCreateAssignment(draft)}
              busy={busy}
            />
          ) : null}
        </>
      )}
    </Shell>
  );
}
