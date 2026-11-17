import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, ChevronRight, Droplets, Play, RefreshCw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge, type Group, type LabInstance } from "@/lib/api";
import { getGroup, listChallenges } from "@/lib/platform";
import {
  challengeDifficulty,
  challengeHints,
  challengePoints,
  challengeSolved,
  connectionFields,
  formatTimerMMSS,
  groupBySection,
  groupBySet,
  setName,
  parseSubmittedFlags,
  pointsFromSubmitted,
  remainingSeconds,
  solvedCount,
} from "@/lib/challengeMeta";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { PageTabs } from "@/components/PageTabs";

type SetStats = Awaited<ReturnType<typeof api.groupSetStats>>;

export function StudentSetDetailPage() {
  const { id = "", setId = "" } = useParams();
  const setKey = decodeURIComponent(setId);
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [labs, setLabs] = useState<Challenge[]>([]);
  const [running, setRunning] = useState<LabInstance[]>([]);
  const [stats, setStats] = useState<SetStats | null>(null);
  const [timeoutSec, setTimeoutSec] = useState(7200);
  const [flagDraft, setFlagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pageTab, setPageTab] = useState("challenges");
  const [modalTab, setModalTab] = useState("details");
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    const [g, c, l, ver, st] = await Promise.all([
      getGroup(id),
      listChallenges(),
      api.listLabs(),
      api.version().catch(() => null),
      api.groupSetStats(id, setKey).catch(() => null),
    ]);
    setGroup(g);
    setStats(st);
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
        if (lab.image_tag && tags.has(lab.image_tag)) return true;
        const ch = labs.find((c) => c.id === lab.challenge_id);
        return ch ? tags.has(ch.image_tag) : false;
      }) ?? null
    );
  }, [running, labs]);

  const submitted = useMemo(() => {
    const fromRunning = parseSubmittedFlags(runningSet?.submitted_flags);
    if (fromRunning.length) return fromRunning;
    const tags = new Set(labs.map((ch) => ch.image_tag));
    const all: string[] = [];
    for (const lab of running) {
      const ch = labs.find((c) => c.id === lab.challenge_id);
      if (lab.image_tag && tags.has(lab.image_tag)) {
        all.push(...parseSubmittedFlags(lab.submitted_flags));
      } else if (ch && tags.has(ch.image_tag)) {
        all.push(...parseSubmittedFlags(lab.submitted_flags));
      }
    }
    return [...new Set(all)];
  }, [runningSet, running, labs]);

  const leftSec = runningSet ? remainingSeconds(runningSet.expires_at) : timeoutSec;
  void now;

  useEffect(() => {
    if (!runningSet?.expires_at) return;
    if (remainingSeconds(runningSet.expires_at) > 0) return;
    void load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftSec, runningSet?.id]);

  const active = labs.find((ch) => ch.id === activeId) ?? null;
  const sections = useMemo(() => groupBySection(labs), [labs]);
  const hasNamedSections = sections.some((s) => s.section);
  const bloods = stats?.bloods ?? {};
  const solves = stats?.solves ?? {};
  const solvers = stats?.solvers ?? {};
  const board = stats?.board ?? [];

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
      toast.success(t("lab_stopped"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "stop failed");
    } finally {
      setBusy(false);
    }
  };

  const resetSet = async () => {
    if (!runningSet || labs.length === 0) return;
    setBusy(true);
    try {
      await api.stopLab(runningSet.id);
      await api.startLab(labs[0].id);
      toast.success(t("lab_reset"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "reset failed");
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

  const onCopy = async (text: string) => {
    try {
      await copyText(text);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy_failed"));
    }
  };

  const title = setName(labs[0]?.image_tag || setKey);
  const ready = labs.every((ch) => ch.build_status === "ready") || labs.some((ch) => ch.build_status === "ready");
  const connect = runningSet ? connectionFields(runningSet) : [];
  const mySolved = solvedCount(labs, submitted);
  const myPoints = pointsFromSubmitted(labs, submitted);
  const totalPoints = labs.reduce((s, ch) => s + challengePoints(ch.flags), 0);

  const pageTabs = useMemo(
    () => [
      { id: "challenges", label: t("tab_challenges") },
      { id: "board", label: t("tab_board") },
    ],
    [t],
  );

  const modalTabs = useMemo(
    () => [
      { id: "details", label: t("tab_details") },
      {
        id: "solvers",
        label: `${t("tab_solvers")} (${active ? solves[active.id] || 0 : 0})`,
      },
    ],
    [t, active, solves],
  );

  const renderChallengeTile = (ch: Challenge) => {
    const pts = challengePoints(ch.flags);
    const done = challengeSolved(ch, submitted);
    const diff = challengeDifficulty(ch);
    const solveN = solves[ch.id] || 0;
    const fb = bloods[ch.id];
    return (
      <button
        key={ch.id}
        type="button"
        className={`tile-card challenge-tile tile-link status-${done ? "solved" : runningSet ? "ready" : "idle"}`}
        onClick={() => {
          setFlagDraft("");
          setModalTab("details");
          setActiveId(ch.id);
        }}
      >
        <div className="challenge-card-top">
          {diff ? <span className={`diff-label diff-${diff.toLowerCase()}`}>{diff}</span> : <span />}
          {done ? (
            <span className="solved-label">
              <CheckCircle2 size={15} /> {t("status_solved")}
            </span>
          ) : null}
        </div>
        <strong className="challenge-card-title">{ch.display_name || ch.name}</strong>
        <div className="challenge-card-foot">
          <span className="points-yellow">
            {pts} {t("points")}
          </span>
          <span className="small-text">
            {solveN} {t("solves")}
          </span>
        </div>
        <div className={`first-blood-slot${fb ? " has-fb" : ""}`}>
          {fb ? (
            <div className="first-blood-chip">
              <Droplets size={12} />
              <span>
                {t("first_blood")}: <strong>{fb}</strong>
              </span>
            </div>
          ) : null}
        </div>
      </button>
    );
  };

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
          <div className="page-head set-page-head">
            <div>
              <h1 style={{ margin: 0 }}>{title}</h1>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {labs.length} {t("challenges_count")} · {mySolved} {t("solved")} · {myPoints} / {totalPoints}{" "}
                {t("points")}
              </p>
            </div>
            {runningSet ? (
              <div className={`set-timer-live font-mono${leftSec <= 300 ? " is-urgent" : ""}`}>
                {formatTimerMMSS(leftSec)}
              </div>
            ) : null}
          </div>

          <section className="card panel-fill body-with-tabs">
            <PageTabs tabs={pageTabs} active={pageTab} onChange={setPageTab} />

            {pageTab === "challenges" ? (
              <div className="tab-panel">
                {!runningSet ? <p className="muted">{t("start_set_hint")}</p> : null}
                {hasNamedSections
                  ? sections.map(({ section, challenges }) => (
                      <div key={section || "_"} className="set-section">
                        <div className="set-section-head">
                          <h2 className="set-section-title">{section || t("challenges_title")}</h2>
                          <span className="small-text">
                            {challenges.length} {t("challenges_count")}
                          </span>
                        </div>
                        <div className="tile-grid">{challenges.map(renderChallengeTile)}</div>
                      </div>
                    ))
                  : (
                    <div className="set-section">
                      <div className="set-section-head">
                        <h2 className="set-section-title">{t("challenges_title")}</h2>
                        <span className="small-text">
                          {labs.length} {t("challenges_count")}
                        </span>
                      </div>
                      <div className="tile-grid">{labs.map(renderChallengeTile)}</div>
                    </div>
                  )}
              </div>
            ) : (
              <div className="tab-panel">
                <div className="row" style={{ marginBottom: 12 }}>
                  <strong>{t("tab_board")}</strong>
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
                      <div key={row.user_id} className="set-board-row">
                        <span className="font-mono">{i + 1}</span>
                        <span>
                          <strong>{row.username}</strong>
                        </span>
                        <span className="font-mono">{row.solved}</span>
                        <span className="font-mono">{row.first_bloods}</span>
                        <span className="font-mono points-yellow">{row.points}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
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
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="challenge-meta-row" style={{ marginTop: 0 }}>
                {challengeDifficulty(active) ? (
                  <span className={`diff-pill diff-${challengeDifficulty(active).toLowerCase()}`}>
                    {challengeDifficulty(active)}
                  </span>
                ) : null}
                <span className="points-yellow">
                  {challengePoints(active.flags)} {t("points")}
                </span>
              </div>
              <button type="button" className="icon-action" onClick={() => setActiveId(null)}>
                <X size={16} />
              </button>
            </div>

            <h3 style={{ margin: "0 0 12px" }}>{active.display_name || active.name}</h3>

            <PageTabs equal tabs={modalTabs} active={modalTab} onChange={setModalTab} />

            {modalTab === "solvers" ? (
              <div className="modal-tab-body">
                {(solvers[active.id] || []).length === 0 ? (
                  <p className="muted">{t("no_solvers")}</p>
                ) : (
                  <ul className="solver-list">
                    {(solvers[active.id] || []).map((s) => (
                      <li key={s.username + s.at}>
                        <strong>{s.username}</strong>
                        <span className="small-text">{new Date(s.at).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="modal-tab-body">
                {bloods[active.id] ? (
                  <div className="first-blood-chip first-blood-banner-chip">
                    <Droplets size={14} />
                    <span>
                      {t("first_blood")}: <strong>{bloods[active.id]}</strong>
                    </span>
                  </div>
                ) : null}

                <p style={{ marginTop: 0 }}>{active.description}</p>

                {challengeHints(active.flags).length > 0 ? (
                  <div className="hint-block hint-yellow">
                    <div className="hint-yellow-label">{t("hints")}</div>
                    <ul className="list">
                      {challengeHints(active.flags).map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="lab-machine-card">
                  <div className="lab-machine-head">
                    <strong>{t("challenge_lab")}</strong>
                    {runningSet ? (
                      <div className={`lab-machine-timer font-mono${leftSec <= 300 ? " is-urgent" : ""}`}>
                        {formatTimerMMSS(leftSec)}
                      </div>
                    ) : null}
                  </div>

                  {!runningSet ? (
                    <button type="button" className="btn-compact" disabled={busy || !ready} onClick={() => void startSet()}>
                      <Play size={14} /> {t("start_lab")}
                    </button>
                  ) : (
                    <>
                      {connect.length > 0 ? (
                        <div className="connect-panel">
                          <div className="small-text connect-panel-label">{t("connection")}</div>
                          {connect.map((field) => (
                            <button
                              key={field.id}
                              type="button"
                              className="connect-inline connect-copy"
                              title={t("copy")}
                              onClick={() => void onCopy(field.copyValue ?? field.value)}
                            >
                              <span className="connect-label">
                                {field.id === "password" ? t("password") : field.label}
                              </span>
                              <code className="font-mono connect-value">{field.value}</code>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="lab-machine-actions">
                        <button type="button" className="btn-compact secondary" disabled={busy} onClick={() => void resetSet()}>
                          <RefreshCw size={14} /> {t("reset_lab")}
                        </button>
                        <button type="button" className="btn-compact danger" disabled={busy} onClick={() => void stopSet()}>
                          <Square size={14} /> {t("stop_destroy")}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {runningSet ? (
                  challengeSolved(active, submitted) ? (
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
                  )
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
