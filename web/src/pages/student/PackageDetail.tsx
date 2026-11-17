import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Timer } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge, type Group, type LabInstance } from "@/lib/api";
import { getGroup, listChallenges } from "@/lib/platform";
import {
  challengePoints,
  formatDuration,
  groupByPackage,
  packageName,
} from "@/lib/challengeMeta";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function StudentPackageDetailPage() {
  const { id = "", pkg = "" } = useParams();
  const pkgKey = decodeURIComponent(pkg);
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [labs, setLabs] = useState<Challenge[]>([]);
  const [running, setRunning] = useState<LabInstance[]>([]);
  const [timeoutSec, setTimeoutSec] = useState(7200);
  const [flagDrafts, setFlagDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = async () => {
    const [g, c, l, ver] = await Promise.all([
      getGroup(id),
      listChallenges(),
      api.listLabs(),
      api.version().catch(() => null),
    ]);
    setGroup(g);
    if (ver?.instance_timeout_sec) setTimeoutSec(ver.instance_timeout_sec);
    const map = new Map(c.map((ch) => [ch.id, ch]));
    const assigned = g.challenge_ids.map((cid) => map.get(cid)).filter(Boolean) as Challenge[];
    const pkgs = groupByPackage(assigned);
    const match = pkgs.find(([name]) => name === pkgKey);
    if (!match) {
      setNotFound(true);
      setLabs([]);
      return;
    }
    setNotFound(false);
    setLabs(match[1]);
    setRunning(l.labs ?? []);
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
  }, [id, pkgKey]);

  const runningByChallenge = useMemo(() => {
    const m = new Map<string, LabInstance>();
    for (const lab of running) {
      if (lab.status === "running") m.set(lab.challenge_id, lab);
    }
    return m;
  }, [running]);

  const start = async (challengeId: string) => {
    setBusy(true);
    try {
      await api.startLab(challengeId);
      toast.success(t("lab_started"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "start failed");
    } finally {
      setBusy(false);
    }
  };

  const stop = async (labId: string) => {
    setBusy(true);
    try {
      await api.stopLab(labId);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "stop failed");
    } finally {
      setBusy(false);
    }
  };

  const extend = async (labId: string) => {
    setBusy(true);
    try {
      await api.extendLab(labId);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "extend failed");
    } finally {
      setBusy(false);
    }
  };

  const submitFlag = async (e: FormEvent, lab: LabInstance) => {
    e.preventDefault();
    const flag = (flagDrafts[lab.id] || "").trim();
    if (!flag) return;
    setBusy(true);
    try {
      const res = await api.submitFlag(lab.id, flag);
      toast.success(`${t("flag_accepted")} · ${res.completed}/${res.total} · +${res.points}`);
      setFlagDrafts((prev) => ({ ...prev, [lab.id]: "" }));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "flag failed");
    } finally {
      setBusy(false);
    }
  };

  const title = packageName(labs[0]?.image_tag || pkgKey);

  return (
    <Shell role="student">
      <p className="small-text" style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <Link to="/groups">{t("nav_my_classes")}</Link>
        <ChevronRight size={14} aria-hidden />
        <Link to={`/groups/${id}`}>{loading ? "…" : group?.name || "…"}</Link>
        <ChevronRight size={14} aria-hidden />
        <span>{title}</span>
      </p>

      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : notFound || !group ? (
        <section className="card panel-fill">
          <h1 style={{ marginTop: 0 }}>{t("not_found_title")}</h1>
          <p className="muted">{t("not_found_body")}</p>
          <Link to={`/groups/${id}`}>{t("nav_my_classes")}</Link>
        </section>
      ) : (
        <>
          <div className="page-head">
            <div>
              <h1 style={{ margin: 0 }}>{title}</h1>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {labs[0]?.description || t("pick_challenge")}
              </p>
            </div>
            <div className="timer-chip" title={t("lab_timer")}>
              <Timer size={14} />
              <span>
                {t("lab_timer")}: {formatDuration(timeoutSec)}
              </span>
            </div>
          </div>

          <div className="tile-panel panel-fill">
            <div className="tile-grid">
              {labs.map((ch) => {
                const lab = runningByChallenge.get(ch.id);
                const pts = challengePoints(ch.flags);
                return (
                  <div key={ch.id} className="tile-card station-tile">
                    <strong>{ch.display_name || ch.name}</strong>
                    <div className="small-text" style={{ marginTop: 6 }}>
                      {ch.description}
                    </div>
                    <div className="tile-meta" style={{ marginTop: 10 }}>
                      <span>
                        {pts} {t("points")}
                      </span>
                      <span>
                        <Timer size={12} /> {formatDuration(timeoutSec)}
                      </span>
                    </div>
                    <div className="station-actions">
                      {!lab ? (
                        <button
                          type="button"
                          className="btn-compact"
                          disabled={busy || ch.build_status !== "ready"}
                          onClick={() => void start(ch.id)}
                        >
                          {t("start_lab")}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn-compact secondary"
                            disabled={busy}
                            onClick={() => void extend(lab.id)}
                          >
                            {t("extend_lab")}
                          </button>
                          <button
                            type="button"
                            className="btn-compact secondary"
                            disabled={busy}
                            onClick={() => void stop(lab.id)}
                          >
                            {t("stop_lab")}
                          </button>
                        </>
                      )}
                    </div>
                    {lab ? (
                      <div style={{ marginTop: 12 }}>
                        <div className="small-text font-mono">
                          {[
                            lab.connection_type,
                            lab.host_port ? `:${lab.host_port}` : "",
                            lab.username || "",
                            lab.password || "",
                            lab.expires_at ? new Date(lab.expires_at).toLocaleString() : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <form
                          className="row"
                          style={{ marginTop: 10 }}
                          onSubmit={(e) => void submitFlag(e, lab)}
                        >
                          <input
                            className="font-mono"
                            value={flagDrafts[lab.id] || ""}
                            onChange={(e) =>
                              setFlagDrafts((prev) => ({ ...prev, [lab.id]: e.target.value }))
                            }
                            placeholder={t("flag_placeholder")}
                            style={{ flex: 1 }}
                            required
                          />
                          <button type="submit" className="btn-compact" disabled={busy}>
                            {t("submit_flag")}
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
