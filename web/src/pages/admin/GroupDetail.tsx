import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import type { Challenge, Group } from "@/lib/api";
import { assignLabs, getGroup, listChallenges, listUsers } from "@/lib/platform";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { AssignLabsModal } from "@/components/AssignLabsModal";
import { copyText } from "@/lib/clipboard";

export function AdminGroupDetailPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string; path: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
        setPicked([...g.challenge_ids]);

        const [c, u] = await Promise.all([
          listChallenges().catch(() => [] as Challenge[]),
          listUsers().catch(() => [] as { id: string; username: string; path: string }[]),
        ]);
        if (!alive) return;
        setChallenges(c);
        setUsers(u);
      } catch (cause) {
        if (!alive) return;
        setNotFound(true);
        setGroup(null);
        toast.error(cause instanceof Error ? cause.message : "load failed");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const challengeMap = useMemo(() => {
    const m = new Map<string, Challenge>();
    for (const ch of challenges) m.set(ch.id, ch);
    return m;
  }, [challenges]);

  const assigned = useMemo(
    () => (group?.challenge_ids ?? []).map((cid) => challengeMap.get(cid)).filter(Boolean) as Challenge[],
    [group, challengeMap],
  );

  const members = useMemo(() => {
    if (!group) return [];
    const map = new Map(users.map((u) => [u.id, u]));
    return group.member_ids.map((mid) => map.get(mid) ?? { id: mid, username: mid, path: `/u/${mid}` });
  }, [group, users]);

  const onSave = async () => {
    if (!group) return;
    setBusy(true);
    try {
      const g = await assignLabs(group.id, picked);
      setGroup(g);
      setAssignOpen(false);
      toast.success(t("labs_assigned"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "save failed");
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
                <span className="small-text">{t("group_id")}</span>
                <code className="font-mono group-id-value muted">{group.id}</code>
              </div>
            </div>
            <button
              type="button"
              className="btn-compact"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => {
                setPicked([...group.challenge_ids]);
                setAssignOpen(true);
              }}
            >
              <Plus size={16} /> {t("assign_new")}
            </button>
          </div>

          <section className="card section-block">
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{t("assigned_labs_title")}</h2>
            </div>
            {assigned.length === 0 ? (
              <div className="empty-assign">
                <p className="muted" style={{ margin: 0 }}>
                  {t("no_assigned_labs")}
                </p>
                <button
                  type="button"
                  className="secondary btn-compact"
                  onClick={() => {
                    setPicked([...group.challenge_ids]);
                    setAssignOpen(true);
                  }}
                >
                  <Plus size={14} /> {t("assign_new")}
                </button>
              </div>
            ) : (
              <div className="tile-panel">
                <div className="tile-grid">
                  {assigned.map((ch) => (
                    <div key={ch.id} className="tile-card">
                      <strong>{ch.display_name || ch.name}</strong>
                      <div className="small-text" style={{ marginTop: 6 }}>
                        {ch.description}
                      </div>
                      <span
                        className={`status-badge status-${ch.build_status === "ready" ? "success" : ch.build_status === "failed" ? "failed" : "building"}`}
                        style={{ marginTop: 10 }}
                      >
                        {ch.build_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="card section-block" style={{ marginTop: 18 }}>
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Users size={18} /> {t("group_members")}
              </h2>
              <span className="small-text">
                {members.length} {t("members")}
              </span>
            </div>
            {members.length === 0 ? (
              <p className="small-text">{t("no_members")}</p>
            ) : (
              <ul className="member-list">
                {members.map((m) => (
                  <li key={m.id} className="member-row">
                    <Link to={m.path} className="font-mono">
                      {m.username}
                    </Link>
                    <code className="small-text font-mono">{m.id}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {assignOpen ? (
            <AssignLabsModal
              title={`${t("assign_labs")} · ${group.name}`}
              challenges={challenges}
              selected={picked}
              onChange={setPicked}
              onClose={() => setAssignOpen(false)}
              onSave={() => void onSave()}
              busy={busy}
            />
          ) : null}
        </>
      )}
    </Shell>
  );
}
