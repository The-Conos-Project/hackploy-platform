import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, ChevronRight, Play, RefreshCw, Square, Swords, X } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type Challenge,
  type Competition,
  type CompetitionEvent,
  type LabInstance,
  type Team,
  type TeamSolve,
} from "@/lib/api";
import { listChallenges } from "@/lib/platform";
import {
  challengeDifficulty,
  challengeHints,
  challengePoints,
  connectionFields,
  parseSubmittedFlags,
} from "@/lib/challengeMeta";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { PageTabs } from "@/components/PageTabs";
import { DynamicsChart } from "@/components/DynamicsChart";

export function StudentCompetitionDetailPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [comp, setComp] = useState<Competition | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<CompetitionEvent[]>([]);
  const [board, setBoard] = useState<{ team_id: string; team_name: string; points: number; solved: number }[]>([]);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [solves, setSolves] = useState<TeamSolve[]>([]);
  const [running, setRunning] = useState<LabInstance[]>([]);
  const [tab, setTab] = useState("challenges");
  const [teamName, setTeamName] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [active, setActive] = useState<Challenge | null>(null);
  const [flagDraft, setFlagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [c, ch, teamRes, stats, labs] = await Promise.all([
      api.getCompetition(id),
      listChallenges(),
      api.listCompetitionTeams(id),
      api.competitionStats(id).catch(() => null),
      api.listLabs().catch(() => ({ labs: [] as LabInstance[] })),
    ]);
    setComp(c);
    const ids = new Set(c.challenge_ids || []);
    setChallenges(ch.filter((x) => ids.has(x.id)));
    setTeams(teamRes.teams ?? []);
    setEvents(stats?.events ?? []);
    setBoard(stats?.board ?? []);
    setMyTeam(c.my_team ?? null);
    setSolves(c.my_solves ?? []);
    setRunning(labs.labs ?? []);
  };

  useEffect(() => {
    void load()
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"))
      .finally(() => setLoading(false));
    const tick = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const solvedSet = useMemo(() => new Set(solves.map((s) => s.challenge_id)), [solves]);
  const locked = comp?.status === "ended" || (comp?.ends_at ? new Date(comp.ends_at).getTime() < Date.now() : false);
  const live = comp?.status === "live" && !locked;

  const tabs = useMemo(
    () => [
      { id: "teams", label: t("tab_teams") },
      { id: "challenges", label: t("tab_challenges") },
      { id: "dynamics", label: t("tab_dynamics") },
    ],
    [t],
  );

  const createTeam = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const team = await api.createTeam(id, teamName.trim());
      setMyTeam(team);
      toast.success(t("team_created"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "create failed");
    } finally {
      setBusy(false);
    }
  };

  const joinTeam = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const team = await api.joinTeam(id, teamCode.trim());
      setMyTeam(team);
      toast.success(t("joined_team"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "join failed");
    } finally {
      setBusy(false);
    }
  };

  const runningFor = (ch: Challenge) =>
    running.find(
      (l) =>
        l.status === "running" &&
        (l.challenge_id === ch.id || l.image_tag === ch.image_tag),
    ) || null;

  const startLab = async (ch: Challenge) => {
    setBusy(true);
    try {
      await api.startLab(ch.id);
      toast.success(t("lab_started"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "start failed");
    } finally {
      setBusy(false);
    }
  };

  const stopLab = async (lab: LabInstance) => {
    setBusy(true);
    try {
      await api.stopLab(lab.id);
      toast.success(t("lab_stopped"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "stop failed");
    } finally {
      setBusy(false);
    }
  };

  const resetLab = async (ch: Challenge, lab: LabInstance) => {
    setBusy(true);
    try {
      await api.stopLab(lab.id);
      await api.startLab(ch.id);
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
    if (!active || !live) return;
    setBusy(true);
    try {
      const res = await api.submitCompetitionFlag(id, active.id, flagDraft.trim());
      if (res.partial) {
        toast.success(`${t("flag_accepted")} · ${res.completed}/${res.total}`);
      } else if (res.already) {
        toast.success(t("challenge_complete"));
      } else {
        toast.success(`${t("flag_accepted")} · +${res.points ?? 0}`);
      }
      setFlagDraft("");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "incorrect");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Shell role="student">
        <p className="muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!comp) {
    return (
      <Shell role="student">
        <section className="card">
          <h1>{t("not_found_title")}</h1>
          <Link to="/competitions">{t("nav_competitions")}</Link>
        </section>
      </Shell>
    );
  }

  const lab = active ? runningFor(active) : null;
  const connect = lab ? connectionFields(lab) : [];

  return (
    <Shell role="student">
      <p className="small-text" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Link to="/competitions">{t("nav_competitions")}</Link>
        <ChevronRight size={14} />
        <span>{comp.name}</span>
      </p>

      <div className="group-hero">
        <h1 style={{ margin: 0 }}>{comp.name}</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          <span className="status-badge">{comp.status}</span>
          {myTeam ? (
            <>
              {" "}
              · {t("team")}: <strong>{myTeam.name}</strong>{" "}
              <code className="font-mono">{myTeam.join_code}</code>
            </>
          ) : null}
        </p>
      </div>

      {!myTeam ? (
        <section className="card panel-fill" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t("join_or_create_team")}</h3>
          <form onSubmit={(e) => void createTeam(e)} style={{ marginBottom: 12 }}>
            <label className="small-text">{t("create_team")}</label>
            <div className="inline-field">
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
              <button type="submit" className="btn-compact" disabled={busy}>
                {t("create")}
              </button>
            </div>
          </form>
          <form onSubmit={(e) => void joinTeam(e)}>
            <label className="small-text">{t("join_team_code")}</label>
            <div className="inline-field">
              <input
                className="font-mono"
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                required
              />
              <button type="submit" className="btn-compact" disabled={busy}>
                {t("join")}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card panel-fill body-with-tabs">
        <PageTabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === "teams" ? (
          <div className="tab-panel">
            {teams.length === 0 ? (
              <div className="tab-empty">
                <Swords size={28} className="tab-empty-icon" />
                <p className="muted" style={{ margin: 0 }}>
                  {t("no_teams")}
                </p>
              </div>
            ) : (
              <>
                <ul className="member-list">
                  {teams.map((team) => (
                    <li key={team.id}>
                      <div className="member-row">
                        <strong>{team.name}</strong>
                        <span className="small-text">
                          {(team.members || []).map((m) => m.username).join(", ") || "—"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {board.length > 0 ? (
                  <div className="set-board" style={{ marginTop: 16 }}>
                    <div className="set-board-head">
                      <span>#</span>
                      <span>{t("team")}</span>
                      <span>{t("solved")}</span>
                      <span>{t("points")}</span>
                    </div>
                    {board.map((row, i) => (
                      <div key={row.team_id} className="set-board-row">
                        <span className="font-mono">{i + 1}</span>
                        <strong>{row.team_name}</strong>
                        <span className="font-mono">{row.solved}</span>
                        <span className="font-mono points-yellow">{row.points}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {tab === "challenges" ? (
          <div className="tab-panel">
            {!myTeam ? (
              <p className="muted">{t("join_team_first")}</p>
            ) : (
              <div className="challenge-grid">
                {challenges.map((ch) => {
                  const done = solvedSet.has(ch.id);
                  const diff = challengeDifficulty(ch);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      className={`challenge-card${done ? " is-solved" : ""}`}
                      onClick={() => setActive(ch)}
                    >
                      <div className="challenge-card-top">
                        {diff ? <span className={`diff-pill diff-${diff.toLowerCase()}`}>{diff}</span> : null}
                        {done ? (
                          <span className="solved-badge">
                            <CheckCircle2 size={14} /> {t("solved")}
                          </span>
                        ) : null}
                      </div>
                      <strong>{ch.display_name || ch.name}</strong>
                      <div className="challenge-card-foot">
                        <span className="points-yellow">
                          {challengePoints(ch.flags)} {t("points")}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {tab === "dynamics" ? (
          <div className="tab-panel">
            <DynamicsChart events={events} teams={teams} />
          </div>
        ) : null}
      </section>

      {active ? (
        <div className="modal" style={{ display: "flex" }} onClick={(e) => e.target === e.currentTarget && setActive(null)}>
          <div className="modal-content challenge-modal">
            <div className="row" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{active.display_name || active.name}</h3>
              <button type="button" className="icon-action" onClick={() => setActive(null)}>
                <X size={16} />
              </button>
            </div>
            <p>{active.description}</p>
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
              </div>
              {!lab ? (
                <button
                  type="button"
                  className="btn-compact"
                  disabled={busy || !live}
                  onClick={() => void startLab(active)}
                >
                  <Play size={14} /> {t("start_lab")}
                </button>
              ) : (
                <>
                  {connect.length > 0 ? (
                    <div className="connect-panel">
                      {connect.map((field) => (
                        <button
                          key={field.id}
                          type="button"
                          className="connect-inline connect-copy"
                          onClick={() =>
                            void copyText(field.copyValue ?? field.value).then(() =>
                              toast.success(t("copied")),
                            )
                          }
                        >
                          <span className="connect-label">{field.label}</span>
                          <code className="font-mono connect-value">{field.value}</code>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="lab-machine-actions">
                    <button type="button" className="btn-compact secondary" disabled={busy} onClick={() => void resetLab(active, lab)}>
                      <RefreshCw size={14} /> {t("reset_lab")}
                    </button>
                    <button type="button" className="btn-compact danger" disabled={busy} onClick={() => void stopLab(lab)}>
                      <Square size={14} /> {t("stop_destroy")}
                    </button>
                  </div>
                </>
              )}
            </div>

            {solvedSet.has(active.id) ? (
              <p className="muted" style={{ marginTop: 14 }}>
                {t("challenge_complete")}
              </p>
            ) : locked || !live ? (
              <p className="muted" style={{ marginTop: 14 }}>
                {t("competition_locked")}
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
                  />
                  <button type="submit" className="btn-compact" disabled={busy || !myTeam}>
                    {t("submit_flag")}
                  </button>
                </div>
              </form>
            )}
            {lab ? (
              <p className="small-text muted" style={{ marginTop: 8 }}>
                {parseSubmittedFlags(lab.submitted_flags).length} flags on machine
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
