import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Play, Square, Swords } from "lucide-react";
import { toast } from "sonner";
import { api, type Challenge, type Competition, type CompetitionEvent, type Team } from "@/lib/api";
import { listChallenges } from "@/lib/platform";
import { challengePoints, groupBySet, setName } from "@/lib/challengeMeta";
import { useI18n } from "@/i18n";
import { Shell } from "@/components/Shell";
import { PageTabs } from "@/components/PageTabs";
import { DynamicsChart } from "@/components/DynamicsChart";
import { Checkbox } from "@/components/Checkbox";
import { copyText } from "@/lib/clipboard";

export function AdminCompetitionDetailPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [comp, setComp] = useState<Competition | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<CompetitionEvent[]>([]);
  const [board, setBoard] = useState<{ team_id: string; team_name: string; points: number; solved: number }[]>([]);
  const [tab, setTab] = useState("settings");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [c, ch, teamRes, stats] = await Promise.all([
      api.getCompetition(id),
      listChallenges(),
      api.listCompetitionTeams(id),
      api.competitionStats(id).catch(() => null),
    ]);
    setComp(c);
    setChallenges(ch);
    setPicked(c.challenge_ids ?? []);
    setTeams(teamRes.teams ?? []);
    setEvents(stats?.events ?? []);
    setBoard(stats?.board ?? []);
  };

  useEffect(() => {
    void load()
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : "load failed"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sets = useMemo(() => groupBySet(challenges), [challenges]);
  const tabs = useMemo(
    () => [
      { id: "settings", label: t("tab_settings") },
      { id: "teams", label: t("tab_teams") },
      { id: "challenges", label: t("tab_challenges") },
      { id: "dynamics", label: t("tab_dynamics") },
    ],
    [t],
  );

  const saveChallenges = async () => {
    setBusy(true);
    try {
      await api.setCompetitionChallenges(id, picked);
      toast.success(t("saved"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      const c = await api.startCompetition(id);
      setComp(c);
      toast.success(t("competition_started"));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "start failed");
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    setBusy(true);
    try {
      const c = await api.endCompetition(id);
      setComp(c);
      toast.success(t("competition_ended"));
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "end failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Shell role="admin">
        <p className="muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!comp) {
    return (
      <Shell role="admin">
        <section className="card">
          <h1>{t("not_found_title")}</h1>
          <Link to="/admin/competitions">{t("nav_competitions")}</Link>
        </section>
      </Shell>
    );
  }

  return (
    <Shell role="admin">
      <p className="small-text" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Link to="/admin/competitions">{t("nav_competitions")}</Link>
        <ChevronRight size={14} />
        <span>{comp.name}</span>
      </p>

      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>{comp.name}</h1>
          <div className="group-id-row">
            <span className="status-badge">{comp.status}</span>
            <code
              className="font-mono group-id-value code-copy"
              role="button"
              tabIndex={0}
              onClick={() =>
                void copyText(comp.join_code)
                  .then(() => toast.success(t("copied")))
                  .catch(() => toast.error(t("copy_failed")))
              }
            >
              {comp.join_code}
            </code>
            <span className="small-text">
              {comp.duration_min} {t("minutes")} · {comp.max_teams} {t("max_teams")}
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {comp.status !== "live" && comp.status !== "ended" ? (
            <button type="button" className="btn-compact" disabled={busy || picked.length === 0} onClick={() => void start()}>
              <Play size={14} /> {t("start_competition")}
            </button>
          ) : null}
          {comp.status === "live" ? (
            <button type="button" className="btn-compact danger" disabled={busy} onClick={() => void end()}>
              <Square size={14} /> {t("end_competition")}
            </button>
          ) : null}
        </div>
      </div>

      <section className="card panel-fill body-with-tabs">
        <PageTabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === "settings" ? (
          <div className="tab-panel">
            <p className="muted">
              {t("competition_settings_hint")}
            </p>
            <div className="assign-sets">
              {sets.map(([name, labs]) => {
                const ids = labs.map((l) => l.id);
                const n = ids.filter((cid) => picked.includes(cid)).length;
                const checked = n === ids.length && n > 0;
                const indeterminate = n > 0 && n < ids.length;
                return (
                  <div key={name} className="assign-set">
                    <div className="assign-set-head">
                      <Checkbox
                        checked={checked}
                        indeterminate={indeterminate}
                        onChange={(on) => {
                          if (on) setPicked((prev) => [...new Set([...prev, ...ids])]);
                          else setPicked((prev) => prev.filter((id) => !ids.includes(id)));
                        }}
                      />
                      <strong>{name}</strong>
                      <span className="small-text">{labs.length}</span>
                    </div>
                    <ul className="assign-lab-list">
                      {labs.map((ch) => (
                        <li key={ch.id}>
                          <Checkbox
                            checked={picked.includes(ch.id)}
                            onChange={(on) =>
                              setPicked((prev) =>
                                on ? [...prev, ch.id] : prev.filter((x) => x !== ch.id),
                              )
                            }
                            label={ch.display_name || ch.name}
                          />
                          <span className="points-yellow">
                            {challengePoints(ch.flags)} {t("points")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn-compact" style={{ marginTop: 12 }} disabled={busy} onClick={() => void saveChallenges()}>
              {t("save")}
            </button>
          </div>
        ) : null}

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
              <ul className="member-list">
                {teams.map((team) => (
                  <li key={team.id}>
                    <div className="member-row">
                      <strong>{team.name}</strong>
                      <code className="font-mono small-text">{team.join_code}</code>
                      <span className="small-text">
                        {(team.members || []).map((m) => m.username).join(", ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
          </div>
        ) : null}

        {tab === "challenges" ? (
          <div className="tab-panel">
            <div className="assign-list">
              {(comp.challenge_ids || []).map((cid) => {
                const ch = challenges.find((c) => c.id === cid);
                if (!ch) return null;
                return (
                  <div key={cid} className="assign-row">
                    <div className="assign-row-body">
                      <strong>{ch.display_name || ch.name}</strong>
                      <div className="small-text">{setName(ch.image_tag)}</div>
                    </div>
                    <span className="points-yellow">
                      {challengePoints(ch.flags)} {t("points")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {tab === "dynamics" ? (
          <div className="tab-panel">
            <DynamicsChart events={events} teams={teams} />
          </div>
        ) : null}
      </section>
    </Shell>
  );
}
