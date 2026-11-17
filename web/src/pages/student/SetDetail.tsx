import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, ChevronRight, Circle, Copy, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge, type Group, type LabInstance } from "@/lib/api";
import { getGroup, listChallenges } from "@/lib/platform";
import {
  challengePoints,
  challengeSolved,
  formatDuration,
  groupBySet,
  setName,
  parseFlagSpecs,
  parseSubmittedFlags,
  remainingSeconds,
  sshSnippet,
} from "@/lib/challengeMeta";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";

export function StudentSetDetailPage() {
  const { id = "", setId = "" } = useParams();
  const setKey = decodeURIComponent(setId);
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [labs, setLabs] = useState<Challenge[]>([]);
  const [running, setRunning] = useState<LabInstance[]>([]);
  const [timeoutSec, setTimeoutSec] = useState(7200);
  const [flagDraft, setFlagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
    const sets = groupBySet(assigned);
    const match = sets.find(([name]) => name === setKey);
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
  }, [id, setKey]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const runningSet = useMemo(() => {
    const tags = new Set(labs.map((ch) => ch.image_tag));
    return (
      running.find((lab) => {
        if (lab.status !== "running") return false;
        const ch = labs.find((c) => c.id === lab.challenge_id);
        return ch ? tags.has(ch.image_tag) : false;
      }) ?? null
    );
  }, [running, labs]);

  const submitted = useMemo(
    () => parseSubmittedFlags(runningSet?.submitted_flags),
    [runningSet],
  );

  const leftSec = runningSet ? remainingSeconds(runningSet.expires_at) : timeoutSec;
  void now; // drive re-render for countdown

  useEffect(() => {
    if (!runningSet?.expires_at) return;
    if (remainingSeconds(runningSet.expires_at) > 0) return;
    void load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftSec, runningSet?.id]);

  const active = labs.find((ch) => ch.id === activeId) ?? null;

  const startSet = async () => {
    if (labs.length === 0) return;
    setBusy(true);
    try {
      await api.startLab(labs[0].id);
      toast.success(t("lab_started"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "start failed");
    } finally {
      setBusy(false);
    }
  };

  const stopSet = async () => {
    if (!runningSet) return;
    setBusy(true);
    try {
      await api.stopLab(runningSet.id);
      setActiveId(null);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "stop failed");
    } finally {
      setBusy(false);
    }
  };

  const extendSet = async () => {
    if (!runningSet) return;
    setBusy(true);
    try {
      await api.extendLab(runningSet.id);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "extend failed");
    } finally {
      setBusy(false);
    }
  };

  const submitFlag = async (e: FormEvent) => {
    e.preventDefault();
    if (!runningSet || !active) return;
    const flag = flagDraft.trim();
    if (!flag) return;
    setBusy(true);
    try {
      const res = await api.submitFlag(runningSet.id, flag, { challengeId: active.id });
      toast.success(`${t("flag_accepted")} · ${res.completed}/${res.total} · +${res.points}`);
      setFlagDraft("");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "flag failed");
    } finally {
      setBusy(false);
    }
  };

  const onCopySnippet = async (text: string) => {
    try {
      await copyText(text);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy_failed"));
    }
  };

  const title = setName(labs[0]?.image_tag || setKey);
  const ready = labs.every((ch) => ch.build_status === "ready") || labs.some((ch) => ch.build_status === "ready");

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
            <div className="set-actions">
              <div className={`timer-chip${runningSet && leftSec <= 300 ? " is-urgent" : ""}`}>
                <Timer size={14} />
                <span className="font-mono">
                  {t("lab_timer")}: {formatDuration(runningSet ? leftSec : timeoutSec)}
                </span>
              </div>
              {!runningSet ? (
                <button type="button" className="btn-compact" disabled={busy || !ready} onClick={() => void startSet()}>
                  {t("start_lab")}
                </button>
              ) : (
                <>
                  <button type="button" className="btn-compact secondary" disabled={busy} onClick={() => void extendSet()}>
                    {t("extend_lab")}
                  </button>
                  <button type="button" className="btn-compact secondary" disabled={busy} onClick={() => void stopSet()}>
                    {t("stop_lab")}
                  </button>
                </>
              )}
            </div>
          </div>

          {runningSet ? (
            <section className="card connection-banner">
              <div className="row" style={{ marginBottom: 8 }}>
                <strong>{t("connection")}</strong>
                <button
                  type="button"
                  className="icon-action"
                  title={t("copy")}
                  onClick={() => void onCopySnippet(sshSnippet(runningSet))}
                >
                  <Copy size={15} />
                </button>
              </div>
              <pre className="command font-mono">{sshSnippet(runningSet)}</pre>
            </section>
          ) : (
            <p className="muted">{t("start_set_hint")}</p>
          )}

          <div className="tile-panel panel-fill">
            <div className="tile-grid">
              {labs.map((ch) => {
                const pts = challengePoints(ch.flags);
                const done = challengeSolved(ch, submitted);
                const status = done ? "solved" : runningSet ? "ready" : "idle";
                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={`tile-card challenge-tile tile-link status-${status}`}
                    onClick={() => {
                      setFlagDraft("");
                      setActiveId(ch.id);
                    }}
                  >
                    <div className="row" style={{ marginBottom: 6 }}>
                      <strong>{ch.display_name || ch.name}</strong>
                      {done ? <CheckCircle2 size={16} className="status-icon ok" /> : <Circle size={16} className="status-icon" />}
                    </div>
                    <div className="small-text">{ch.description}</div>
                    <div className="tile-meta" style={{ marginTop: 10 }}>
                      <span>
                        {pts} {t("points")}
                      </span>
                      <span className="small-text">
                        {done ? t("status_solved") : runningSet ? t("status_ready") : t("status_locked")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {active ? (
        <div
          className="modal"
          style={{ display: "flex" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveId(null);
          }}
        >
          <div className="modal-content challenge-modal">
            <div className="row" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{active.display_name || active.name}</h3>
                <div className="small-text">
                  {challengePoints(active.flags)} {t("points")}
                  {" · "}
                  {challengeSolved(active, submitted) ? t("status_solved") : runningSet ? t("status_ready") : t("status_locked")}
                </div>
              </div>
              <button type="button" className="icon-action" onClick={() => setActiveId(null)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ marginTop: 0 }}>{active.description}</p>

            {parseFlagSpecs(active.flags).some((f) => (f.hints?.length ?? 0) > 0) ? (
              <div className="hint-block">
                <div className="small-text" style={{ marginBottom: 6 }}>
                  {t("hints")}
                </div>
                <ul className="list">
                  {parseFlagSpecs(active.flags).flatMap((f) => f.hints || []).map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {runningSet ? (
              <>
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="small-text">{t("connection")}</span>
                  <button
                    type="button"
                    className="icon-action"
                    title={t("copy")}
                    onClick={() => void onCopySnippet(sshSnippet(runningSet))}
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <pre className="command font-mono">{sshSnippet(runningSet)}</pre>

                {challengeSolved(active, submitted) ? (
                  <p className="muted" style={{ marginTop: 14 }}>
                    {t("challenge_complete")}
                  </p>
                ) : (
                  <form onSubmit={(e) => void submitFlag(e)} style={{ marginTop: 14 }}>
                    <label className="small-text">{t("submit_flag")}</label>
                    <div className="inline-field">
                      <input
                        className="font-mono"
                        value={flagDraft}
                        onChange={(e) => setFlagDraft(e.target.value)}
                        placeholder={t("flag_placeholder")}
                        required
                        autoFocus
                      />
                      <button type="submit" className="btn-compact" disabled={busy}>
                        {t("submit_flag")}
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <p className="muted">{t("start_set_hint")}</p>
            )}
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
