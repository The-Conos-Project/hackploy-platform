import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { type Challenge, type Group } from "@/lib/api";
import { assignLabs, getGroup, listChallenges } from "@/lib/platform";
import {
  challengeDifficulty,
  challengeHints,
  challengePoints,
  groupBySet,
  setName,
} from "@/lib/challengeMeta";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function AdminSetDetailPage() {
  const { id = "", setId = "" } = useParams();
  const setKey = decodeURIComponent(setId);
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [labs, setLabs] = useState<Challenge[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = async () => {
    const [g, c] = await Promise.all([getGroup(id), listChallenges()]);
    setGroup(g);
    const map = new Map(c.map((ch) => [ch.id, ch]));
    const assigned = g.challenge_ids.map((cid) => map.get(cid)).filter(Boolean) as Challenge[];
    const match = groupBySet(assigned).find(([name]) => name === setKey);
    if (!match) {
      setNotFound(true);
      setLabs([]);
      return;
    }
    setNotFound(false);
    setLabs(match[1]);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
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
  }, [id, setKey]);

  const title = setName(labs[0]?.image_tag || setKey);
  const totalPoints = useMemo(
    () => labs.reduce((s, ch) => s + challengePoints(ch.flags), 0),
    [labs],
  );

  const persistIds = async (ids: string[]) => {
    if (!group) return;
    setBusy(true);
    try {
      const g = await assignLabs(group.id, ids);
      setGroup(g);
      toast.success(t("labs_assigned"));
      const map = new Map((await listChallenges()).map((ch) => [ch.id, ch]));
      const assigned = g.challenge_ids.map((cid) => map.get(cid)).filter(Boolean) as Challenge[];
      const match = groupBySet(assigned).find(([name]) => name === setKey);
      setLabs(match?.[1] ?? []);
      if (!match) setNotFound(true);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const unassignSet = async () => {
    if (!group) return;
    const remove = new Set(labs.map((c) => c.id));
    const next = group.challenge_ids.filter((cid) => !remove.has(cid));
    await persistIds(next);
  };

  const unassignChallenge = async (challengeId: string) => {
    if (!group) return;
    const next = group.challenge_ids.filter((cid) => cid !== challengeId);
    await persistIds(next);
  };

  return (
    <Shell role="admin">
      <p className="small-text" style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <Link to="/admin/groups">{t("nav_classes")}</Link>
        <ChevronRight size={14} aria-hidden />
        <Link to={`/admin/groups/${id}`}>{loading ? "…" : group?.name || "…"}</Link>
        <ChevronRight size={14} aria-hidden />
        <span>{title}</span>
      </p>

      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : notFound || !group ? (
        <section className="card panel-fill">
          <h1 style={{ marginTop: 0 }}>{t("not_found_title")}</h1>
          <p className="muted">{t("not_found_body")}</p>
          <Link to={`/admin/groups/${id}`}>{t("nav_classes")}</Link>
        </section>
      ) : (
        <>
          <div className="page-head">
            <div>
              <h1 style={{ margin: 0 }}>{title}</h1>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {labs.length} {t("challenges_count")} · {totalPoints} {t("points")}
              </p>
            </div>
            <button
              type="button"
              className="btn-compact secondary"
              disabled={busy || labs.length === 0}
              onClick={() => void unassignSet()}
            >
              <Trash2 size={14} /> {t("unassign_set")}
            </button>
          </div>

          <section className="card panel-fill">
            {labs.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {t("no_assigned_labs")}
              </p>
            ) : (
              <div className="assign-list">
                {labs.map((ch) => {
                  const diff = challengeDifficulty(ch);
                  const hints = challengeHints(ch.flags);
                  return (
                    <div key={ch.id} className="assign-row admin-challenge-row">
                      <div className="assign-row-body">
                        <strong>{ch.display_name || ch.name}</strong>
                        <div className="small-text">{ch.description}</div>
                        <div className="tile-meta" style={{ marginTop: 8 }}>
                          {diff ? <span className={`diff-pill diff-${diff.toLowerCase()}`}>{diff}</span> : null}
                          <span className="points-yellow">
                            {challengePoints(ch.flags)} {t("points")}
                          </span>
                          {hints.length > 0 ? (
                            <span className="small-text">
                              {hints.length} {t("hints")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="icon-action"
                        title={t("unassign_challenge")}
                        disabled={busy}
                        onClick={() => void unassignChallenge(ch.id)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
